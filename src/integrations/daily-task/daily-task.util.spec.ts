import {
  DEFAULT_SECTIONS,
  nodeText,
  buildDailyDoc,
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
  const sectionsOf = (doc: any) =>
    doc.content.filter((n: any) => n.type === 'heading').map(nodeText);
  const listsOf = (doc: any) =>
    doc.content.filter((n: any) => n.type === 'taskList');
  const textsOf = (list: any) => list.content.map(nodeText);

  it('puts yesterday plans first, then unfinished work', () => {
    const doc = buildDailyDoc({
      planned: ['việc đã hẹn trước'],
      carriedOver: ['việc còn nợ'],
    });
    expect(textsOf(listsOf(doc)[0])).toEqual([
      'việc đã hẹn trước',
      'việc còn nợ',
    ]);
  });

  it('writes real task items, not bullets', () => {
    const doc = buildDailyDoc({ planned: ['abc'], carriedOver: [] });
    const first = listsOf(doc)[0];
    expect(first.type).toBe('taskList');
    expect(first.content[0].type).toBe('taskItem');
    expect(first.content[0].attrs.checked).toBe(false);
  });

  it('leaves a blank tick box in an empty section rather than a bullet', () => {
    // A markdown "- [ ]" with nothing after it parses as an ordinary list, so
    // an empty section built that way could not be carried forward.
    const doc = buildDailyDoc({ planned: [], carriedOver: [] });
    for (const list of listsOf(doc)) {
      expect(list.type).toBe('taskList');
      expect(list.content.length).toBeGreaterThan(0);
      expect(list.content[0].type).toBe('taskItem');
    }
    expect(textsOf(listsOf(doc)[1])).toEqual(['']);
  });

  it('drops an item repeated in both lists', () => {
    const doc = buildDailyDoc({ planned: ['Trùng'], carriedOver: ['trùng'] });
    expect(textsOf(listsOf(doc)[0])).toEqual(['Trùng']);
  });

  it('always leaves all three sections present', () => {
    const doc = buildDailyDoc({ planned: [], carriedOver: [] });
    expect(sectionsOf(doc)).toEqual([
      DEFAULT_SECTIONS.today,
      DEFAULT_SECTIONS.tomorrow,
      DEFAULT_SECTIONS.notes,
    ]);
  });

  it('appends standing items to every day', () => {
    const doc = buildDailyDoc({
      planned: [],
      carriedOver: [],
      standing: ['Đọc mail'],
    });
    expect(textsOf(listsOf(doc)[0])).toContain('Đọc mail');
  });

  it('round-trips through the carry-over reader', () => {
    const doc = buildDailyDoc({ planned: ['a'], carriedOver: ['b'] });
    const back = uncheckedTasksBySection(doc);
    expect(back[DEFAULT_SECTIONS.today]).toEqual(['a', 'b']);
  });
});
