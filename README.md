# docmost-daily-tasks

Three additions to a self-hosted [Docmost](https://github.com/docmost/docmost)
community edition server:

1. **A templates API.** Docmost ships the `templates` table, its repository and
   its front-end, but the controller and service that join them live in the
   closed enterprise submodule, so `POST /api/templates` answers `404` on a
   community build. This re-implements that layer from scratch.
2. **Templates you can actually reach**, including a per-space default that
   fills every new page in that space. Two entries in a page's `...` menu, and
   no licence check in front of them.
3. **Daily task pages.** On every working day a page is created in a space of
   your choosing, carrying yesterday's unfinished work forward.

Nothing here is copied from the enterprise edition. The server code was written
against the public API contract in `apps/client/src/ee/template/services`, which
is what the shipped front-end calls; the interface is this repository's own.

## Daily task pages

At the configured time on Monday to Friday, a page titled `YYYY-MM-DD` appears
in the space you nominate:

```markdown
## Task hôm nay
- [ ] whatever yesterday planned for today
- [ ] whatever yesterday left unticked

## Dự kiến hôm sau
- [ ]

## Ghi chú
```

The rules:

- **Weekends are skipped.** No page is created on Saturday or Sunday, and the
  Monday page carries forward from Friday rather than from an empty weekend.
- **Unticked items move, ticked ones do not.** An open sub-task under a ticked
  parent still moves, so finishing the headline item does not silently bury
  what is left under it.
- **A task keeps its own words.** An explanation written under a task travels
  with it, separated by a space rather than run together, and a parent task
  never swallows the text of the sub-tasks beneath it.
- **Yesterday's plan lands first.** What the previous day wrote under
  *Dự kiến hôm sau* goes to the top of today's list, then the leftovers.
- **Duplicates collapse.** An item that is both planned and unfinished appears
  once.
- **Running twice is harmless.** If the page for that date already exists,
  nothing is written.
- **Gaps are tolerated.** After a few days off, the most recent daily page
  within the last five working days is used.

### Running it by hand

The schedule is not the only way in. The configured owner can build a day's
page on demand, which is also how you check the feature after a deploy:

```bash
curl -X POST http://your-docmost/api/daily-task/run \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{}'                         # today
  -d '{"date":"2026-11-18"}'      # a specific day
```

It answers `{"created":true,"pageId":"..."}`, or `created:false` with a reason
(`weekend`, `already exists`, `not configured`). Only the user named in
`DAILY_TASK_USER_ID` may call it.

### Configuration

Copy `.env.example` into the `.env` your Docmost stack already uses and fill in
the two UUIDs. Everything else has a default.

| Variable | Default | Meaning |
|---|---|---|
| `DAILY_TASK_ENABLED` | `false` | Must be exactly `true` to run |
| `DAILY_TASK_SPACE_ID` | — | Space the pages are created in |
| `DAILY_TASK_USER_ID` | — | User recorded as the page author |
| `DAILY_TASK_PARENT_PAGE_ID` | — | Optional parent page |
| `DAILY_TASK_TITLE` | `{date}` | Page title, taking the same date placeholders as a template title |
| `DAILY_TASK_CRON` | `0 6 * * 1-5` | When to run |
| `DAILY_TASK_TIMEZONE` | `Asia/Ho_Chi_Minh` | Zone for the schedule and the date in the title |
| `DAILY_TASK_ICON` | — | Emoji for the page |
| `DAILY_TASK_SECTION_TODAY` | `Task hôm nay` | Heading for today's list |
| `DAILY_TASK_SECTION_TOMORROW` | `Dự kiến hôm sau` | Heading for tomorrow's plan |
| `DAILY_TASK_SECTION_NOTES` | `Ghi chú` | Heading for free notes |
| `DAILY_TASK_STANDING_ITEMS` | — | Fixed lines added every day, separated by `\|` |

Renaming a section heading on a running instance means yesterday's page no
longer matches, and that day's carry-over is skipped. Rename during a gap, or
accept losing one day of carry-over. The same goes for `DAILY_TASK_TITLE`:
yesterday's page is found by its title, so changing the pattern hides the
pages already written under the old one.

If the space also has a default template, give the template the **same title**
as `DAILY_TASK_TITLE`. Then a day written by hand and a day written by the cron
are named alike, and either can be carried forward from. When the two disagree,
a line is written to the log on every boot saying so, because the symptom
otherwise is only that some days quietly lose their unfinished work.

## Templates API

Six endpoints, matching what the bundled front-end expects:

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/templates` | `{ spaceId?, limit?, cursor? }` | paginated list |
| `POST /api/templates/info` | `{ templateId }` | one template with content |
| `POST /api/templates/create` | `{ title, description?, icon?, spaceId?, content? }` | created template |
| `POST /api/templates/update` | `{ templateId, ... }` | updated template |
| `POST /api/templates/delete` | `{ templateId }` | — |
| `POST /api/templates/use` | `{ templateId, spaceId, parentPageId? }` | the new page |
| `POST /api/templates/create-from-page` | `{ pageId, title?, description?, setAsSpaceDefault? }` | created template |
| `POST /api/templates/space-default` | `{ spaceId }` | the space's default template, or `null` |
| `POST /api/templates/set-space-default` | `{ spaceId, templateId }` | the new default; `templateId: null` clears it |

Access rules:

- A template bound to a space follows that space's page permissions: `Read` to
  view or use it, `Edit` to create, change or delete it.
- A template with no space is workspace-wide: any member may view and use it,
  only its creator may change or delete it.
- Choosing a space's default template is a space **setting**, not a page edit:
  it changes what every member of that space gets when they create a page, so
  it needs the right to manage the space.

## Templates in the interface

Open any page's `...` menu:

- **Save as template** copies that page's current content into a reusable
  template in its space. The dialog offers a tick box, *Use it for every new
  page in this space*, which also makes it the space's default.
- **Insert from template** lists the space's templates. Clicking one drops it
  into the page you are on: into an empty page it lands whole, into a page with
  text it lands at the cursor. Each row also has a star, which sets or clears
  the space default, and a bin.

### What "default" does

Once a space has a default template, creating a page there opens it already
filled in, and named. There is no second click and no picker.

The template's own title names the page, and a date placeholder in it becomes
that day's date, so a template called `công việc ngày {dd/mm/yyyy}` makes a page
called `công việc ngày 17/11/2026`. A title you type yourself always wins.

| Placeholder | Becomes |
|---|---|
| `{date}`, `{yyyy-mm-dd}` | `2026-11-17` |
| `{dd/mm/yyyy}` | `17/11/2026` |
| `{dd-mm-yyyy}` | `17-11-2026` |
| `{mm/yyyy}` | `11/2026` |
| `{yyyy}`, `{mm}`, `{dd}` | the one part |
| `{weekday}` | `Thứ Ba` |

Case and spaces inside the braces do not matter. A name that is not on this
list is left exactly as typed, rather than blanked: seeing `{DAYS}` in a page
title tells you at once that nothing was substituted. The zone comes from
`TEMPLATE_TITLE_TIMEZONE`, then `DAILY_TASK_TIMEZONE`, then
`Asia/Ho_Chi_Minh`; the language of `{weekday}` from `TEMPLATE_TITLE_LOCALE`,
default `vi-VN`.

It works by filling in the request that the new-page button already sends,
before the page is written, so Docmost builds the collaborative document from
the template the same way it would from any other content. That matters: a
template applied *after* the page exists would race the editor session that is
already opening, and lose.

Details worth knowing:

- **Only genuinely blank pages are filled.** Anything that arrives carrying its
  own content is left alone: an import, a duplicate, a page made deliberately
  from another template, the daily task pages below.
- **Sub-pages are filled too.** A default is a property of the space, not of
  the top level.
- **A deleted template degrades to blank.** If the default is deleted, or the
  lookup fails for any reason, you get an ordinary empty page and a line in the
  server log. A failed click is never the outcome.
- **No migration.** The chosen template's id is stored in the existing
  `spaces.settings` jsonb column, merged in rather than overwriting, so a later
  Docmost release carries it along untouched.

## Install

```bash
git clone https://github.com/sondt99/docmost-daily-tasks.git
git clone https://github.com/docmost/docmost.git
git -C docmost checkout v0.97.0

./docmost-daily-tasks/apply.sh ./docmost     # copies the files, registers the modules
docker build -t docmost-local:0.97.0 ./docmost
```

`apply.sh` can be run again on the same checkout without duplicating anything,
which is what you want after pulling a newer Docmost tag.

Then point your compose file at the image you just built, add
`pull_policy: never` so Compose does not look for it on a registry, and
restart. Your data lives in the Postgres and storage volumes, so changing the
app image leaves it untouched — just never bring the stack down with `-v`.

## Tests

The date arithmetic, the carry-over rules and the decision of which requests
get filled from a template are covered by unit tests:

```bash
cd docmost/apps/server && npx jest src/integrations/daily-task src/core/template
```

## A note on the enterprise front-end

Docmost's community edition is AGPL-3.0 and so is this repository. But the
template **user interface** at `apps/client/src/ee/template` carries a separate
Docmost Enterprise License, which states the files "may only be used in
production" by subscribers.

That interface is compiled into the stock Docker image whether or not the API
behind it answers, and it stays switched off: it is gated behind a licence
feature flag that a community build never sets. This repository leaves that
gate shut and ships its own interface instead, under `features/page-template`,
so nothing here depends on the enterprise files.

If you would rather unlock Docmost's own template interface, that is a
one-line change to the entitlement endpoint — and a licence question, not a
technical one. Read the licence before making it.

The daily task pages do not touch that interface at all. They create ordinary
pages through the ordinary page service, so that half of this repository is
unaffected either way.
