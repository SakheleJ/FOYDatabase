// SCRIPT: congregation.js
// Congregation rendering + add/update/delete functions used by congregations page

const CONG_CARD_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#14b8a6','#6366f1','#ec4899'];

function getCongCardColor(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return CONG_CARD_COLORS[Math.abs(h) % CONG_CARD_COLORS.length];
}

function _congToast(message, type) {
  if (typeof showToast === 'function') showToast(message, type);
  else alert(message);
}

// -------------------- TABLE (dashboard use) --------------------
function updateCongregationTable(presbyteryID) {
  const tableBody = document.querySelector("#congregation-table tbody");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  const db = getDatabase();
  const currentCongregations = db.Congregation || [];
  const normalizedPresbyteryID = Number(presbyteryID);

  const filtered = currentCongregations
    .filter(c => Number(c.presbyteryID) === normalizedPresbyteryID)
    .slice()
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  filtered.forEach((c, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${index + 1}</td><td>${c.name}</td>`;
    row.addEventListener("click", () => {
      tableBody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
      row.classList.add("selected");
    });
    tableBody.appendChild(row);
  });
}

// -------------------- REGISTER --------------------
function registerCongregationFromInputs() {
  const presbyteryValRaw = document.getElementById("presbytery-select")?.value;
  const presbyteryVal = Number(presbyteryValRaw);
  const nameEl = document.getElementById("congregation-name");
  const name = nameEl ? nameEl.value.trim() : "";

  if (!presbyteryValRaw || Number.isNaN(presbyteryVal)) {
    alert("Please select a Presbytery first.");
    return;
  }
  if (!name) {
    alert("Please enter a congregation name.");
    return;
  }

  const db = getDatabase();
  if (!db.Congregation) db.Congregation = [];

  const duplicate = db.Congregation.some(c =>
    Number(c.presbyteryID) === presbyteryVal &&
    c.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    alert(`Congregation "${name}" already exists in this presbytery.`);
    return;
  }

  const newId = generateGUID();
  const newCong = { congregationID: newId, presbyteryID: presbyteryVal, name };
  db.Congregation.push(newCong);
  saveDatabase(db);
  trackChange("addCongregation", newCong, null);
  if (nameEl) nameEl.value = "";
  updateCongregationTable(presbyteryVal);
}

function registerCongregationModal() {
  const presbyteryIdRaw = document.getElementById("cong-presbytery-select")?.value;
  const presbyteryId = Number(presbyteryIdRaw);
  const nameEl = document.getElementById("congregation-name");
  const name = nameEl ? nameEl.value.trim() : "";
  const errorEl = document.getElementById("congregation-error");

  if (errorEl) errorEl.textContent = "";

  if (!presbyteryIdRaw || Number.isNaN(presbyteryId)) {
    if (errorEl) errorEl.textContent = "Please select a presbytery.";
    return;
  }
  if (!name) {
    if (errorEl) errorEl.textContent = "Please enter a congregation name.";
    return;
  }

  const db = getDatabase();
  if (!db.Congregation) db.Congregation = [];

  const duplicate = db.Congregation.some(c =>
    Number(c.presbyteryID) === presbyteryId &&
    c.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    if (errorEl) errorEl.textContent = `Congregation "${name}" already exists in this presbytery.`;
    return;
  }

  const newId = generateGUID();
  const newCong = { congregationID: newId, presbyteryID: presbyteryId, name };
  db.Congregation.push(newCong);
  saveDatabase(db);
  trackChange("addCongregation", newCong, null);
  if (typeof updateFileStatus === "function") updateFileStatus();

  const cu = JSON.parse(localStorage.getItem("currentUser")) || {};
  cu.activePresbytery = db.Presbytery.find(p => Number(p.presbyteryID) === presbyteryId) || cu.activePresbytery;
  localStorage.setItem("currentUser", JSON.stringify(cu));

  if (nameEl) nameEl.value = "";
  if (errorEl) errorEl.textContent = "";

  try {
    const modal = bootstrap.Modal.getInstance(document.getElementById("registerCongregationModal"));
    if (modal) modal.hide();
  } catch (e) {}

  loadCongregations();
  _congToast(`Congregation "${name}" added successfully.`);
}

// -------------------- EDIT --------------------
function openEditCongregation(id) {
  const db = getDatabase();
  const c = (db.Congregation || []).find(x => x.congregationID === id);
  if (!c) return;

  document.getElementById("editCongregationID").value = c.congregationID;
  document.getElementById("editCongregationName").value = c.name;
  document.getElementById("edit-congregation-error").textContent = "";

  // Populate presbytery select
  const sel = document.getElementById("editCongregationPresbytery");
  if (sel) {
    sel.innerHTML = "";
    (db.Presbytery || []).forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.presbyteryID;
      opt.textContent = p.name;
      if (Number(p.presbyteryID) === Number(c.presbyteryID)) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById("editCongregationModal")).show();
}

function saveEditCongregation() {
  const id = document.getElementById("editCongregationID").value;
  const name = document.getElementById("editCongregationName").value.trim();
  const presbyteryId = Number(document.getElementById("editCongregationPresbytery").value);
  const errorEl = document.getElementById("edit-congregation-error");

  errorEl.textContent = "";
  if (!name) { errorEl.textContent = "Name field is required."; return; }

  const db = getDatabase();
  const duplicate = (db.Congregation || []).some(c =>
    c.name.toLowerCase() === name.toLowerCase() &&
    Number(c.presbyteryID) === presbyteryId &&
    c.congregationID !== id
  );
  if (duplicate) { errorEl.textContent = "A congregation with this name already exists in that presbytery."; return; }

  const idx = (db.Congregation || []).findIndex(c => c.congregationID === id);
  if (idx === -1) return;

  const oldRecord = { ...db.Congregation[idx] };
  db.Congregation[idx].name = name;
  db.Congregation[idx].presbyteryID = presbyteryId;
  saveDatabase(db);
  trackChange("updateCongregation", db.Congregation[idx], oldRecord);
  if (typeof updateFileStatus === "function") updateFileStatus();

  bootstrap.Modal.getInstance(document.getElementById("editCongregationModal")).hide();
  loadCongregations();
  _congToast("Congregation updated successfully!");
}

// -------------------- DELETE --------------------
let _pendingDeleteCongId = null;

function openDeleteCongregationConfirmation(id, name) {
  const db = getDatabase();
  const memberCount = (db.Affiliation || []).filter(a => a.congregationID === id).length;

  const warningEl = document.getElementById("deleteCongregationWarning");
  const confirmBtn = document.getElementById("confirmDeleteCongregationBtn");

  if (memberCount > 0) {
    warningEl.textContent = `Cannot delete — this congregation has ${memberCount} member${memberCount !== 1 ? 's' : ''}. Remove them first.`;
    warningEl.classList.remove("d-none");
    confirmBtn.classList.add("d-none");
    _pendingDeleteCongId = null;
  } else {
    warningEl.classList.add("d-none");
    confirmBtn.classList.remove("d-none");
    _pendingDeleteCongId = id;
  }

  document.getElementById("deleteCongregationName").textContent = name;
  bootstrap.Modal.getOrCreateInstance(document.getElementById("deleteCongregationModal")).show();
}

function confirmDeleteCongregation() {
  if (!_pendingDeleteCongId) return;
  const id = _pendingDeleteCongId;
  _pendingDeleteCongId = null;

  try { bootstrap.Modal.getInstance(document.getElementById("deleteCongregationModal")).hide(); } catch (e) {}

  const db = getDatabase();
  const oldRecord = (db.Congregation || []).find(c => c.congregationID === id);
  const removedAffiliations = (db.Affiliation || []).filter(a => a.congregationID === id);
  db.Congregation = (db.Congregation || []).filter(c => c.congregationID !== id);
  db.Affiliation = (db.Affiliation || []).filter(a => a.congregationID !== id);
  saveDatabase(db);
  trackChange("deleteCongregation", null, oldRecord || { congregationID: id });
  removedAffiliations.forEach(a => trackChange("deleteAffiliation", null, a));
  if (typeof updateFileStatus === "function") updateFileStatus();

  loadCongregations();
  _congToast("Congregation deleted.", "error");
}

// -------------------- PERIOD HELPERS --------------------
function getCongLastPeriod(congID, affiliations) {
  const years = affiliations
    .filter(a => a.congregationID === congID)
    .map(a => Number(a.yearRegistered))
    .filter(y => !isNaN(y) && y > 0);
  return years.length ? Math.max(...years) : null;
}

function getCongPeriodCounts(congID, affiliations) {
  const congAffs = affiliations.filter(a => a.congregationID === congID);
  const lastPeriod = getCongLastPeriod(congID, affiliations);
  if (!lastPeriod) return { lastPeriod: null, activeCount: 0, inactiveCount: 0 };
  const activeMemberIDs = new Set(
    congAffs.filter(a => Number(a.yearRegistered) === lastPeriod).map(a => a.memberID)
  );
  const allMemberIDs = new Set(congAffs.map(a => a.memberID));
  const inactiveCount = [...allMemberIDs].filter(id => !activeMemberIDs.has(id)).length;
  return { lastPeriod, activeCount: activeMemberIDs.size, inactiveCount };
}

// -------------------- LOAD CARDS --------------------
function loadCongregations() {
  const db = getDatabase();
  const congregations = db.Congregation || [];
  const presbyteries = db.Presbytery || [];
  const affiliations = db.Affiliation || [];

  const container = document.getElementById("congregationList");
  if (!container) return;

  const currentUser = JSON.parse(localStorage.getItem("currentUser")) || {};
  const activePresbyteryID = currentUser.activePresbytery?.presbyteryID
    ? Number(currentUser.activePresbytery.presbyteryID)
    : null;
  const activePresbytery = presbyteries.find(p => Number(p.presbyteryID) === activePresbyteryID);

  const scope = getUserScope();
  let filtered = [...congregations];

  if (scope.presbytery !== "ALL") {
    filtered = filtered.filter(c => {
      const pres = presbyteries.find(p => String(p.presbyteryID) === String(c.presbyteryID));
      return pres && pres.name === scope.presbytery;
    });
  } else if (activePresbytery) {
    filtered = filtered.filter(c => Number(c.presbyteryID) === activePresbyteryID);
  }

  if (scope.congregation !== "ALL") {
    filtered = filtered.filter(c => c.name === scope.congregation);
  }

  // Fallback: active presbytery exists but has no congregations — show all
  if (activePresbytery && filtered.length === 0 && congregations.length > 0 && scope.presbytery === "ALL") {
    filtered = [...congregations];
  }

  // Search filter
  const searchEl = document.getElementById("congregationSearch");
  const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";
  if (searchTerm) {
    filtered = filtered.filter(c => {
      const presName = (presbyteries.find(p => Number(p.presbyteryID) === Number(c.presbyteryID)) || {}).name || "";
      return c.name.toLowerCase().includes(searchTerm) || presName.toLowerCase().includes(searchTerm);
    });
  }

  // Sort
  const sortEl = document.getElementById("congregationSort");
  const sortVal = sortEl ? sortEl.value : "period";
  if (sortVal === "name") {
    filtered = [...filtered].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  } else if (sortVal === "active") {
    filtered = [...filtered].sort((a, b) => {
      const { activeCount: ca } = getCongPeriodCounts(a.congregationID, affiliations);
      const { activeCount: cb } = getCongPeriodCounts(b.congregationID, affiliations);
      return cb - ca;
    });
  } else {
    // Default: sort by last active period descending, then by name
    filtered = [...filtered].sort((a, b) => {
      const pa = getCongLastPeriod(a.congregationID, affiliations) || 0;
      const pb = getCongLastPeriod(b.congregationID, affiliations) || 0;
      return pb - pa || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }

  // Stats
  const statsEl = document.getElementById("congregationStats");
  if (statsEl) {
    const total = congregations.length;
    const showing = filtered.length;
    statsEl.textContent = searchTerm
      ? `${showing} of ${total} congregation${total === 1 ? '' : 's'} match`
      : `${total} congregation${total === 1 ? '' : 's'}`;
  }

  // Empty state
  const emptyEl = document.getElementById("congregationEmpty");
  container.innerHTML = "";

  if (filtered.length === 0) {
    if (emptyEl) emptyEl.classList.remove("d-none");
    return;
  }
  if (emptyEl) emptyEl.classList.add("d-none");

  filtered.forEach(c => {
    const presName = (presbyteries.find(p => Number(p.presbyteryID) === Number(c.presbyteryID)) || {}).name || "Unknown Presbytery";
    const { lastPeriod, activeCount, inactiveCount } = getCongPeriodCounts(c.congregationID, affiliations);
    const color = getCongCardColor(c.congregationID);

    const periodHtml = lastPeriod
      ? `<span class="text-muted me-1">·</span>
         <span class="fw-semibold me-1">${lastPeriod}</span>
         <span class="badge bg-success-subtle text-success-emphasis me-1" title="Active in ${lastPeriod}"><i class="bi bi-people"></i> ${activeCount}</span>
         ${inactiveCount > 0 ? `<span class="badge bg-secondary-subtle text-secondary-emphasis" title="Not active in ${lastPeriod}"><i class="bi bi-person-dash"></i> ${inactiveCount}</span>` : ''}`
      : `<span class="text-muted fst-italic">No records</span>`;

    const card = document.createElement("div");
    card.className = "col-12 col-sm-6 col-md-4 mb-2 cong-col";
    card.innerHTML = `
      <div class="card cong-card shadow-sm p-0" style="cursor:pointer;" title="Click to view members">
        <div class="d-flex align-items-stretch">
          <div class="color-block" style="background:${color}; width:6px; flex-shrink:0; border-radius:4px 0 0 4px;"></div>
          <div class="px-3 py-2 flex-grow-1">
            <div class="d-flex align-items-center justify-content-between gap-2">
              <span class="fw-semibold text-truncate" style="font-size:0.95rem;">${c.name}</span>
              <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-outline-secondary btn-edit-cong presby-btn" title="Edit"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-outline-danger btn-delete-cong presby-btn" title="Delete"><i class="bi bi-trash3"></i></button>
              </div>
            </div>
            <div class="d-flex align-items-center flex-wrap gap-1 mt-1" style="font-size:0.78rem;">
              <span class="text-muted">${presName}</span>
              ${periodHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    const cardEl = card.querySelector(".cong-card");

    cardEl.addEventListener("click", (e) => {
      if (e.target.closest(".btn-edit-cong") || e.target.closest(".btn-delete-cong")) return;
      localStorage.setItem("selectedCongregation", c.congregationID);
      window.location.href = "members.html";
    });

    card.querySelector(".btn-edit-cong").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditCongregation(c.congregationID);
    });

    card.querySelector(".btn-delete-cong").addEventListener("click", (e) => {
      e.stopPropagation();
      openDeleteCongregationConfirmation(c.congregationID, c.name);
    });

    container.appendChild(card);
  });
}

// -------------------- EVENT WIRING --------------------
document.addEventListener("DOMContentLoaded", () => { initDatabase().then(() => {
  const presSel = document.getElementById("presbytery-select");
  if (presSel) {
    presSel.addEventListener("change", () => {
      const val = Number(presSel.value);
      if (!Number.isNaN(val)) updateCongregationTable(val);
    });
  }

  if (typeof loadPresbyteries === "function") loadPresbyteries();
  else if (typeof renderPresbyterySelect === "function") renderPresbyterySelect();

  const activePresbyteryID = JSON.parse(localStorage.getItem("currentUser") || "{}")?.activePresbytery?.presbyteryID;
  const congPresbySelect = document.getElementById("cong-presbytery-select");
  if (congPresbySelect && activePresbyteryID) congPresbySelect.value = activePresbyteryID;

  if (document.getElementById("congregationList")) loadCongregations();

  const tableBody = document.querySelector("#congregation-table tbody");
  if (tableBody) {
    const presId = document.getElementById("presbytery-select")?.value;
    if (presId) updateCongregationTable(presId);
  }

  const regCongBtn = document.getElementById("btn-register-congregation");
  if (regCongBtn) regCongBtn.addEventListener("click", (e) => { e.preventDefault(); registerCongregationFromInputs(); });

  const searchEl = document.getElementById("congregationSearch");
  if (searchEl) searchEl.addEventListener("input", loadCongregations);

  const sortEl = document.getElementById("congregationSort");
  if (sortEl) sortEl.addEventListener("change", loadCongregations);

  const confirmDeleteBtn = document.getElementById("confirmDeleteCongregationBtn");
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDeleteCongregation);
}); });

// -------------------- TABLE INLINE ADD (legacy) --------------------
const addBtn = document.getElementById("add-congregation-btn");
const congregationTable = document.getElementById("congregation-table");

if (addBtn && congregationTable) {
  addBtn.addEventListener("click", () => addNewRow());

  congregationTable.addEventListener("keydown", (e) => {
    const input = e.target;
    if (input.tagName !== "INPUT") return;
    const row = input.closest("tr");

    if (e.key === "Enter") {
      const presbyteryID = parseInt(document.getElementById("presbytery-select").value);
      if (!presbyteryID) { alert("Please select a Presbytery first."); return; }

      const db = getDatabase();
      if (!db.Congregation) db.Congregation = [];

      const inputs = congregationTable.querySelectorAll("input");
      const newRecords = [];

      inputs.forEach(inputRow => {
        const name = inputRow.value.trim();
        if (!name) return;
        const duplicate = db.Congregation.some(c => c.presbyteryID === presbyteryID && c.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
          alert(`Congregation "${name}" already exists in this presbytery.`);
        } else {
          const rec = { congregationID: generateGUID(), presbyteryID, name };
          db.Congregation.push(rec);
          newRecords.push(rec);
        }
      });

      saveDatabase(db);
      newRecords.forEach(r => trackChange("addCongregation", r, null));
      inputs.forEach(inputRow => inputRow.closest("tr").remove());
      updateCongregationTable(presbyteryID);
    } else if (e.key === "Escape") {
      row.remove();
    }
  });
}

function addNewRow() {
  if (!congregationTable) return;
  const row = document.createElement("tr");
  const cellIndex = document.createElement("td");
  const cellName = document.createElement("td");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter name";
  cellName.appendChild(input);
  row.appendChild(cellIndex);
  row.appendChild(cellName);
  congregationTable.appendChild(row);
  input.focus();
}

// -------------------- PUBLIC API --------------------
window.updateCongregationTable = updateCongregationTable;
window.registerCongregation = registerCongregationFromInputs;
window.registerCongregationModal = registerCongregationModal;
window.loadCongregations = loadCongregations;
window.openEditCongregation = openEditCongregation;
window.saveEditCongregation = saveEditCongregation;
window.addCongregation = () => addBtn && addBtn.click();
