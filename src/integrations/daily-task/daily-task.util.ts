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

function escapeMarkdown(line: string): string {
  // Keep it to the characters that would change the meaning of a list line.
  return line.replace(/\r?\n/g, ' ').trim();
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

/**
 * Builds the markdown for one day. Markdown is used rather than ProseMirror
 * JSON because the server already converts `- [ ]` into a real task list, so
 * there is no hand-built document shape to keep in sync with the editor.
 */
export function buildDailyMarkdown(input: BuildDailyPageInput): string {
  const s = input.sections ?? DEFAULT_SECTIONS;
  const lines: string[] = [];

  const todayItems = [
    ...input.planned.map(escapeMarkdown),
    ...input.carriedOver.map(escapeMarkdown),
    ...(input.standing ?? []).map(escapeMarkdown),
  ].filter(Boolean);

  const seen = new Set<string>();
  const deduped = todayItems.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  lines.push(`## ${s.today}`);
  lines.push('');
  if (deduped.length === 0) {
    lines.push('- [ ] ');
  } else {
    for (const item of deduped) lines.push(`- [ ] ${item}`);
  }
  lines.push('');

  lines.push(`## ${s.tomorrow}`);
  lines.push('');
  lines.push('- [ ] ');
  lines.push('');

  lines.push(`## ${s.notes}`);
  lines.push('');
  lines.push('');

  return lines.join('\n');
}
