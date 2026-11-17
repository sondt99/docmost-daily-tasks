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

const LIST_TYPES = new Set(['taskList', 'bulletList', 'orderedList']);

/** Text of one block, with a line break reading as a space. */
function inlineText(node: PmNode): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return ' ';
  if (LIST_TYPES.has(node.type ?? '')) return '';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(inlineText).join('');
}

/**
 * The one line that represents a task item when it moves to the next day.
 *
 * Plain `nodeText` is wrong here on two counts. It reaches into nested lists,
 * so an unfinished parent would drag its sub-tasks' words into its own line
 * and those sub-tasks would then be carried a second time on their own. And it
 * joins everything with nothing at all, so a task with an explanation under it
 * came out as one run-on word: "Dung lai lab Frida" plus "vi ban 17 doi API"
 * became "Dung lai lab Fridavi ban 17 doi API".
 *
 * So: blocks that belong to this item are joined with a space, a line break
 * counts as a space, and anything inside a nested list is left to the item it
 * belongs to.
 */
function taskLineText(node: PmNode): string {
  if (!Array.isArray(node?.content)) return '';

  return node.content
    .filter((child) => !LIST_TYPES.has(child?.type ?? ''))
    .map((child) => inlineText(child).trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    const text = taskLineText(node);
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
 * The one list of lines a day starts with: what yesterday planned for today,
 * then what it did not finish, then anything standing.
 *
 * A task that was both planned and left unfinished is one task, so it is
 * listed once. Shared by the cron and by a page made by hand, because a day
 * made either way should open on the same list in the same order.
 */
export function mergeDailyItems(input: BuildDailyPageInput): string[] {
  const lines = [
    ...input.planned.map(cleanLine),
    ...input.carriedOver.map(cleanLine),
    ...(input.standing ?? []).map(cleanLine),
  ].filter(Boolean);

  const seen = new Set<string>();
  return lines.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Pours a day's open work into a template document.
 *
 * The cron builds its page from scratch; a page made by hand is built from
 * the space's default template, and that template is the user's to shape. So
 * rather than discarding it and substituting the cron's layout, this finds
 * the template's own "today" section and fills its task list. Everything
 * else in the template is left exactly as written.
 *
 * The document is rebuilt rather than edited in place: the caller's template
 * is shared state read from the database, and mutating it would leak one
 * page's tasks into the next page made from the same template.
 *
 * Returns the document unchanged when there is nothing to add, or when the
 * template has no section by that name. A template that does not mention
 * today has not opted into any of this, and quietly rearranging it would be
 * the wrong kind of helpful.
 */
export function fillTemplateWithCarryOver(
  doc: PmNode,
  items: string[],
  todayHeading: string,
): PmNode {
  if (!items.length) return doc;
  if (!doc || !Array.isArray(doc.content)) return doc;

  const wanted = todayHeading.trim();
  if (!wanted) return doc;

  const out: PmNode[] = [];
  let section: 'before' | 'inside' | 'done' = 'before';
  let filled = false;

  for (const node of doc.content) {
    const heading = headingText(node);

    if (section === 'inside' && heading !== null) {
      // The section ended without a task list of its own; give it one.
      if (!filled) {
        out.push(taskList(items));
        filled = true;
      }
      section = 'done';
    }

    if (section === 'inside' && !filled && node?.type === 'taskList') {
      out.push(taskList(items));
      filled = true;
      section = 'done';
      continue;
    }

    out.push(node);

    if (section === 'before' && heading !== null && heading === wanted) {
      section = 'inside';
    }
  }

  // The section was the last thing in the document.
  if (section === 'inside' && !filled) {
    out.push(taskList(items));
    filled = true;
  }

  if (!filled) return doc;
  return { ...doc, content: out };
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
  const deduped = mergeDailyItems(input);

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
