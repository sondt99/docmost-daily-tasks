import { DailyTaskService } from './daily-task.service';
import { DEFAULT_SECTIONS, buildDailyDoc } from './daily-task.util';

/**
 * The boot-time check that the space's default template still has the
 * headings the carry-over fills.
 *
 * Tested through the service rather than through a helper, because a warning
 * nobody has ever seen fire is worth nothing: the point is that this method,
 * wired to this logger, produces a line naming the missing section.
 */
describe('warning that the default template is missing a section', () => {
  const make = () => {
    // The constructor only stores what it is handed; nothing here reaches
    // the database or the scheduler.
    const service: any = new (DailyTaskService as any)(
      null,
      null,
      null,
      null,
    );
    const warnings: string[] = [];
    service.logger = {
      warn: (message: string) => warnings.push(message),
      log: () => undefined,
      error: () => undefined,
    };
    return { service, warnings };
  };

  const heading = (text: string) => ({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text }],
  });

  it('stays quiet when the template has every section', () => {
    const { service, warnings } = make();
    service.warnIfSectionsMissing(buildDailyDoc({ planned: [], carriedOver: [] }));
    expect(warnings).toEqual([]);
  });

  it('names the section that is missing and what will not be filled', () => {
    const { service, warnings } = make();
    service.warnIfSectionsMissing({
      type: 'doc',
      content: [heading(DEFAULT_SECTIONS.today), heading('Ghi chú')],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(DEFAULT_SECTIONS.detail);
    expect(warnings[0]).toContain('numbered write-up');
    // The headings it did find, so the reader can see the rename that did it.
    expect(warnings[0]).toContain('Ghi chú');
  });

  it('warns once per missing section', () => {
    const { service, warnings } = make();
    service.warnIfSectionsMissing({
      type: 'doc',
      content: [heading('Biên bản họp')],
    });
    expect(warnings).toHaveLength(2);
  });

  it('says nothing about something it cannot read', () => {
    const { service, warnings } = make();
    for (const bad of [null, undefined, {}, { type: 'doc' }, 'text', 7]) {
      service.warnIfSectionsMissing(bad);
    }
    expect(warnings).toEqual([]);
  });
});
