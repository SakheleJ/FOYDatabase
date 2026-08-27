// ============================================================
// FOY Directory — Auth gate / structure router
// Deploy as: Execute as "Me", Access "Anyone"
//
// This Sheet holds ONLY user accounts and the list of data
// sheets ("structures") each user may access. It holds no
// congregation/member data itself — that stays on each
// structure's own Web App (see ../Code.gs), unchanged.
// ============================================================

var SHEET_NAMES = {
  users:      "Users",
  structures: "Structures",
  changelog:  "ChangeLog"
};

var HEADERS = {
  users:      ["UserID", "name", "email", "password", "role", "structures", "congregation", "lastModified", "lastModifiedBy"],
  structures: ["name", "scriptId", "lastModified", "lastModifiedBy"],
  changelog:  ["changeID", "timestamp", "changedBy", "action", "table", "recordID", "recordName", "changes"]
};

// ============================================================
// Turns a stored Script ID into the actual Web App URL a client
// can connect to. Tolerant of someone pasting the full URL by
// mistake instead of just the ID — the ID is extracted either way.
// ============================================================
function scriptIdToUrl(value) {
  var raw = String(value || "").trim();
  if (!raw) return "";
  var match = raw.match(/\/s\/([^\/]+)\//);
  var id = match ? match[1] : raw;
  return "https://script.google.com/macros/s/" + id + "/exec";
}

// ============================================================
// GUID generator
// ============================================================
function generateGUID() {
  var chars = "0123456789abcdef";
  var guid = "";
  var groups = [8, 4, 4, 4, 12];
  groups.forEach(function(len, i) {
    if (i > 0) guid += "-";
    for (var j = 0; j < len; j++) {
      guid += chars[Math.floor(Math.random() * 16)];
    }
  });
  return guid;
}

// ============================================================
// Stamp change metadata onto a record (server-side, always trusted)
// ============================================================
function stampChange(record, changedBy) {
  record.lastModified   = new Date().toISOString();
  record.lastModifiedBy = changedBy || "unknown";
  return record;
}

// ============================================================
// Sheet helpers
// ============================================================
function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function ensureHeaders(sheetKey) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  var headers = HEADERS[sheetKey];
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeaders = headers.every(function(h, i) { return firstRow[i] === h; });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#e8eaf6");
    sheet.setFrozenRows(1);
  }
}

// Returns all rows as objects
function sheetToObjects(sheetKey) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];

  return data.slice(1).filter(function(row) {
    return row[0] !== "" && row[0] !== null && row[0] !== undefined;
  }).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i] !== undefined ? String(row[i]) : "";
    });
    return obj;
  });
}

function findRowByID(sheetKey, idField, idValue) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return -1;
  var headers = data[0];
  var colIndex = headers.indexOf(idField);
  if (colIndex === -1) return -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(idValue)) {
      return i + 1; // 1-based sheet row number
    }
  }
  return -1;
}

function appendRow(sheetKey, obj) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  var headers = HEADERS[sheetKey];
  var row = headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ""; });
  sheet.appendRow(row);
}

function updateRow(sheetKey, rowNumber, obj) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  var headers = HEADERS[sheetKey];
  var existing = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var row = headers.map(function(h, i) {
    return obj[h] !== undefined ? obj[h] : (existing[i] !== undefined ? existing[i] : "");
  });
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
}

function deleteRow(sheetKey, rowNumber) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  sheet.deleteRow(rowNumber);
}

// ============================================================
// ChangeLog helper — appends one audit row per write
// ============================================================
function appendChangeLog(payload, action, record) {
  ensureHeaders("changelog");
  var idField = record.UserID || "";
  var row = [
    generateGUID(),
    record.lastModified || new Date().toISOString(),
    payload.changedBy  || "unknown",
    action,
    "Users",
    String(idField),
    payload.recordName || "",
    JSON.stringify(payload.changes || {})
  ];
  getSheet(SHEET_NAMES.changelog).appendRow(row);
}

// ============================================================
// CORS response helper
// ============================================================
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doGet — kept minimal on purpose: the Directory never hands out
// the Users table in bulk (no equivalent of Code.gs's
// "?collection=users" leak). The only thing it will list is the
// Structures tab (names + URLs, no credentials) so the "Register
// User" form can offer a picker of which structure(s) to grant.
// ============================================================
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (params.action === "structures") {
    ensureHeaders("structures");
    var structures = sheetToObjects("structures").map(function(s) {
      return { name: s.name, url: scriptIdToUrl(s.scriptId) };
    });
    return respond({ success: true, structures: structures });
  }
  return respond({ success: false, error: "This endpoint only accepts POST logins, or ?action=structures." });
}

// ============================================================
// doPost — login + user management
// Payload shape: { action, record, changedBy }
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return respond({ success: false, error: "Server busy — another request is in progress. Please retry." });
  }

  try {
    Object.keys(SHEET_NAMES).forEach(function(key) { ensureHeaders(key); });

    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;

    // ---------------------------------------------------------
    // login — the only action a non-admin ever needs to call
    // ---------------------------------------------------------
    if (action === "login") {
      var email    = String(payload.email    || "").trim().toLowerCase();
      var password = String(payload.password || "").trim();

      var user = sheetToObjects("users").filter(function(u) {
        return u.email.toLowerCase() === email;
      })[0];

      if (!user || user.password !== password) {
        return respond({ success: false, error: "Invalid email or password." });
      }

      var structureNames = (user.structures || "")
        .split(",")
        .map(function(s) { return s.trim(); })
        .filter(function(s) { return s; });

      var allStructures = sheetToObjects("structures");

      // "ALL" is a wildcard, not a real structure name — it always resolves
      // to every structure currently in the Structures tab, so an admin's
      // access grows automatically as new structures are added later.
      var isAll = structureNames.some(function(s) { return s.toUpperCase() === "ALL"; });

      var structures = isAll
        ? allStructures.map(function(s) { return { name: s.name, url: scriptIdToUrl(s.scriptId) }; })
        : structureNames.map(function(name) {
            var match = allStructures.filter(function(s) { return s.name === name; })[0];
            return match ? { name: match.name, url: scriptIdToUrl(match.scriptId) } : null;
          }).filter(Boolean);

      return respond({
        success: true,
        user: {
          name:        user.name,
          email:       user.email,
          role:        user.role,
          congregation: user.congregation
        },
        structures: structures
      });
    }

    // ---------------------------------------------------------
    // User management (client-side role-gated only, same trust
    // model as the rest of this app — no server-side permission
    // check here)
    // ---------------------------------------------------------
    var record    = payload.record    || {};
    var changedBy = payload.changedBy || "unknown";
    var result    = {};

    stampChange(record, changedBy);

    if (action === "addUser") {
      ensureHeaders("users");
      if (!record.UserID) {
        var existingIDs = sheetToObjects("users").map(function(u) { return Number(u.UserID); }).filter(function(n) { return !isNaN(n); });
        record.UserID = existingIDs.length ? Math.max.apply(null, existingIDs) + 1 : 1;
      }
      appendRow("users", record);
      result = { UserID: record.UserID };

    } else if (action === "updateUser") {
      ensureHeaders("users");
      var row = findRowByID("users", "UserID", record.UserID);
      if (row === -1) throw new Error("User not found: " + record.UserID);
      updateRow("users", row, record);
      result = { updated: true };

    } else if (action === "deleteUser") {
      var row2 = findRowByID("users", "UserID", record.UserID);
      if (row2 === -1) throw new Error("User not found: " + record.UserID);
      deleteRow("users", row2);
      result = { deleted: true };

    } else if (action === "addStructure") {
      ensureHeaders("structures");
      appendRow("structures", record);
      result = { name: record.name };

    } else if (action === "updateStructure") {
      ensureHeaders("structures");
      var row3 = findRowByID("structures", "name", record.name);
      if (row3 === -1) throw new Error("Structure not found: " + record.name);
      updateRow("structures", row3, record);
      result = { updated: true };

    } else {
      throw new Error("Unknown action: " + action);
    }

    try { appendChangeLog(payload, action, record); } catch (e2) { /* never fail a write over a log error */ }

    return respond({ success: true, result: result, lastModified: record.lastModified, lastModifiedBy: record.lastModifiedBy });

  } catch (err) {
    return respond({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}
