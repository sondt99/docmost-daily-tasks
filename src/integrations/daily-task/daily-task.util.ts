/**
 * Pure helpers for the daily task page. No NestJS, no database: everything
 * here is a plain function so the date maths and the carry-over rules can be
 * tested on their own.
 */

export type DailySections = {
  today: string;
  tomorrow: string;
  /**
   * Where the day is written up in full.
   *
   * This used to be a free "Ghi chú" box and was almost always empty: a blank
   * page under a heading asks the writer to start from nothing. It is now the
   * same list of today's tasks again, numbered, so each one already has a
   * place to be written out underneath it.
   */
  detail: string;
};

export const DEFAULT_SECTIONS: DailySections = {
  today: 'Task hôm nay',
  tomorrow: 'Dự kiến hôm sau',
  detail: 'Nội dung chi tiết',
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

/** The text of every top-level heading, in the order they appear. */
export function topLevelHeadings(doc: PmNode): string[] {
  if (!doc || !Array.isArray(doc.content)) return [];
  return doc.content
    .map((node) => headingText(node))
    .filter((text): text is string => !!text);
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

function listItem(text: string) {
  const paragraph: any = { type: 'paragraph' };
  if (text) paragraph.content = [{ type: 'text', text }];
  return { type: 'listItem', content: [paragraph] };
}

/**
 * Today's tasks again, numbered, as the place to write each one up.
 *
 * A numbered list rather than tick boxes on purpose: the ticking happens once,
 * at the top of the page, and a second set of boxes would be a second record
 * of what is done, free to disagree with the first. Numbers only name the
 * task so there is a heading to write underneath.
 */
function detailList(items: string[]) {
  return {
    type: 'orderedList',
    attrs: { start: 1 },
    content: items.map(listItem),
  };
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
 * Puts a generated list into one named section of a document.
 *
 * Returns null when the document has no heading by that name, which the
 * caller reads as "this template did not ask for any of this".
 *
 * A list already sitting in the section is replaced where it stands, so a
 * template that lays out its own order keeps it. A section without one gets
 * the list directly under its heading, which is where a day built by the
 * cron has it.
 */
function fillSection(
  doc: PmNode,
  wanted: string,
  listType: string,
  build: () => PmNode,
): PmNode | null {
  if (!doc || !Array.isArray(doc.content)) return null;

  const nodes = doc.content;
  const start = nodes.findIndex((n) => headingText(n) === wanted);
  if (start < 0) return null;

  // The section runs to the next heading, or to the end of the document.
  let end = nodes.length;
  for (let i = start + 1; i < nodes.length; i++) {
    if (headingText(nodes[i]) !== null) {
      end = i;
      break;
    }
  }

  let at = -1;
  for (let i = start + 1; i < end; i++) {
    if (nodes[i]?.type === listType) {
      at = i;
      break;
    }
  }

  const content = [...nodes];
  if (at >= 0) content[at] = build();
  else content.splice(start + 1, 0, build());

  return { ...doc, content };
}

/**
 * Pours a day's open work into a template document.
 *
 * The cron builds its page from scratch; a page made by hand is built from
 * the space's default template, and that template is the user's to shape. So
 * rather than discarding it and substituting the cron's layout, this finds
 * the template's own sections by name and fills them. Everything else in the
 * template is left exactly as written.
 *
 * The document is rebuilt rather than edited in place: the caller's template
 * is shared state read from the database, and mutating it would leak one
 * page's tasks into the next page made from the same template.
 *
 * Returns the document unchanged when there is nothing to add, or when the
 * template has no "today" section. A template that does not mention today has
 * not opted into any of this, and quietly rearranging it would be the wrong
 * kind of helpful. The write-up section is filled when it is there and
 * skipped without complaint when it is not, since a day is still a day
 * without one.
 */
export function fillTemplateWithCarryOver(
  doc: PmNode,
  items: string[],
  sections: { today: string; detail?: string },
): PmNode {
  if (!items.length) return doc;
  if (!doc || !Array.isArray(doc.content)) return doc;

  const today = sections.today?.trim();
  if (!today) return doc;

  const withTasks = fillSection(doc, today, 'taskList', () => taskList(items));
  if (!withTasks) return doc;

  const detail = sections.detail?.trim();
  if (!detail) return withTasks;

  return (
    fillSection(withTasks, detail, 'orderedList', () => detailList(items)) ??
    withTasks
  );
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
      heading(s.detail),
      // Nothing to write up on a day that starts with nothing on it; an
      // empty "1." under the heading would only be something to delete.
      ...(deduped.length ? [detailList(deduped)] : []),
      { type: 'paragraph' },
    ],
  };
}
