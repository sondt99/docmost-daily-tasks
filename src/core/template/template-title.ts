/**
 * Date placeholders in a template's title.
 *
 * A template used as a space's default names the pages made from it, so the
 * title is where a daily page gets its date. Writing `{dd/mm/yyyy}` in the
 * template title gives every page made from it that day's date.
 *
 * A brace group that is not one of the known names is left exactly as typed.
 * Blanking it would hide the typo; leaving `{DAYS}` visible in the page title
 * says plainly that nothing was substituted.
 */

const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_LOCALE = 'vi-VN';

function timeZone(): string {
  return (
    process.env.TEMPLATE_TITLE_TIMEZONE ||
    process.env.DAILY_TASK_TIMEZONE ||
    DEFAULT_TIME_ZONE
  );
}

function locale(): string {
  return process.env.TEMPLATE_TITLE_LOCALE || DEFAULT_LOCALE;
}

/** Year, month and day as seen in the configured zone, not in UTC. */
function parts(now: Date, zone: string) {
  // en-CA renders as YYYY-MM-DD, which splits cleanly.
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const [yyyy, mm, dd] = iso.split('-');
  return { iso, yyyy, mm, dd };
}

export function renderTemplateTitle(
  title: string,
  now: Date = new Date(),
  opts?: { timeZone?: string; locale?: string },
): string {
  if (!title || !title.includes('{')) return title ?? '';

  const zone = opts?.timeZone ?? timeZone();
  const loc = opts?.locale ?? locale();

  let p: ReturnType<typeof parts>;
  try {
    p = parts(now, zone);
  } catch {
    // An unusable zone must not cost someone their page title.
    p = parts(now, 'UTC');
  }

  const weekday = () => {
    try {
      return new Intl.DateTimeFormat(loc, {
        timeZone: zone,
        weekday: 'long',
      }).format(now);
    } catch {
      return '';
    }
  };

  /**
   * The date written the way the configured language writes it: 17/11/2026 in
   * Vietnamese, 11/17/2026 in American English. The parts are asked for as
   * numbers with a four digit year, rather than as a "short" date, because
   * short drops the century in several languages and a page titled "17/11/26"
   * sorts and reads badly next to one titled "17/11/2026".
   */
  const localDate = () => {
    try {
      return new Intl.DateTimeFormat(loc, {
        timeZone: zone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(now);
    } catch {
      return `${p.dd}/${p.mm}/${p.yyyy}`;
    }
  };

  const table: Record<string, () => string> = {
    date: () => p.iso,
    'yyyy-mm-dd': () => p.iso,
    'dd/mm/yyyy': () => `${p.dd}/${p.mm}/${p.yyyy}`,
    'dd-mm-yyyy': () => `${p.dd}-${p.mm}-${p.yyyy}`,
    'mm/yyyy': () => `${p.mm}/${p.yyyy}`,
    day: localDate,
    yyyy: () => p.yyyy,
    mm: () => p.mm,
    dd: () => p.dd,
    weekday: weekday,
  };

  return title.replace(/\{([^{}]*)\}/g, (whole, name: string) => {
    const key = name.trim().toLowerCase();
    const render = table[key];
    if (!render) return whole;
    const value = render();
    return value || whole;
  });
}

/** The placeholders this accepts, for documentation and error messages. */
export const TEMPLATE_TITLE_PLACEHOLDERS = [
  '{day}',
  '{date}',
  '{yyyy-mm-dd}',
  '{dd/mm/yyyy}',
  '{dd-mm-yyyy}',
  '{mm/yyyy}',
  '{yyyy}',
  '{mm}',
  '{dd}',
  '{weekday}',
];
