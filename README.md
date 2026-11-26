# Todojam

A personal, Todoist-style task manager. Local-first, no subscription.

**Status:** runs in the browser and as a Mac app. Todoist import, Google Calendar events and stats come in later PRs.

## What works now

- Quick add (press `Q`): `#Project`, `#Parent/Sub` (or `#"Name with spaces"`), `/Section`, `p1`-`p4`, `@label`, natural dates and times (`tue 7pm`, `tom`, `fri`), `{deadline}`, `every mon`, `for 1h30m`. Unknown projects and sections are created. Click a highlighted chip to turn it back into plain text.
- Inbox, Today (with Overdue), Projects with custom-named sections and one level of subprojects.
- Subtasks (one level) with every task field.
- Task timer: play/pause, auto-stop on complete, editable h:mm:ss, one running at a time.
- Calendar: 3/4/5-day view (opens on 3), drag to reschedule, click a slot to add.
- Reminders: 10 minutes before every timed task by default (editable per task and in Settings); date-only tasks remind at 9:00 AM. Each reminder fires once.
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
- `src/parser/quickAdd.ts` natural-language parser
- `src/ui/` views and components
- `src/calendar/`, `src/reminders/` calendar layout and reminder scheduling
- `src-tauri/` Mac app shell (Rust)
