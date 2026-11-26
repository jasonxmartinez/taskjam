# Todojam

A personal, Todoist-style task manager. Local-first, no subscription.

**Status:** runs in the browser and as a Mac app. Todoist import is not built yet.

## What works now

- Quick add (press `Q`): `#Project`, `#Parent/Sub` (or `#"Name with spaces"`), `/Section`, `p1`-`p4`, `@label`, natural dates and times (`tue 7pm`, `tom`, `fri`), `{deadline}`, `every mon`, `for 1h30m`. Unknown projects and sections are created. Click a highlighted chip to turn it back into plain text. Projects, subprojects, sections, priorities and labels autocomplete by prefix as you type (`#sch` offers School, Schedules): ↑/↓ to choose, Tab to pick. The `?` button lists all shortcuts.
- Inbox, Today (with Overdue), Projects with custom-named sections and one level of subprojects.
- Subtasks (one level) with every task field.
- Task timer: play/pause, auto-stop on complete, editable h:mm:ss, one running at a time.
- Calendar: 3/4/5-day view (opens on 3), drag to reschedule, drag a task's bottom edge to change its duration (15-minute steps), click a slot to add.
- Reminders: 10 minutes before every timed task by default (editable per task and in Settings); date-only tasks remind at 9:00 AM. Each reminder fires once.
- Stats: completed today/this week/this month against your goals (5 a day, 30 a week by default), streak, a 28-day chart, and completions and tracked time by project.
- Google Calendar events (Mac app): read-only, from every calendar you have turned on, shown in the Calendar view with a hide/show checkbox. Setup: [docs/google-calendar-setup.md](docs/google-calendar-setup.md).
- Data is saved in local storage for now (the WebView's, in the Mac app).

## Run it

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # parser + data model tests
npm run build
```

## Mac app (Tauri)

Needs Rust ([rustup.rs](https://rustup.rs)) and Xcode command line tools (`xcode-select --install`).

```sh
npm run app:dev     # run the app with hot reload
npm run app:build   # builds Todojam.app and a .dmg in src-tauri/target/release/bundle
```

- Menu bar icon with Quick add / Open / Quit. The running task timer shows next to the icon.
- Global shortcut **Cmd+Shift+Space** opens a small quick-add window from any app.
- Closing the window keeps Todojam running in the menu bar so reminders still fire. Quit from the menu bar icon.
- Settings > Launch at login keeps it running after restarts.
- The first launch of an unsigned app: right-click the app, choose Open, once.

## Layout

- `src/model/` data types, pure state transitions (`db.ts`), storage
- `src/parser/quickAdd.ts` natural-language parser, `src/parser/autocomplete.ts` quick-add suggestions
- `src/ui/` views and components
- `src/calendar/`, `src/reminders/` calendar layout and reminder scheduling
- `src/stats/`, `src/google/` stats and Google Calendar events
- `src-tauri/` Mac app shell (Rust), including `src/google.rs` for Google sign-in and fetching
