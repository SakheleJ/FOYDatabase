// ============================================================
// FOY — Audit / change-tracking helpers
// Depends on: sheet.js (postToSheet)
// ============================================================

var AUDIT_SKIP_FIELDS = ["lastModified", "lastModifiedBy"];

// Returns { field: [oldValue, newValue] } for every field that changed.
// oldRecord is null/undefined for add actions.
function computeDiff(oldRecord, newRecord) {
  if (!oldRecord || !newRecord) return {};
  var diff = {};
  Object.keys(newRecord).forEach(function(key) {
    if (AUDIT_SKIP_FIELDS.includes(key)) return;
    var oldVal = String(oldRecord[key] !== undefined ? oldRecord[key] : "");
    var newVal = String(newRecord[key] !== undefined ? newRecord[key] : "");
    if (oldVal !== newVal) {
      diff[key] = [oldVal, newVal];
    }
  });
  return diff;
}

// Human-readable label for a record, used in the ChangeLog "recordName" column.
function buildRecordName(table, record) {
  if (!record) return "";
  switch (table) {
    case "Member":
      return ((record.surname || "") + ", " + (record.name || "")).trim().replace(/^,\s*/, "");
    case "Affiliation":
      return ((record.surname || "") + ", " + (record.name || "") + " (" + (record.yearRegistered || "") + ")").trim();
    case "Congregation":
      return record.name || "";
    case "Presbytery":
      return record.name || "";
    default:
      return "";
  }
}

// Derives the table name from an action string (e.g. "updateMember" → "Member").
function tableFromAction(action) {
  if (!action) return "";
  var lower = action.toLowerCase();
  if (lower.includes("member") && !lower.includes("affiliation")) return "Member";
  if (lower.includes("affiliation")) return "Affiliation";
  if (lower.includes("congregation")) return "Congregation";
  if (lower.includes("presbytery")) return "Presbytery";
  if (lower.includes("user")) return "Users";
  return "";
}

// ============================================================
// Main entry point — replaces direct postToSheet calls.
// Computes diff, builds recordName, then posts to Sheet.
//
// action:    e.g. "addMember", "updateMember", "deletePresbytery"
// newRecord: the record as saved (null for deletes)
// oldRecord: the record before the change (null for adds)
// ============================================================
function trackChange(action, newRecord, oldRecord) {
  var table      = tableFromAction(action);
  var displayRec = newRecord || oldRecord || {};
  var recordName = buildRecordName(table, displayRec);
  var changes    = {};

  var actionType = action.toLowerCase().startsWith("add")    ? "add"
                 : action.toLowerCase().startsWith("update") ? "update"
                 : action.toLowerCase().startsWith("delete") ? "delete"
                 : "other";

  if (actionType === "update") {
    changes = computeDiff(oldRecord, newRecord);
    // Nothing actually changed — skip the write
    if (Object.keys(changes).length === 0) return Promise.resolve(null);
  } else if (actionType === "add") {
    // Summarise the new record's key fields
    var summaryFields = ["name", "surname", "yearRegistered", "congregationID", "presbyteryID"];
    summaryFields.forEach(function(f) {
      if (displayRec[f] !== undefined && displayRec[f] !== "") {
        changes[f] = displayRec[f];
      }
    });
  } else if (actionType === "delete") {
    changes = { deleted: recordName || JSON.stringify(displayRec) };
  }

  return postToSheet(action, newRecord || oldRecord, {
    changes:    changes,
    recordName: recordName
  }).catch(function(err) {
    console.warn("Sheet sync (" + action + "):", err.message);
  });
}
