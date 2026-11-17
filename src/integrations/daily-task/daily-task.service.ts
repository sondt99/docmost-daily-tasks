import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageService } from '../../core/page/services/page.service';
import {
  DEFAULT_SECTIONS,
  DailySections,
  buildDailyDoc,
  formatDate,
  isWorkingDay,
  previousWorkingDay,
  uncheckedTasksBySection,
} from './daily-task.util';

/** How many working days back to look for the last daily page. */
const LOOKBACK_DAYS = 5;

const DEFAULT_CRON = '0 6 * * 1-5';
const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

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
export class DailyTaskService implements OnModuleInit {
  private readonly logger = new Logger(DailyTaskService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
  ) {}

  private get enabled(): boolean {
    return env('DAILY_TASK_ENABLED').toLowerCase() === 'true';
  }

  private get timeZone(): string {
    return env('DAILY_TASK_TIMEZONE', DEFAULT_TZ);
  }

  private get sections(): DailySections {
    return {
      today: env('DAILY_TASK_SECTION_TODAY', DEFAULT_SECTIONS.today),
      tomorrow: env('DAILY_TASK_SECTION_TOMORROW', DEFAULT_SECTIONS.tomorrow),
      notes: env('DAILY_TASK_SECTION_NOTES', DEFAULT_SECTIONS.notes),
    };
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

  @Cron(env('DAILY_TASK_CRON', DEFAULT_CRON), {
    name: 'daily-task-page',
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

    const title = formatDate(now, tz);

    const existing = await this.findDailyPage(spaceId, title);
    if (existing) {
      return { created: false, pageId: existing.id, reason: 'already exists' };
    }

    const { carriedOver, planned } = await this.gatherFromPreviousDay(
      spaceId,
      now,
      tz,
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

  /**
   * Reads the most recent earlier daily page and splits its open items into
   * what it planned for today and what it simply did not finish.
   */
  private async gatherFromPreviousDay(
    spaceId: string,
    now: Date,
    tz: string,
  ): Promise<{ carriedOver: string[]; planned: string[] }> {
    const names = this.sections;
    let cursor = now;

    for (let i = 0; i < LOOKBACK_DAYS; i++) {
      cursor = previousWorkingDay(cursor, tz);
      const prevTitle = formatDate(cursor, tz);
      const prev = await this.findDailyPage(spaceId, prevTitle, true);
      if (!prev) continue;

      const bySection = uncheckedTasksBySection((prev as any).content);
      return {
        carriedOver: bySection[names.today] ?? [],
        planned: bySection[names.tomorrow] ?? [],
      };
    }

    return { carriedOver: [], planned: [] };
  }

  private async findDailyPage(
    spaceId: string,
    title: string,
    withContent = false,
  ) {
    let query = this.db
      .selectFrom('pages')
      .select(['id', 'title'])
      .where('spaceId', '=', spaceId)
      .where('title', '=', title)
      .where('deletedAt', 'is', null);

    if (withContent) query = query.select('content') as any;

    return query.executeTakeFirst();
  }
}
