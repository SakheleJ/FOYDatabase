// ============================================================
// FOY Database — Google Apps Script Web App
// Deploy as: Execute as "Me", Access "Anyone"
// ============================================================

var SHEET_NAMES = {
  users:         "Users",
  presbyteries:  "Presbyteries",
  congregations: "Congregations",
  members:       "Members",
  affiliations:  "Affiliations",
  changelog:     "ChangeLog"
};

// lastModified and lastModifiedBy are appended to every data table
// so every row carries a full audit trail of who changed it and when.
var HEADERS = {
  users:         ["UserID", "name", "email", "password", "role", "presbytery", "congregation", "lastModified", "lastModifiedBy"],
  presbyteries:  ["presbyteryID", "name", "synod", "lastModified", "lastModifiedBy"],
  congregations: ["congregationID", "name", "presbyteryID", "lastModified", "lastModifiedBy"],
  members:       ["memberID", "title", "surname", "name", "dob", "gender", "lastModified", "lastModifiedBy", "PresbyteryID", "CongregationID", "Presbytery", "Congregation"],
  affiliations:  ["affiliationID", "memberID", "congregationID", "yearRegistered", "title", "surname", "name", "dob", "gender", "lastModified", "lastModifiedBy", "Presbytery", "Congregation"],
  changelog:     ["changeID", "timestamp", "changedBy", "action", "table", "recordID", "recordName", "changes"]
};

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

// Returns all rows as objects, optionally filtered to rows changed after `since`
function sheetToObjects(sheetKey, since) {
  var sheet = getSheet(SHEET_NAMES[sheetKey]);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];

  var sinceTime = since ? new Date(since).getTime() : null;
  var modifiedColIndex = headers.indexOf("lastModified");

  return data.slice(1).filter(function(row) {
    if (row[0] === "" || row[0] === null || row[0] === undefined) return false;
    if (sinceTime && modifiedColIndex > -1) {
      var rowTime = row[modifiedColIndex] ? new Date(row[modifiedColIndex]).getTime() : 0;
      return rowTime > sinceTime;
    }
    return true;
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
  // Read the existing row so that fields absent from obj (e.g. congregation fields
  // on a plain main-app member update) are preserved rather than erased.
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
  var idField = record.memberID || record.affiliationID || record.congregationID || record.presbyteryID || record.UserID || "";
  var row = [
    generateGUID(),
    record.lastModified || new Date().toISOString(),
    payload.changedBy  || "unknown",
    action,
    tableFromAction(action),
    String(idField),
    payload.recordName || "",
    JSON.stringify(payload.changes || {})
  ];
  getSheet(SHEET_NAMES.changelog).appendRow(row);
}

function tableFromAction(action) {
  var a = (action || "").toLowerCase();
  if (a.includes("affiliation"))  return "Affiliation";
  if (a.includes("member"))       return "Member";
  if (a.includes("congregation")) return "Congregation";
  if (a.includes("presbytery"))   return "Presbytery";
  if (a.includes("user"))         return "Users";
  return "";
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
// doGet — read collections, optionally only rows changed since a timestamp.
// Scope params narrow the response to a single presbytery / congregation.
// Usage: ?since=T&presbytery=Name&congregation=Name
// ============================================================
function doGet(e) {
  try {
    Object.keys(SHEET_NAMES).forEach(function(key) { ensureHeaders(key); });

    var params       = (e && e.parameter) ? e.parameter : {};
    var since        = params.since        || null;
    var collection   = params.collection   || null;
    var scopePres    = params.presbytery   || null; // null = no filter (admin)
    var scopeCong    = params.congregation || null;

    // Lightweight fetch — return only the requested collection (e.g. ?collection=users)
    if (collection === "users") {
      return respond({ success: true, data: { users: sheetToObjects("users") }, asOf: new Date().toISOString() });
    }

    // Fetch all rows (delta-filtered by `since` where applicable)
    var allPresbyteries  = sheetToObjects("presbyteries",  since);
    var allCongregations = sheetToObjects("congregations", since);
    var allMembers       = sheetToObjects("members",       since);
    var allAffiliations  = sheetToObjects("affiliations",  since);

    // Apply presbytery scope filter
    if (scopePres) {
      var presRow = sheetToObjects("presbyteries").filter(function(p) { return p.name === scopePres; })[0];
      var presID  = presRow ? String(presRow.presbyteryID) : null;

      if (presID) {
        allPresbyteries  = allPresbyteries.filter(function(p)  { return String(p.presbyteryID) === presID; });
        allCongregations = allCongregations.filter(function(c) { return String(c.presbyteryID) === presID; });

        // Collect congregation IDs in this presbytery for member/affiliation filtering
        var congIDsInPres = sheetToObjects("congregations")
          .filter(function(c) { return String(c.presbyteryID) === presID; })
          .map(function(c)    { return String(c.congregationID); });

        allAffiliations = allAffiliations.filter(function(a) { return congIDsInPres.indexOf(String(a.congregationID)) > -1; });

        var memberIDsInPres = allAffiliations.map(function(a) { return String(a.memberID); });
        allMembers = allMembers.filter(function(m) { return memberIDsInPres.indexOf(String(m.memberID)) > -1; });
      }
    }

    // Apply congregation scope filter (narrows further if presbytery was also set)
    if (scopeCong) {
      var congRow = sheetToObjects("congregations").filter(function(c) { return c.name === scopeCong; })[0];
      var congID  = congRow ? String(congRow.congregationID) : null;

      if (congID) {
        allCongregations = allCongregations.filter(function(c) { return String(c.congregationID) === congID; });
        allAffiliations  = allAffiliations.filter(function(a)  { return String(a.congregationID) === congID; });

        var memberIDsInCong = allAffiliations.map(function(a) { return String(a.memberID); });
        allMembers = allMembers.filter(function(m) { return memberIDsInCong.indexOf(String(m.memberID)) > -1; });
      }
    }

    var db = {
      users:        sheetToObjects("users", since),
      Presbytery:   allPresbyteries,
      Congregation: allCongregations,
      Member:       allMembers,
      Affiliation:  allAffiliations
    };

    return respond({ success: true, data: db, asOf: new Date().toISOString() });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// ============================================================
// doPost — write operations
// Payload shape: { action, record, changedBy }
// changedBy: the name of the logged-in user making the change
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return respond({ success: false, error: "Server busy — another write is in progress. Please retry." });
  }

  try {
    var payload   = JSON.parse(e.postData.contents);
    var action    = payload.action;
    var record    = payload.record    || {};
    var changedBy = payload.changedBy || "unknown";
    var result    = {};

    // Stamp every write with server time + who made the change
    stampChange(record, changedBy);

    if (action === "addUser") {
      ensureHeaders("users");
      appendRow("users", record);
      result = { UserID: record.UserID };

    } else if (action === "updateUser") {
      ensureHeaders("users");
      var row = findRowByID("users", "UserID", record.UserID);
      if (row === -1) throw new Error("User not found: " + record.UserID);
      updateRow("users", row, record);
      result = { updated: true };

    } else if (action === "deleteUser") {
      var row = findRowByID("users", "UserID", record.UserID);
      if (row === -1) throw new Error("User not found: " + record.UserID);
      deleteRow("users", row);
      result = { deleted: true };

    } else if (action === "addPresbytery") {
      ensureHeaders("presbyteries");
      appendRow("presbyteries", record);
      result = { presbyteryID: record.presbyteryID };

    } else if (action === "updatePresbytery") {
      ensureHeaders("presbyteries");
      var row = findRowByID("presbyteries", "presbyteryID", record.presbyteryID);
      if (row === -1) throw new Error("Presbytery not found: " + record.presbyteryID);
      updateRow("presbyteries", row, record);
      result = { updated: true };

    } else if (action === "deletePresbytery") {
      var row = findRowByID("presbyteries", "presbyteryID", record.presbyteryID);
      if (row === -1) throw new Error("Presbytery not found: " + record.presbyteryID);
      deleteRow("presbyteries", row);
      result = { deleted: true };

    } else if (action === "addCongregation") {
      ensureHeaders("congregations");
      appendRow("congregations", record);
      result = { congregationID: record.congregationID };

    } else if (action === "updateCongregation") {
      ensureHeaders("congregations");
      var row = findRowByID("congregations", "congregationID", record.congregationID);
      if (row === -1) throw new Error("Congregation not found: " + record.congregationID);
      updateRow("congregations", row, record);
      result = { updated: true };

    } else if (action === "deleteCongregation") {
      var row = findRowByID("congregations", "congregationID", record.congregationID);
      if (row === -1) throw new Error("Congregation not found: " + record.congregationID);
      deleteRow("congregations", row);
      result = { deleted: true };

    } else if (action === "addMember") {
      ensureHeaders("members");
      if (!record.memberID) record.memberID = generateGUID();
      appendRow("members", record);
      result = { memberID: record.memberID };

    } else if (action === "updateMember") {
      ensureHeaders("members");
      var row = findRowByID("members", "memberID", record.memberID);
      if (row === -1) throw new Error("Member not found: " + record.memberID);
      updateRow("members", row, record);
      result = { updated: true };

    } else if (action === "deleteMember") {
      var row = findRowByID("members", "memberID", record.memberID);
      if (row === -1) throw new Error("Member not found: " + record.memberID);
      deleteRow("members", row);
      result = { deleted: true };

    } else if (action === "addAffiliation") {
      ensureHeaders("affiliations");
      if (!record.affiliationID) record.affiliationID = generateGUID();
      appendRow("affiliations", record);
      result = { affiliationID: record.affiliationID };

    } else if (action === "updateAffiliation") {
      ensureHeaders("affiliations");
      var row = findRowByID("affiliations", "affiliationID", record.affiliationID);
      if (row === -1) throw new Error("Affiliation not found: " + record.affiliationID);
      updateRow("affiliations", row, record);
      result = { updated: true };

    } else if (action === "deleteAffiliation") {
      var row = findRowByID("affiliations", "affiliationID", record.affiliationID);
      if (row === -1) throw new Error("Affiliation not found: " + record.affiliationID);
      deleteRow("affiliations", row);
      result = { deleted: true };

    } else if (action === "batchCommit") {
      // Bulk strategy: read each affected sheet ONCE into memory, do all lookups
      // and mutations in memory, then flush with a single setValues() per sheet.
      // This replaces N sheet reads + N appendRow calls with 1 read + 1 write per sheet,
      // cutting execution time from O(N²) to O(N) and avoiding the 6-minute timeout.
      var items = payload.items || [];
      var batchResults = [];
      var changeLogRows = [];

      // ── Load sheets into memory ──────────────────────────────
      var congSheet  = getSheet(SHEET_NAMES.congregations);
      var memSheet   = getSheet(SHEET_NAMES.members);
      var affilSheet = getSheet(SHEET_NAMES.affiliations);
      ensureHeaders("congregations"); ensureHeaders("members"); ensureHeaders("affiliations");

      var congHeaders  = HEADERS.congregations;
      var memHeaders   = HEADERS.members;
      var affilHeaders = HEADERS.affiliations;

      // Read all existing data once (2D arrays, row 0 = header)
      var congData  = congSheet.getDataRange().getValues();
      var memData   = memSheet.getDataRange().getValues();
      var affilData = affilSheet.getDataRange().getValues();

      // Build ID→rowIndex maps for O(1) lookups
      var congIDCol  = congHeaders.indexOf("congregationID");
      var memIDCol   = memHeaders.indexOf("memberID");
      var affilIDCol = affilHeaders.indexOf("affiliationID");

      var memRowMap = {};   // memberID → 0-based index in memData
      for (var r = 1; r < memData.length; r++) {
        memRowMap[String(memData[r][memIDCol])] = r;
      }

      // Accumulators for new rows to append
      var newCongRows  = [];
      var newMemRows   = [];
      var newAffilRows = [];
      // Accumulator for member rows that need updating: { dataIdx, row }
      var memUpdates   = [];

      // ── Process each item ────────────────────────────────────
      items.forEach(function(item) {
        try {
          var rec = item.record || {};
          stampChange(rec, changedBy);

          if (item.action === "addCongregation") {
            var crow = congHeaders.map(function(h) { return rec[h] !== undefined ? rec[h] : ""; });
            newCongRows.push(crow);
            batchResults.push({ action: item.action, success: true });

          } else if (item.action === "addMember") {
            if (!rec.memberID) rec.memberID = generateGUID();
            var mrow = memHeaders.map(function(h) { return rec[h] !== undefined ? rec[h] : ""; });
            newMemRows.push(mrow);
            memRowMap[rec.memberID] = memData.length + newMemRows.length - 1; // tentative index
            batchResults.push({ action: item.action, memberID: rec.memberID, success: true });

          } else if (item.action === "updateMember") {
            var idx = memRowMap[String(rec.memberID)];
            if (idx !== undefined) {
              // Merge: keep existing values for fields absent from rec
              var existing = memData[idx];
              var updated  = memHeaders.map(function(h, ci) {
                return rec[h] !== undefined ? rec[h] : (existing[ci] !== undefined ? existing[ci] : "");
              });
              memUpdates.push({ idx: idx, row: updated });
              memData[idx] = updated; // keep in-memory map consistent
              batchResults.push({ action: item.action, success: true });
            } else {
              batchResults.push({ action: item.action, success: false, error: "Member not found" });
            }

          } else if (item.action === "addAffiliation") {
            if (!rec.affiliationID) rec.affiliationID = generateGUID();
            var arow = affilHeaders.map(function(h) { return rec[h] !== undefined ? rec[h] : ""; });
            newAffilRows.push(arow);
            batchResults.push({ action: item.action, affiliationID: rec.affiliationID, success: true });
          }

          // Accumulate changelog row (written in one batch below)
          try {
            var idField = rec.memberID || rec.affiliationID || rec.congregationID || rec.presbyteryID || "";
            changeLogRows.push([
              generateGUID(),
              rec.lastModified || new Date().toISOString(),
              changedBy,
              item.action,
              tableFromAction(item.action),
              String(idField),
              item.recordName || "",
              JSON.stringify(item.changes || {})
            ]);
          } catch(e) {}

        } catch(itemErr) {
          batchResults.push({ action: item.action, success: false, error: itemErr.message });
        }
      });

      // ── Flush new rows (one setValues per sheet) ─────────────
      if (newCongRows.length) {
        var cStart = congData.length + 1; // next empty row (1-based)
        congSheet.getRange(cStart, 1, newCongRows.length, congHeaders.length).setValues(newCongRows);
      }
      if (newMemRows.length) {
        var mStart = memData.length + 1;
        memSheet.getRange(mStart, 1, newMemRows.length, memHeaders.length).setValues(newMemRows);
      }
      if (memUpdates.length) {
        // Write each updated member row back (updates are sparse so still individual ranges,
        // but each is a single setValues instead of a read+write pair)
        memUpdates.forEach(function(u) {
          memSheet.getRange(u.idx + 1, 1, 1, memHeaders.length).setValues([u.row]);
        });
      }
      if (newAffilRows.length) {
        var aStart = affilData.length + 1;
        affilSheet.getRange(aStart, 1, newAffilRows.length, affilHeaders.length).setValues(newAffilRows);
      }

      // Flush changelog rows in one batch
      if (changeLogRows.length) {
        ensureHeaders("changelog");
        var clSheet = getSheet(SHEET_NAMES.changelog);
        var clStart = clSheet.getLastRow() + 1;
        clSheet.getRange(clStart, 1, changeLogRows.length, HEADERS.changelog.length).setValues(changeLogRows);
      }

      result = { count: items.length, results: batchResults };

    } else {
      throw new Error("Unknown action: " + action);
    }

    // Append to ChangeLog for every successful write (skip changelog actions themselves)
    if (action !== "logChange") {
      try { appendChangeLog(payload, action, record); } catch(e) { /* never fail a write over a log error */ }
    }

    return respond({ success: true, result: result, lastModified: record.lastModified, lastModifiedBy: record.lastModifiedBy });

  } catch (err) {
    return respond({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}
