# Directory Setup

The Directory is a separate Google Sheet from your FOY Database data sheet. It holds
user accounts and, for each user, which data sheet(s) they're allowed to use. The main
app talks to it first at login, then connects to whichever data sheet it's told to use —
exactly like today, except the sheet URL now comes from the Directory instead of being
pasted in by hand.

## Step 1 — Create your Directory Sheet

1. Go to https://sheets.google.com and create a new spreadsheet
2. Name it **FOY Directory**
3. You don't need to create any tabs manually — the script creates them on first run

## Step 2 — Open Apps Script

1. In the Sheet, click **Extensions → Apps Script**
2. Delete all existing code in the editor (the default `myFunction` stub)
3. Paste the full contents of `Directory.gs` into the editor
4. Click **Save** (floppy disk icon or Ctrl+S)
5. Name the project **FOY Directory API**

## Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set the following:
   - **Description:** FOY Directory v1
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Click **Authorize access** and follow the Google sign-in prompts
6. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfy.../exec`

## Step 4 — Point the app at your Directory

Paste the Web app URL from Step 3 into the `DIRECTORY_URL` constant in `index.html`
(and redeploy/republish the app's static files). Unlike the data sheet URL, this is
not something a user pastes in — it's fixed into the app itself, since every device
should talk to the same Directory.

## Step 5 — Add your data sheet as a Structure

In the Directory Sheet's **Structures** tab, add one row with just the **Script ID**
from your data sheet's Web app URL — not the whole URL. The Directory reconstructs
the full URL itself when a user logs in.

Your data sheet's Web app URL (from `../SETUP.md`) looks like:
`https://script.google.com/macros/s/AKfycbwAbc123.../exec` — the Script ID is the
part between `/s/` and `/exec`, e.g. `AKfycbwAbc123...`.

| name | scriptId |
|------|----------|
| Main Database | *AKfycbwAbc123...* |

If you paste the full URL by mistake, the Directory still works — it extracts the ID
from it automatically — but storing just the ID is what's expected going forward.

You can name it anything — the name is just a label shown to a user if they ever have
more than one structure to choose from. Add more rows later if you ever split data
into additional sheets (e.g. per presbytery); no code changes are needed to do that,
just more rows here and in Users' `structures` column.

## Step 6 — Copy over your existing users

In the Directory Sheet's **Users** tab, manually re-create each account currently in
your data sheet's `Users` tab (`UserID, name, email, password, role, congregation` all
carry over as-is — it's the same SHA-256 password hash, not the plaintext password).
Add one more value: `structures`, set to the name you used in Step 5 (e.g. `Main
Database`) for every user who should be able to log in.

Use `structures: ALL` for a user who should have access to every structure —
including ones you add later — instead of naming them individually. `ALL` is a
wildcard, not a real structure name; it's resolved dynamically against whatever
rows exist in the Structures tab at login time.

This is a one-time manual copy, not an automated migration — the data sheet's own
`Users` tab is left alone and simply stops being used for login once this is done.

## Re-deploying after changes

If you edit `Directory.gs` later, you must create a **new deployment** (not update the
existing one) for the changes to take effect:
Deploy → New deployment → Web app → (same settings) → Deploy

## Sheet tabs created automatically

| Tab | Purpose |
|-----|---------|
| Users | UserID, name, email, password (hash), role, structures (comma-separated), congregation |
| Structures | name, scriptId — each row is one data sheet a user can be granted access to |
| ChangeLog | audit trail of user/structure changes made through this Directory |
