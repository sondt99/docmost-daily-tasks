import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

/**
 * Reads and writes a space's default template.
 *
 * The id is kept in `spaces.settings->>'defaultTemplateId'` rather than in a
 * column of its own. `settings` is an existing jsonb column that Docmost
 * already merges into for sharing and comment preferences, so storing it there
 * needs no migration and survives an upgrade: a Docmost release that knows
 * nothing about this key carries it along untouched, because every writer
 * merges with `||` instead of replacing the object.
 */
@Injectable()
export class SpaceDefaultTemplateService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async get(spaceId: string, workspaceId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('spaces')
      .select(
        sql<string | null>`settings->>'defaultTemplateId'`.as(
          'defaultTemplateId',
        ),
      )
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    return row?.defaultTemplateId ?? null;
  }

  async set(
    spaceId: string,
    workspaceId: string,
    templateId: string | null,
  ): Promise<void> {
    const value = templateId
      ? sql`to_jsonb(${templateId}::text)`
      : sql`'null'::jsonb`;

    await this.db
      .updateTable('spaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object('defaultTemplateId', ${value})` as any,
        updatedAt: new Date(),
      })
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  /**
   * The content of the space's default template, in one round trip.
   *
   * Returns null when the space has no default, when the id points at a
   * template that has since been deleted, or when the template holds no
   * content. The interceptor that fills new pages calls this on every page
   * creation, so it stays a single cheap query and never throws: a missing
   * template means "create an ordinary blank page", not an error.
   *
   * The join compares `t.id::text` against the stored string instead of
   * casting the string to uuid. The stored value is written only by `set()`
   * above, but it sits in a jsonb blob that a future Docmost feature or a
   * hand-edited row could put anything into, and `'nonsense'::uuid` would
   * abort the whole page-creation request rather than fall back to blank.
   */
  async findDefaultContent(
    spaceId: string,
    workspaceId: string,
  ): Promise<{ id: string; content: any } | null> {
    const result = await sql<{ id: string; content: any }>`
      SELECT t.id, t.content
      FROM spaces s
      JOIN templates t
        ON t.id::text = s.settings->>'defaultTemplateId'
       AND t.workspace_id = s.workspace_id
       AND t.deleted_at IS NULL
      WHERE s.id = ${spaceId}
        AND s.workspace_id = ${workspaceId}
        AND s.deleted_at IS NULL
        AND t.content IS NOT NULL
      LIMIT 1
    `.execute(this.db);

    return result.rows[0] ?? null;
  }
}
