// ============================================================
// FOY — Google Sheet sync layer
// ============================================================

var SHEET_URL_KEY    = "foySheetURL";
var LAST_SYNC_KEY    = "foyLastSync";

function getSheetURL() {
  return localStorage.getItem(SHEET_URL_KEY) || "";
}

function saveSheetURL(url) {
  localStorage.setItem(SHEET_URL_KEY, url.trim());
}

function getLastSyncTime() {
  return localStorage.getItem(LAST_SYNC_KEY) || null;
}

function saveLastSyncTime(isoString) {
  localStorage.setItem(LAST_SYNC_KEY, isoString);
}

// Returns the name of the currently logged-in user (for audit trail)
function getCurrentUserName() {
  try {
    var user = JSON.parse(localStorage.getItem("currentUser") || "{}");
    return user.name || user.email || "unknown";
  } catch (e) {
    return "unknown";
  }
}

// ============================================================
// Merge incoming changed rows into an existing array by ID field.
// New records are appended; existing records are updated in place.
// ============================================================
function mergeRecords(existing, incoming, idField) {
  if (!incoming || incoming.length === 0) return existing;
  var result = existing.slice();
  incoming.forEach(function(newRow) {
    var idx = result.findIndex(function(r) {
      return String(r[idField]) === String(newRow[idField]);
    });
    if (idx > -1) {
      result[idx] = newRow; // update existing
    } else {
      result.push(newRow);  // new record
    }
  });
  return result;
}

// ============================================================
// Pull data from the Sheet into localStorage.
// On first sync (no lastSyncTime) fetches everything.
// On subsequent syncs fetches only rows changed since last sync.
// Scope params (presbytery / congregation) are passed so the
// Apps Script returns only rows the user is permitted to see.
// ============================================================
async function syncFromSheet(url, scopeOverride) {
  var target = url || getSheetURL();
  if (!target) throw new Error("No Google Sheet URL saved. Please enter it on the login page.");

  // Resolve scope — caller can pass explicit scope (e.g. during login before
  // currentUser is fully persisted), otherwise fall back to getUserScope().
  var scope = scopeOverride || getUserScope();

  var lastSync = getLastSyncTime();
  var params = new URLSearchParams();
  if (lastSync)                        params.set("since",        lastSync);
  if (scope.presbytery   !== "ALL")    params.set("presbytery",   scope.presbytery);
  if (scope.congregation !== "ALL")    params.set("congregation", scope.congregation);
  var queryString = params.toString();
  var fetchURL = queryString ? (target + "?" + queryString) : target;

  var response = await fetch(fetchURL, { method: "GET" });
  if (!response.ok) throw new Error("Could not reach Google Sheet (" + response.status + "). Check the URL.");

  var json = await response.json();
  if (!json.success) throw new Error(json.error || "Sheet returned an error.");

  var existing = getDatabase();
  var isFullSync = !lastSync;

  if (isFullSync) {
    // First load — replace everything, but keep users from Sheet if present
    var synced = {
      users:        (json.data.users && json.data.users.length) ? json.data.users : (existing.users || []),
      Presbytery:   json.data.Presbytery   || [],
      Congregation: json.data.Congregation || [],
      Member:       json.data.Member       || [],
      Affiliation:  json.data.Affiliation  || []
    };
    saveDatabase(synced);
  } else {
    // Delta sync — merge only changed rows
    var merged = {
      users:        mergeRecords(existing.users        || [], json.data.users        || [], "UserID"),
      Presbytery:   mergeRecords(existing.Presbytery   || [], json.data.Presbytery   || [], "presbyteryID"),
      Congregation: mergeRecords(existing.Congregation || [], json.data.Congregation || [], "congregationID"),
      Member:       mergeRecords(existing.Member       || [], json.data.Member       || [], "memberID"),
      Affiliation:  mergeRecords(existing.Affiliation  || [], json.data.Affiliation  || [], "affiliationID")
    };
    saveDatabase(merged);
  }

  // Record the server's reported sync time so next delta is accurate
  saveLastSyncTime(json.asOf || new Date().toISOString());

  return getDatabase();
}

// ============================================================
// Write a single record change back to the Sheet.
// changedBy is injected automatically from the logged-in user.
// opts.changes:    diff object { field: [oldVal, newVal] } (from audit.js)
// opts.recordName: human-readable label for the ChangeLog
// ============================================================
async function postToSheet(action, record, opts) {
  var url = getSheetURL();
  if (!url) return null; // no sheet connected — local-only mode

  opts = opts || {};

  var response = await fetch(url, {
    method: "POST",
    // text/plain avoids CORS preflight; Apps Script reads e.postData.contents
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action:     action,
      record:     record,
      changedBy:  getCurrentUserName(),
      changes:    opts.changes    || {},
      recordName: opts.recordName || ""
    })
  });

  if (!response.ok) throw new Error("Sheet write failed (" + response.status + ").");
  var json = await response.json();
  if (!json.success) throw new Error(json.error || "Sheet write error.");

  // Keep lastSyncTime current so the next delta doesn't re-fetch our own write
  if (json.lastModified) saveLastSyncTime(json.lastModified);

  return json.result;
}
