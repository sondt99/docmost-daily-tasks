import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageService } from '../../core/page/services/page.service';
import { sql } from 'kysely';
import {
  DailySections,
  buildDailyDoc,
  isWorkingDay,
} from './daily-task.util';
import {
  DEFAULT_TZ,
  DailyCarryOverService,
  dailySections,
  dailyTitle,
} from './daily-carry-over.service';

const DEFAULT_CRON = '0 6 * * 1-5';
const CRON_JOB_NAME = 'daily-task-page';

function env(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

function envList(key: string): string[] {
  const raw = env(key);
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class DailyTaskService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(DailyTaskService.name);

  /** Chains overlapping runs so two of them cannot both pass the exists check. */
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly carryOver: DailyCarryOverService,
  ) {}

  private get enabled(): boolean {
    return env('DAILY_TASK_ENABLED').toLowerCase() === 'true';
  }

  private get timeZone(): string {
    return env('DAILY_TASK_TIMEZONE', DEFAULT_TZ);
  }

  private get sections(): DailySections {
    return dailySections();
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Daily task pages are off (DAILY_TASK_ENABLED != true)');
      return;
    }
    if (!env('DAILY_TASK_SPACE_ID') || !env('DAILY_TASK_USER_ID')) {
      this.logger.warn(
        'Daily task pages are on but DAILY_TASK_SPACE_ID or DAILY_TASK_USER_ID is missing; nothing will be created',
      );
      return;
    }
    this.logger.log(
      `Daily task pages on: cron "${env('DAILY_TASK_CRON', DEFAULT_CRON)}" (${this.timeZone})`,
    );
  }

  /**
   * Runs after every module is up, which is when the schedule explorer has
   * finished registering jobs. Discovery depends on another module calling
   * ScheduleModule.forRoot(), so say so out loud rather than silently never
   * firing if that ever stops being true upstream.
   */
  onApplicationBootstrap() {
    if (!this.enabled) return;
    try {
      const jobs = this.schedulerRegistry.getCronJobs();
      if (!jobs.has(CRON_JOB_NAME)) {
        this.logger.error(
          `Daily task pages are on but the "${CRON_JOB_NAME}" job was not registered; no page will be created on schedule`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not confirm the daily task schedule: ${(err as Error).message}`,
      );
    }

    void this.warnIfTitlePatternsDisagree();
  }

  /**
   * Says so, loudly, when the space's default template would name a page
   * differently from the cron.
   *
   * Both names are configuration, set in two different places, and nothing
   * stops them drifting. When they do, nothing breaks visibly: pages still
   * appear, the cron still runs. What happens is that a day written by hand
   * is named one way and looked for the next morning under the other, so its
   * unfinished tasks are silently dropped. That is exactly the kind of fault
   * that is only noticed weeks later, so it is worth a line in the log on
   * every boot.
   */
  private async warnIfTitlePatternsDisagree(): Promise<void> {
    const spaceId = env('DAILY_TASK_SPACE_ID');
    if (!spaceId) return;

    const pattern = env('DAILY_TASK_TITLE') || '{date}';

    try {
      const row = await sql<{ title: string | null }>`
        SELECT t.title
        FROM spaces s
        JOIN templates t
          ON t.id::text = s.settings->>'defaultTemplateId'
         AND t.workspace_id = s.workspace_id
         AND t.deleted_at IS NULL
        WHERE s.id = ${spaceId}
          AND s.deleted_at IS NULL
        LIMIT 1
      `.execute(this.db);

      const templateTitle = row.rows[0]?.title?.trim();
      if (!templateTitle) return;

      if (templateTitle !== pattern) {
        this.logger.warn(
          `The daily task space's default template is named "${templateTitle}" but DAILY_TASK_TITLE is "${pattern}". ` +
            `A page created by hand will not be found by the next morning's carry-over. Make the two match.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Could not compare the daily title with the space template: ${(err as Error).message}`,
      );
    }
  }

  @Cron(env('DAILY_TASK_CRON', DEFAULT_CRON), {
    name: CRON_JOB_NAME,
    timeZone: env('DAILY_TASK_TIMEZONE', DEFAULT_TZ),
  })
  async scheduledRun(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.createForDate(new Date());
    } catch (err) {
      this.logger.error(
        `Daily task page failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Creates the page for one date. Safe to call twice: if the page for that
   * date already exists it returns the existing id and writes nothing.
   */
  async createForDate(
    now: Date,
  ): Promise<{ created: boolean; pageId?: string; reason?: string }> {
    // The schedule and a hand-run can land together; without this both would
    // read "no page yet" and insert, leaving two copies of the same day.
    const run = this.inFlight
      .catch(() => undefined)
      .then(() => this.buildForDate(now));
    this.inFlight = run.catch(() => undefined);
    return run;
  }

  private async buildForDate(
    now: Date,
  ): Promise<{ created: boolean; pageId?: string; reason?: string }> {
    const tz = this.timeZone;

    if (!isWorkingDay(now, tz)) {
      return { created: false, reason: 'weekend' };
    }

    const spaceId = env('DAILY_TASK_SPACE_ID');
    const userId = env('DAILY_TASK_USER_ID');
    if (!spaceId || !userId) {
      return { created: false, reason: 'not configured' };
    }

    const space = await this.db
      .selectFrom('spaces')
      .select(['id', 'workspaceId'])
      .where('id', '=', spaceId)
      .executeTakeFirst();

    if (!space) {
      return { created: false, reason: 'space not found' };
    }

    const title = dailyTitle(now, tz);

    const existing = await this.carryOver.findDailyPage(spaceId, title);
    if (existing) {
      return { created: false, pageId: existing.id, reason: 'already exists' };
    }

    const { carriedOver, planned } = await this.carryOver.gatherFromPreviousDay(
      spaceId,
      now,
      tz,
      this.sections,
    );

    const doc = buildDailyDoc({
      carriedOver,
      planned,
      sections: this.sections,
      standing: envList('DAILY_TASK_STANDING_ITEMS'),
    });

    const parentPageId = env('DAILY_TASK_PARENT_PAGE_ID') || undefined;

    const page = await this.pageService.create(userId, space.workspaceId, {
      title,
      icon: env('DAILY_TASK_ICON') || undefined,
      spaceId,
      parentPageId,
      content: doc,
      format: 'json',
    });

    this.logger.log(
      `Created daily task page "${title}" (${planned.length} planned, ${carriedOver.length} carried over)`,
    );

    return { created: true, pageId: page.id };
  }

}
