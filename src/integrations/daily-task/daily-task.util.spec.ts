import {
  DEFAULT_SECTIONS,
  nodeText,
  buildDailyDoc,
  fillTemplateWithCarryOver,
  formatDate,
  isWorkingDay,
  mergeDailyItems,
  previousWorkingDay,
  topLevelHeadings,
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
  it('keeps a task and its explanation apart instead of running them together', () => {
    const doc = {
      type: 'doc',
      content: [
        heading('Task hôm nay'),
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Dựng lại lab Frida' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'vì bản 17 đổi API' }] },
              ],
            },
          ],
        },
        heading('Dự kiến hôm sau'),
        { type: 'taskList', content: [] },
      ],
    };

    expect(uncheckedTasksBySection(doc as any)['Task hôm nay']).toEqual([
      'Dựng lại lab Frida vì bản 17 đổi API',
    ]);
  });

  it('reads a soft line break as a space, not as nothing', () => {
    const doc = {
      type: 'doc',
      content: [
        heading('Task hôm nay'),
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Gửi advisory' },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'hạn thứ sáu' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(uncheckedTasksBySection(doc as any)['Task hôm nay']).toEqual([
      'Gửi advisory hạn thứ sáu',
    ]);
  });

  it('does not let an open parent swallow its sub-tasks', () => {
    const doc = {
      type: 'doc',
      content: [
        heading('Task hôm nay'),
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Audit app X' }] },
                {
                  type: 'taskList',
                  content: [
                    {
                      type: 'taskItem',
                      attrs: { checked: false },
                      content: [
                        { type: 'paragraph', content: [{ type: 'text', text: 'màn login' }] },
                      ],
                    },
                    {
                      type: 'taskItem',
                      attrs: { checked: true },
                      content: [
                        { type: 'paragraph', content: [{ type: 'text', text: 'deeplink' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // the parent keeps its own words, the open child comes along once,
    // and the finished child stays behind
    expect(uncheckedTasksBySection(doc as any)['Task hôm nay']).toEqual([
      'Audit app X',
      'màn login',
    ]);
  });

  const previousDay = doc(
    heading(DEFAULT_SECTIONS.today),
    taskList(['đã xong', true], ['chưa xong', false]),
    heading(DEFAULT_SECTIONS.tomorrow),
    taskList(['việc dự kiến', false], ['dự kiến đã làm luôn', true]),
    heading(DEFAULT_SECTIONS.detail),
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
      DEFAULT_SECTIONS.detail,
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

  it('repeats the day\'s tasks, numbered, under the write-up heading', () => {
    const doc = buildDailyDoc({
      planned: ['việc đã hẹn trước'],
      carriedOver: ['việc còn nợ'],
      standing: ['Đọc mail'],
    });
    const numbered = doc.content.find((n: any) => n.type === 'orderedList');

    expect(numbered.attrs.start).toBe(1);
    expect(numbered.content[0].type).toBe('listItem');
    expect(numbered.content.map(nodeText)).toEqual(
      textsOf(listsOf(doc)[0]),
    );
  });

  it('puts the numbered list under the write-up heading, not elsewhere', () => {
    const doc = buildDailyDoc({ planned: ['một việc'], carriedOver: [] });
    const at = doc.content.findIndex((n: any) => n.type === 'orderedList');
    expect(nodeText(doc.content[at - 1])).toBe(DEFAULT_SECTIONS.detail);
  });

  it('leaves the write-up empty on a day with nothing on it', () => {
    // An empty "1." under the heading would only be something to delete.
    const doc = buildDailyDoc({ planned: [], carriedOver: [] });
    expect(doc.content.some((n: any) => n.type === 'orderedList')).toBe(false);
    expect(sectionsOf(doc)).toContain(DEFAULT_SECTIONS.detail);
  });

  it('does not count the write-up list as a second set of tasks', () => {
    // The numbered copy must not read back as unfinished work, or every task
    // would be carried forward twice over.
    const doc = buildDailyDoc({ planned: ['một việc'], carriedOver: [] });
    const back = uncheckedTasksBySection(doc);
    expect(back[DEFAULT_SECTIONS.detail] ?? []).toEqual([]);
  });
});

describe('reading a template\'s headings', () => {
  it('names the sections a template has, in order', () => {
    const doc = buildDailyDoc({ planned: ['x'], carriedOver: [] });
    expect(topLevelHeadings(doc)).toEqual([
      DEFAULT_SECTIONS.today,
      DEFAULT_SECTIONS.tomorrow,
      DEFAULT_SECTIONS.detail,
    ]);
  });

  it('says nothing about something that is not a document', () => {
    expect(topLevelHeadings(null as any)).toEqual([]);
    expect(topLevelHeadings({} as any)).toEqual([]);
    expect(topLevelHeadings({ type: 'doc', content: [] })).toEqual([]);
  });
});

describe('pouring a day of open work into a template', () => {
  const h = (text: string) => ({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text }],
  });
  const box = (text = '') => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [
      text
        ? { type: 'paragraph', content: [{ type: 'text', text }] }
        : { type: 'paragraph' },
    ],
  });
  const list = (...items: any[]) => ({ type: 'taskList', content: items });

  const template = () => ({
    type: 'doc',
    content: [
      h('Task hôm nay'),
      list(box()),
      h('Dự kiến hôm sau'),
      list(box()),
      h('Nội dung chi tiết'),
      { type: 'paragraph' },
    ],
  });

  const SECTIONS = {
    today: 'Task hôm nay',
    tomorrow: 'Dự kiến hôm sau',
    detail: 'Nội dung chi tiết',
  };

  /** The numbered write-up list, wherever it ended up. */
  const numberedOf = (doc: any) =>
    doc.content.find((n: any) => n.type === 'orderedList');

  const texts = (doc: any, heading: string): string[] => {
    const out: string[] = [];
    let inside = false;
    for (const node of doc.content) {
      if (node.type === 'heading') {
        inside = nodeText(node).trim() === heading;
        continue;
      }
      if (inside && node.type === 'taskList') {
        for (const item of node.content) out.push(nodeText(item).trim());
      }
    }
    return out;
  };

  it('fills the today list and leaves the other sections alone', () => {
    const filled = fillTemplateWithCarryOver(
      template(),
      ['viết blog', 'vá công cụ'],
      SECTIONS,
    );

    expect(texts(filled, 'Task hôm nay')).toEqual(['viết blog', 'vá công cụ']);
    expect(texts(filled, 'Dự kiến hôm sau')).toEqual(['']);
    expect(nodeText(filled.content[4])).toBe('Nội dung chi tiết');
  });

  it('does not alter the template it was given', () => {
    // The template is shared state read from the database. Mutating it would
    // leak one page's tasks into the next page made from the same template.
    const original = template();
    const copy = JSON.parse(JSON.stringify(original));
    fillTemplateWithCarryOver(original, ['việc'], SECTIONS);
    expect(original).toEqual(copy);
  });

  it('leaves a template that has no such section exactly as it was', () => {
    const other = {
      type: 'doc',
      content: [h('Biên bản họp'), { type: 'paragraph' }],
    };
    expect(fillTemplateWithCarryOver(other, ['việc'], SECTIONS)).toBe(other);
  });

  it('gives the section a list when it has none', () => {
    const noList = {
      type: 'doc',
      content: [h('Task hôm nay'), h('Ghi chú'), { type: 'paragraph' }],
    };
    const filled = fillTemplateWithCarryOver(noList, ['việc'], SECTIONS);
    expect(texts(filled, 'Task hôm nay')).toEqual(['việc']);
    expect(nodeText(filled.content[2]).trim()).toBe('Ghi chú');
  });

  it('handles the section being the last thing in the document', () => {
    const trailing = { type: 'doc', content: [h('Task hôm nay')] };
    const filled = fillTemplateWithCarryOver(trailing, ['việc'], SECTIONS);
    expect(texts(filled, 'Task hôm nay')).toEqual(['việc']);
  });

  it('returns the template untouched when there is nothing to carry', () => {
    const t = template();
    expect(fillTemplateWithCarryOver(t, [], SECTIONS)).toBe(t);
  });

  it('survives a template that is not a document', () => {
    expect(
      fillTemplateWithCarryOver(null as any, ['x'], { today: 'T' }),
    ).toBeNull();
    expect(fillTemplateWithCarryOver({} as any, ['x'], { today: 'T' })).toEqual(
      {},
    );
  });

  it('lists a task that was both planned and unfinished only once', () => {
    const items = mergeDailyItems({
      planned: ['Bảo mật công cụ tra cứu'],
      carriedOver: ['bảo mật công cụ tra cứu', 'việc khác'],
    });
    expect(items).toEqual(['Bảo mật công cụ tra cứu', 'việc khác']);
  });

  it('orders a hand-made day exactly like the cron orders one', () => {
    const input = {
      planned: ['đã hẹn'],
      carriedOver: ['còn nợ'],
      standing: ['việc thường ngày'],
    };
    const byHand = fillTemplateWithCarryOver(
      template(),
      mergeDailyItems(input),
      SECTIONS,
    );
    const byCron = buildDailyDoc(input);

    expect(texts(byHand, 'Task hôm nay')).toEqual(
      texts(byCron, 'Task hôm nay'),
    );
  });

  it('numbers the same tasks under the write-up heading', () => {
    const filled = fillTemplateWithCarryOver(
      template(),
      ['viết blog', 'vá công cụ'],
      SECTIONS,
    );

    expect(numberedOf(filled).content.map(nodeText)).toEqual([
      'viết blog',
      'vá công cụ',
    ]);
  });

  it('puts the numbered list under its own heading', () => {
    const filled = fillTemplateWithCarryOver(template(), ['việc'], SECTIONS);
    const at = filled.content.indexOf(numberedOf(filled));
    expect(nodeText(filled.content[at - 1])).toBe('Nội dung chi tiết');
  });

  it('keeps the write-up list where the template already had one', () => {
    const ol = (text: string) => ({
      type: 'orderedList',
      attrs: { start: 1 },
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      ],
    });
    const custom = {
      type: 'doc',
      content: [
        h('Task hôm nay'),
        list(box()),
        h('Nội dung chi tiết'),
        { type: 'paragraph', content: [{ type: 'text', text: 'Mở đầu' }] },
        ol('cũ'),
      ],
    };

    const filled = fillTemplateWithCarryOver(custom, ['việc'], SECTIONS);

    // The template's own words stay above it; only the list is rewritten.
    expect(nodeText(filled.content[3])).toBe('Mở đầu');
    expect(numberedOf(filled).content.map(nodeText)).toEqual(['việc']);
    expect(filled.content.filter((n: any) => n.type === 'orderedList')).toHaveLength(1);
  });

  it('still carries the tasks when the template has no write-up section', () => {
    // A template is the user's to shape. One without the section is not
    // broken, it just does not get a write-up list.
    const old = {
      type: 'doc',
      content: [h('Task hôm nay'), list(box()), h('Ghi chú'), { type: 'paragraph' }],
    };

    const filled = fillTemplateWithCarryOver(old, ['việc'], SECTIONS);

    expect(texts(filled, 'Task hôm nay')).toEqual(['việc']);
    expect(numberedOf(filled)).toBeUndefined();
  });

  it('gives a hand-made day the same write-up as the cron gives it', () => {
    const items = ['đã hẹn', 'còn nợ'];
    const byHand = fillTemplateWithCarryOver(template(), items, SECTIONS);
    const byCron = buildDailyDoc({ planned: ['đã hẹn'], carriedOver: ['còn nợ'] });

    expect(numberedOf(byHand).content.map(nodeText)).toEqual(
      numberedOf(byCron).content.map(nodeText),
    );
  });
});
