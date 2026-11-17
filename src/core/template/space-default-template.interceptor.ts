import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SpaceDefaultTemplateService } from './space-default-template.service';
import { renderTemplateTitle } from './template-title';
import {
  DailyCarryOverService,
  dailySections,
  dailyTimeZone,
  isDailyTaskSpace,
} from '../../integrations/daily-task/daily-carry-over.service';
import {
  fillTemplateWithCarryOver,
  mergeDailyItems,
} from '../../integrations/daily-task/daily-task.util';

/**
 * Should this request have the space's default template poured into it?
 *
 * Kept separate from the interceptor so the decision can be tested without a
 * Nest execution context. The rule is narrow on purpose: only the one endpoint
 * the "new page" button calls, and only when the caller sent no content of its
 * own. Everything that already carries content, such as an import, a
 * duplicate, a page made from a template on purpose, or the daily-task cron,
 * falls through untouched.
 */
export function shouldFillFromTemplate(
  method: string,
  url: string,
  body: any,
): boolean {
  if (method?.toUpperCase() !== 'POST') return false;

  const path = (url ?? '').split('?')[0].replace(/\/+$/, '');
  if (!path.endsWith('/pages/create')) return false;

  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (typeof body.spaceId !== 'string' || body.spaceId.length === 0) {
    return false;
  }

  return body.content === undefined || body.content === null;
}

/**
 * Fills a new page with its space's default template.
 *
 * This runs as a global interceptor rather than as an edit to Docmost's page
 * controller. Interceptors run after the guards and before the validation
 * pipe, which is the one point where the body can still be changed and the
 * authenticated workspace is already known. Creating the page with its content
 * in the same call also means Docmost builds the Yjs document from it the
 * usual way, so the editor opens on a filled page instead of racing a second
 * write against the collaboration session.
 */
@Injectable()
export class SpaceDefaultTemplateInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SpaceDefaultTemplateInterceptor.name);

  constructor(
    private readonly spaceDefaultTemplate: SpaceDefaultTemplateService,
    private readonly carryOver: DailyCarryOverService,
  ) {}

  /**
   * In the space the daily-task cron was set up for, a page made by hand is a
   * day's page too, so it opens on the same work the 06:00 page would have
   * opened on: yesterday's plan for today, plus whatever was left unfinished.
   *
   * Without this the two ways of starting a day disagree, and the disagreement
   * is worse than cosmetic. The cron skips a day it already has a page for, so
   * clicking "new page" before 06:00 used to leave the morning page blank and
   * silently cancel the carry-over for that day.
   */
  private async withCarriedWork(spaceId: string, content: any): Promise<any> {
    if (!isDailyTaskSpace(spaceId)) return content;

    const sections = dailySections();
    const { carriedOver, planned } = await this.carryOver.gatherFromPreviousDay(
      spaceId,
      new Date(),
      dailyTimeZone(),
      sections,
    );

    const items = mergeDailyItems({ carriedOver, planned });
    if (!items.length) return content;

    const filled = fillTemplateWithCarryOver(content, items, sections.today);
    if (filled === content) {
      this.logger.warn(
        `The default template for space ${spaceId} has no "${sections.today}" ` +
          `section, so ${items.length} unfinished item(s) were not carried ` +
          `into the new page. Rename the heading to match, or change ` +
          `DAILY_TASK_SECTION_TODAY.`,
      );
      return content;
    }

    this.logger.log(
      `Carried ${items.length} open item(s) into a page made by hand in space ${spaceId}`,
    );
    return filled;
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest();

    if (
      !shouldFillFromTemplate(
        request?.method,
        request?.url ?? request?.raw?.url,
        request?.body,
      )
    ) {
      return next.handle();
    }

    const workspace = request.raw?.workspace ?? request.user?.workspace;
    if (!workspace?.id) return next.handle();

    try {
      const template = await this.spaceDefaultTemplate.findDefaultContent(
        request.body.spaceId,
        workspace.id,
      );

      if (template) {
        request.body.content = await this.withCarriedWork(
          request.body.spaceId,
          template.content,
        );
        request.body.format = 'json';

        // The template also names the page, which is how a daily page gets
        // its date: a title of "công việc ngày {dd/mm/yyyy}" becomes today's.
        // A title the caller typed always wins.
        const typed =
          typeof request.body.title === 'string'
            ? request.body.title.trim()
            : '';
        if (!typed && template.title) {
          request.body.title = renderTemplateTitle(template.title);
        }
      }
    } catch (err) {
      // A blank page is a far better outcome than a failed click.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Could not apply the default template for space ${request.body.spaceId}: ${reason}`,
      );
    }

    return next.handle();
  }
}
