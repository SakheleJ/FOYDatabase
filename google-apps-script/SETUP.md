# Google Apps Script Setup

## Step 1 — Create your Google Sheet

1. Go to https://sheets.google.com and create a new spreadsheet
2. Name it **FOY Database**
3. You don't need to create any tabs manually — the script creates them on first run

## Step 2 — Open Apps Script

1. In the Sheet, click **Extensions → Apps Script**
2. Delete all existing code in the editor (the default `myFunction` stub)
3. Paste the full contents of `Code.gs` into the editor
4. Click **Save** (floppy disk icon or Ctrl+S)
5. Name the project **FOY Database API**

## Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set the following:
   - **Description:** FOY Database v1
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Click **Authorize access** and follow the Google sign-in prompts
6. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfy.../exec`

## Step 4 — Connect the app

Paste the Web app URL into the FOY app's "Connect to Google Sheet" field on the login page.

## Re-deploying after changes

If you edit Code.gs later, you must create a **new deployment** (not update the existing one)
for the changes to take effect:
Deploy → New deployment → Web app → (same settings) → Deploy

## Sheet tabs created automatically

| Tab | Purpose |
|-----|---------|
| Presbyteries | presbyteryID, name, synod |
| Congregations | congregationID, name, presbyteryID |
| Members | memberID (GUID), title, surname, name, dob, gender |
| Affiliations | affiliationID (GUID), memberID, congregationID, yearRegistered, title, surname, name, dob, gender |
