# Todojam

A personal, Todoist-style task manager. Local-first, no subscription.

**Status:** foundation. Runs in the browser today; the Mac app shell (Tauri), calendar, reminders, Todoist import, Google Calendar and stats come in later PRs.

## What works now

- Quick add (press `Q`): `#Project`, `#Parent/Sub` (or `#"Name with spaces"`), `/Section`, `p1`-`p4`, `@label`, natural dates and times (`tue 7pm`, `tom`, `fri`), `{deadline}`, `every mon`, `for 1h30m`. Unknown projects and sections are created. Click a highlighted chip to turn it back into plain text.
- Inbox, Today (with Overdue), Projects with custom-named sections and one level of subprojects.
- Subtasks (one level) with every task field.
- Task timer: play/pause, auto-stop on complete, editable h:mm:ss, one running at a time.
- Data is saved in the browser's local storage for now.

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # parser + data model tests
npm run build
```

## Layout

- `src/model/` data types, pure state transitions (`db.ts`), storage
- `src/parser/quickAdd.ts` natural-language parser
- `src/ui/` views and components
