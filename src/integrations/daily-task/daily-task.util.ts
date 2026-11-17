/**
 * Pure helpers for the daily task page. No NestJS, no database: everything
 * here is a plain function so the date maths and the carry-over rules can be
 * tested on their own.
 */

export type DailySections = {
  today: string;
  tomorrow: string;
  notes: string;
};

export const DEFAULT_SECTIONS: DailySections = {
  today: 'Task hôm nay',
  tomorrow: 'Dự kiến hôm sau',
  notes: 'Ghi chú',
};

/** Monday..Friday are working days; Saturday and Sunday are skipped. */
export function isWorkingDay(date: Date, timeZone: string): boolean {
  const day = weekdayIndex(date, timeZone);
  return day >= 1 && day <= 5;
}

/** 0 = Sunday .. 6 = Saturday, evaluated in the given time zone. */
export function weekdayIndex(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** YYYY-MM-DD as seen in the given time zone. */
export function formatDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
}

/**
 * The working day before this one. Friday is the predecessor of Monday, so
 * nothing written on Friday is lost over the weekend.
 */
export function previousWorkingDay(date: Date, timeZone: string): Date {
  const cursor = new Date(date.getTime());
  for (let i = 0; i < 7; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (isWorkingDay(cursor, timeZone)) return cursor;
  }
  return cursor;
}

type PmNode = { type?: string; attrs?: any; content?: PmNode[]; text?: string };

/** Concatenates every text node below this node. */
export function nodeText(node: PmNode): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(nodeText).join('');
}

function headingText(node: PmNode): string | null {
  if (node?.type !== 'heading') return null;
  return nodeText(node).trim();
}

/**
 * Walks a ProseMirror document and returns the unchecked task item texts
 * found under each top-level heading. Task lists that appear before any
 * heading are filed under the empty-string key.
 */
export function uncheckedTasksBySection(
  doc: PmNode,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!doc || !Array.isArray(doc.content)) return out;

  let current = '';
  for (const node of doc.content) {
    const heading = headingText(node);
    if (heading !== null) {
      current = heading;
      if (!out[current]) out[current] = [];
      continue;
    }
    const found = collectUnchecked(node);
    if (found.length) {
      if (!out[current]) out[current] = [];
      out[current].push(...found);
    }
  }
  return out;
}

function collectUnchecked(node: PmNode): string[] {
  if (!node) return [];
  const found: string[] = [];

  if (node.type === 'taskItem') {
    const checked = node.attrs?.checked === true;
    const text = nodeText(node).trim();
    if (!checked && text) found.push(text);
    // A nested list inside a done item is intentionally still scanned, so a
    // sub-task left open under a ticked parent is not quietly dropped.
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) found.push(...collectUnchecked(child));
  }
  return found;
}

export type BuildDailyPageInput = {
  /** Open tasks pulled forward from the previous working day. */
  carriedOver: string[];
  /** What the previous day planned for today. */
  planned: string[];
  sections?: DailySections;
  /** Extra fixed checklist lines added to every day, e.g. a standing routine. */
  standing?: string[];
};

function heading(text: string) {
  return {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text }],
  };
}

function taskItem(text: string) {
  const paragraph: any = { type: 'paragraph' };
  if (text) paragraph.content = [{ type: 'text', text }];
  return { type: 'taskItem', attrs: { checked: false }, content: [paragraph] };
}

/** One list, with a single blank tick box when there is nothing to put in it. */
function taskList(items: string[]) {
  const content = items.length ? items.map(taskItem) : [taskItem('')];
  return { type: 'taskList', content };
}

function cleanLine(line: string): string {
  return line.replace(/\r?\n/g, ' ').trim();
}

/**
 * Builds the ProseMirror document for one day.
 *
 * This is assembled as JSON rather than as markdown on purpose: markdown
 * turns a checkbox with no text after it into an ordinary bullet, so an
 * empty section would come out as a plain list the editor does not treat as
 * tasks, and anything typed into it the next morning would not be carried
 * forward. Building the nodes directly keeps every section a real task list.
 */
export function buildDailyDoc(input: BuildDailyPageInput): any {
  const s = input.sections ?? DEFAULT_SECTIONS;

  const todayItems = [
    ...input.planned.map(cleanLine),
    ...input.carriedOver.map(cleanLine),
    ...(input.standing ?? []).map(cleanLine),
  ].filter(Boolean);

  const seen = new Set<string>();
  const deduped = todayItems.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    type: 'doc',
    content: [
      heading(s.today),
      taskList(deduped),
      heading(s.tomorrow),
      taskList([]),
      heading(s.notes),
      { type: 'paragraph' },
    ],
  };
}
