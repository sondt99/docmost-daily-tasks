# docmost-daily-tasks

Two additions to a self-hosted [Docmost](https://github.com/docmost/docmost)
community edition server:

1. **A templates API.** Docmost ships the `templates` table, its repository and
   its front-end, but the controller and service that join them live in the
   closed enterprise submodule, so `POST /api/templates` answers `404` on a
   community build. This re-implements that layer from scratch.
2. **Daily task pages.** On every working day a page is created in a space of
   your choosing, carrying yesterday's unfinished work forward.

Nothing here is copied from the enterprise edition. The server code was written
against the public API contract in `apps/client/src/ee/template/services`, which
is what the shipped front-end calls.

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
| `DAILY_TASK_CRON` | `0 6 * * 1-5` | When to run |
| `DAILY_TASK_TIMEZONE` | `Asia/Ho_Chi_Minh` | Zone for the schedule and the date in the title |
| `DAILY_TASK_ICON` | — | Emoji for the page |
| `DAILY_TASK_SECTION_TODAY` | `Task hôm nay` | Heading for today's list |
| `DAILY_TASK_SECTION_TOMORROW` | `Dự kiến hôm sau` | Heading for tomorrow's plan |
| `DAILY_TASK_SECTION_NOTES` | `Ghi chú` | Heading for free notes |
| `DAILY_TASK_STANDING_ITEMS` | — | Fixed lines added every day, separated by `\|` |

Renaming a section heading on a running instance means yesterday's page no
longer matches, and that day's carry-over is skipped. Rename during a gap, or
accept losing one day of carry-over.

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

Access rules:

- A template bound to a space follows that space's page permissions: `Read` to
  view or use it, `Edit` to create, change or delete it.
- A template with no space is workspace-wide: any member may view and use it,
  only its creator may change or delete it.

## Install

```bash
git clone https://github.com/docmost/docmost.git
cd docmost && git checkout v0.97.0
cd .. && ./apply.sh ./docmost
cd docmost && docker build -t docmost-local:0.97.0 .
```

Then point your compose file at the image you just built and restart.

## Tests

The date arithmetic and carry-over rules are covered by unit tests:

```bash
cd docmost/apps/server && npx jest src/integrations/daily-task
```

## A note on the enterprise front-end

Docmost's community edition is AGPL-3.0 and so is this repository. But the
template **user interface** at `apps/client/src/ee/template` carries a separate
Docmost Enterprise License, which states the files "may only be used in
production" by subscribers.

That interface is compiled into the stock Docker image whether or not the API
behind it answers. Giving it a working backend makes it usable, and whether you
may use it in production is between you and that licence — read it before you
rely on those buttons.

The daily task pages do not touch that interface at all. They create ordinary
pages through the ordinary page service, so that half of this repository is
unaffected either way.
