import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { renderTemplateTitle } from '../../core/template/template-title';
import {
  DEFAULT_SECTIONS,
  DailySections,
  formatDate,
  previousWorkingDay,
  uncheckedTasksBySection,
} from './daily-task.util';

/** How many working days back to look for the last daily page. */
export const LOOKBACK_DAYS = 5;

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

function env(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

/**
 * The title of the page for one day.
 *
 * `DAILY_TASK_TITLE` takes the same date placeholders as a template title, so
 * the cron and a page made by hand from the space's default template can be
 * named the same way. That matters for more than looks: the carry-over finds
 * yesterday's page by its title, so if the two naming schemes drift apart, a
 * day written by hand is invisible to the next morning and its unfinished work
 * is quietly dropped.
 *
 * The default, `{date}`, is the plain `YYYY-MM-DD` this used to produce.
 */
export function dailyTitle(when: Date, tz: string): string {
  const pattern = env('DAILY_TASK_TITLE') || '{date}';
  const rendered = renderTemplateTitle(pattern, when, {
    timeZone: tz,
    locale: env('TEMPLATE_TITLE_LOCALE') || undefined,
  }).trim();

  // A pattern that renders to nothing would make every day share one blank
  // title, and the "already exists" check would match the wrong page.
  return rendered || formatDate(when, tz);
}

export function dailySections(): DailySections {
  return {
    today: env('DAILY_TASK_SECTION_TODAY', DEFAULT_SECTIONS.today),
    tomorrow: env('DAILY_TASK_SECTION_TOMORROW', DEFAULT_SECTIONS.tomorrow),
    notes: env('DAILY_TASK_SECTION_NOTES', DEFAULT_SECTIONS.notes),
  };
}

export function dailyTimeZone(): string {
  return env('DAILY_TASK_TIMEZONE', DEFAULT_TZ);
}

/** Is the daily-task feature on, and is this the space it was set up for? */
export function isDailyTaskSpace(spaceId: string): boolean {
  if (env('DAILY_TASK_ENABLED').toLowerCase() !== 'true') return false;
  const configured = env('DAILY_TASK_SPACE_ID');
  return configured !== '' && configured === spaceId;
}

/**
 * Reading the previous working day's open work.
 *
 * This lived inside the cron until a page made by hand needed the same
 * answer. Two copies of "which page was yesterday's, and what is still open
 * on it" would drift, and the way they drift is silent: the morning page
 * simply comes out empty and nobody is told. One implementation, two callers.
 */
@Injectable()
export class DailyCarryOverService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Nothing stops two pages carrying the same day's name: clicking "new page"
   * twice makes two, and both are legitimate. A `LIMIT 1` with no order would
   * then return whichever row Postgres reached first, which changes as rows
   * are edited and moved. Tomorrow's carry-over would read a page at random,
   * and reading the empty twin loses a day of work with nothing in the log.
   *
   * The most recently edited page is the one that was actually worked in.
   */
  async findDailyPage(spaceId: string, title: string, withContent = false) {
    const rows = await this.findDailyPages(spaceId, title, withContent);
    return rows[0];
  }

  /**
   * Every page carrying that day's name, most recently edited first.
   *
   * The carry-over reads all of them rather than only the newest. Two pages
   * can share a day: clicking "new page" twice makes two, and someone can
   * reasonably put the morning's work in one and the afternoon's in the
   * other. Reading one and ignoring the rest would drop the other's open
   * tasks without saying so. Duplicates are merged instead, and a task
   * written on both is listed once.
   */
  async findDailyPages(spaceId: string, title: string, withContent = false) {
    let query = this.db
      .selectFrom('pages')
      .select(['id', 'title'])
      .where('spaceId', '=', spaceId)
      .where('title', '=', title)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .orderBy('createdAt', 'desc');

    if (withContent) query = query.select('content') as any;

    return query.execute();
  }

  /**
   * Reads the most recent earlier daily page and splits its open items into
   * what it planned for today and what it simply did not finish.
   */
  async gatherFromPreviousDay(
    spaceId: string,
    now: Date,
    tz: string,
    sections: DailySections = dailySections(),
  ): Promise<{ carriedOver: string[]; planned: string[] }> {
    let cursor = now;

    for (let i = 0; i < LOOKBACK_DAYS; i++) {
      cursor = previousWorkingDay(cursor, tz);
      const prevTitle = dailyTitle(cursor, tz);
      const pages = await this.findDailyPages(spaceId, prevTitle, true);
      if (!pages.length) continue;

      const carriedOver: string[] = [];
      const planned: string[] = [];
      for (const page of pages) {
        const bySection = uncheckedTasksBySection((page as any).content);
        carriedOver.push(...(bySection[sections.today] ?? []));
        planned.push(...(bySection[sections.tomorrow] ?? []));
      }
      return { carriedOver, planned };
    }

    return { carriedOver: [], planned: [] };
  }
}
