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
  ) {}

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
        request.body.content = template.content;
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
