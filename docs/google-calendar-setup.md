# Connect Google Calendar (about 5 minutes, free)

Todojam reads your calendar events and shows them next to your tasks. It never creates or changes events. This only works in the Mac app.

You create your own small Google "client" once, so no one else (including me) holds your calendar access.

1. Go to https://console.cloud.google.com and create a project (for example "Todojam").
2. **APIs & Services > Library**, search for **Google Calendar API**, click **Enable**.
3. **APIs & Services > OAuth consent screen** (may be called "Google Auth Platform"):
   - User type: **External**. Fill in an app name (Todojam) and your email.
   - Add the scope `.../auth/calendar.readonly` if asked.
   - **Publish the app** (set publishing status to "In production"). Leave it unverified. If you leave it in "Testing", Google signs you out every 7 days.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Desktop app**. Name: Todojam.
   - Copy the **Client ID** and **Client secret**.
5. In Todojam: **Settings > Google Calendar**, paste both, click **Connect Google Calendar**.
6. Your browser opens. Choose your Google account. Google shows "Google hasn't verified this app": click **Advanced**, then **Go to Todojam (unsafe)**. This warning is normal for your own unverified app. Approve read-only calendar access.
7. Back in Todojam, events from every calendar you have turned on in Google Calendar appear in the Calendar view. Use the **Google events** checkbox to hide them.

## Notes

- The sign-in token is stored in Todojam's local storage on your Mac (not the Keychain yet).
- To disconnect: **Settings > Disconnect**, and optionally remove Todojam at https://myaccount.google.com/permissions.
- Events refresh every 5 minutes and when you switch back to the app.
