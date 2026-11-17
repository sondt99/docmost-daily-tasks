import {
  DEFAULT_SECTIONS,
  buildDailyMarkdown,
  formatDate,
  isWorkingDay,
  previousWorkingDay,
  uncheckedTasksBySection,
} from './daily-task.util';

const TZ = 'Asia/Ho_Chi_Minh';

// 2026-11-17 is a Tuesday; 2026-11-21 a Saturday; 2026-11-23 a Monday.
const tuesday = new Date('2026-11-17T03:00:00Z');
const saturday = new Date('2026-11-21T03:00:00Z');
const sunday = new Date('2026-11-22T03:00:00Z');
const monday = new Date('2026-11-23T03:00:00Z');

function doc(...nodes: any[]) {
  return { type: 'doc', content: nodes };
}
function heading(text: string) {
  return {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text }],
  };
}
function taskList(...items: Array<[string, boolean]>) {
  return {
    type: 'taskList',
    content: items.map(([text, checked]) => ({
      type: 'taskItem',
      attrs: { checked },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  };
}

describe('working days', () => {
  it('counts Monday to Friday as working days', () => {
    expect(isWorkingDay(tuesday, TZ)).toBe(true);
    expect(isWorkingDay(monday, TZ)).toBe(true);
  });

  it('excludes Saturday and Sunday', () => {
    expect(isWorkingDay(saturday, TZ)).toBe(false);
    expect(isWorkingDay(sunday, TZ)).toBe(false);
  });

  it('steps back to Friday from Monday, skipping the weekend', () => {
    const prev = previousWorkingDay(monday, TZ);
    expect(formatDate(prev, TZ)).toBe('2026-11-20');
  });

  it('steps back one day on an ordinary weekday', () => {
    const prev = previousWorkingDay(tuesday, TZ);
    expect(formatDate(prev, TZ)).toBe('2026-11-16');
  });

  it('formats the date in the configured zone, not UTC', () => {
    // 17:30 UTC is already the next day in Ho Chi Minh City (UTC+7).
    const lateUtc = new Date('2026-11-17T17:30:00Z');
    expect(formatDate(lateUtc, TZ)).toBe('2026-11-18');
    expect(formatDate(lateUtc, 'UTC')).toBe('2026-11-17');
  });
});

describe('carrying tasks forward', () => {
  const previousDay = doc(
    heading(DEFAULT_SECTIONS.today),
    taskList(['đã xong', true], ['chưa xong', false]),
    heading(DEFAULT_SECTIONS.tomorrow),
    taskList(['việc dự kiến', false], ['dự kiến đã làm luôn', true]),
    heading(DEFAULT_SECTIONS.notes),
  );

  it('keeps only unticked items', () => {
    const got = uncheckedTasksBySection(previousDay);
    expect(got[DEFAULT_SECTIONS.today]).toEqual(['chưa xong']);
  });

  it('separates what was planned from what was unfinished', () => {
    const got = uncheckedTasksBySection(previousDay);
    expect(got[DEFAULT_SECTIONS.tomorrow]).toEqual(['việc dự kiến']);
  });

  it('finds open sub-tasks nested under a ticked parent', () => {
    const nested = doc(
      heading(DEFAULT_SECTIONS.today),
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: true },
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'cha' }] },
              taskList(['con còn hở', false]),
            ],
          },
        ],
      },
    );
    expect(uncheckedTasksBySection(nested)[DEFAULT_SECTIONS.today]).toEqual([
      'con còn hở',
    ]);
  });

  it('returns nothing for an empty or malformed document', () => {
    expect(uncheckedTasksBySection(null as any)).toEqual({});
    expect(uncheckedTasksBySection({ type: 'doc' } as any)).toEqual({});
  });
});

describe('building the day', () => {
  it('puts yesterday plans first, then unfinished work', () => {
    const md = buildDailyMarkdown({
      planned: ['việc đã hẹn trước'],
      carriedOver: ['việc còn nợ'],
    });
    const todayBlock = md.split('##')[1];
    expect(todayBlock.indexOf('việc đã hẹn trước')).toBeLessThan(
      todayBlock.indexOf('việc còn nợ'),
    );
  });

  it('writes task lines markdown turns into checkboxes', () => {
    const md = buildDailyMarkdown({ planned: ['abc'], carriedOver: [] });
    expect(md).toContain('- [ ] abc');
  });

  it('drops an item repeated in both lists', () => {
    const md = buildDailyMarkdown({
      planned: ['Trùng'],
      carriedOver: ['trùng'],
    });
    expect(md.match(/- \[ \] Trùng/gi)?.length).toBe(1);
  });

  it('always leaves all three sections present', () => {
    const md = buildDailyMarkdown({ planned: [], carriedOver: [] });
    expect(md).toContain(`## ${DEFAULT_SECTIONS.today}`);
    expect(md).toContain(`## ${DEFAULT_SECTIONS.tomorrow}`);
    expect(md).toContain(`## ${DEFAULT_SECTIONS.notes}`);
  });

  it('appends standing items to every day', () => {
    const md = buildDailyMarkdown({
      planned: [],
      carriedOver: [],
      standing: ['Đọc mail'],
    });
    expect(md).toContain('- [ ] Đọc mail');
  });
});
