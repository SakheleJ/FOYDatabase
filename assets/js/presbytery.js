// SCRIPT: presbytery.js
// Presbytery management functions (register, load, render dropdown/table)

const CARD_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#14b8a6','#6366f1','#ec4899'];

function getCardColor(id) {
  return CARD_COLORS[Number(id) % CARD_COLORS.length];
}

function showToast(message, type) {
  const toast = document.getElementById('appToast');
  const body = document.getElementById('appToastBody');
  if (!toast || !body) { alert(message); return; }
  const bgClass = type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning' : 'bg-success';
  toast.className = `toast align-items-center text-white border-0 ${bgClass}`;
  body.textContent = message;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

function registerPresbytery() {
  const nameEl = document.getElementById("presbyteryName");
  const synodEl = document.getElementById("presbyterySynod");
  const errorEl = document.getElementById("presbytery-error");

  const name = nameEl ? nameEl.value.trim() : "";
  const synod = synodEl ? synodEl.value.trim() : "";

  if (errorEl) errorEl.textContent = "";

  if (!name) {
    if (errorEl) errorEl.textContent = "Name field is required.";
    return;
  }

  const db = getDatabase();

  if (db.Presbytery.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    if (errorEl) errorEl.textContent = "Presbytery already exists.";
    return;
  }

  const currentIds = db.Presbytery.map(p => Number(p.presbyteryID)).filter(v => !Number.isNaN(v));
  const newId = currentIds.length ? Math.max(...currentIds) + 1 : 1;

  const newPresbytery = { presbyteryID: Number(newId), name, synod };

  db.Presbytery.push(newPresbytery);
  saveDatabase(db);
  trackChange("addPresbytery", newPresbytery, null);
  if (typeof updateFileStatus === "function") updateFileStatus();

  try {
    const modal = bootstrap.Modal.getInstance(document.getElementById("registerPresbyteryModal"));
    if (modal) modal.hide();
  } catch (e) {}

  if (nameEl) nameEl.value = "";
  if (synodEl) synodEl.value = "";

  renderPresbyterySelect();
  if (typeof renderPresbyteryTable === "function") renderPresbyteryTable();
  loadPresbyteryCards();
  showToast("Presbytery added successfully!");
}

function openEditPresbytery(id) {
  const db = getDatabase();
  const p = db.Presbytery.find(x => Number(x.presbyteryID) === Number(id));
  if (!p) return;

  document.getElementById("editPresbyteryID").value = p.presbyteryID;
  document.getElementById("editPresbyteryName").value = p.name;
  document.getElementById("editPresbyterySynod").value = p.synod || "";
  document.getElementById("edit-presbytery-error").textContent = "";

  bootstrap.Modal.getOrCreateInstance(document.getElementById("editPresbyteryModal")).show();
}

function saveEditPresbytery() {
  const id = Number(document.getElementById("editPresbyteryID").value);
  const name = document.getElementById("editPresbyteryName").value.trim();
  const synod = document.getElementById("editPresbyterySynod").value.trim();
  const errorEl = document.getElementById("edit-presbytery-error");

  errorEl.textContent = "";

  if (!name) { errorEl.textContent = "Name field is required."; return; }

  const db = getDatabase();
  const duplicate = db.Presbytery.some(p => p.name.toLowerCase() === name.toLowerCase() && Number(p.presbyteryID) !== id);
  if (duplicate) { errorEl.textContent = "Another presbytery with this name already exists."; return; }

  const idx = db.Presbytery.findIndex(p => Number(p.presbyteryID) === id);
  if (idx === -1) return;

  const oldRecord = { ...db.Presbytery[idx] };
  db.Presbytery[idx].name = name;
  db.Presbytery[idx].synod = synod;
  saveDatabase(db);
  trackChange("updatePresbytery", db.Presbytery[idx], oldRecord);
  if (typeof updateFileStatus === "function") updateFileStatus();

  bootstrap.Modal.getInstance(document.getElementById("editPresbyteryModal")).hide();
  renderPresbyterySelect();
  if (typeof renderPresbyteryTable === "function") renderPresbyteryTable();
  loadPresbyteryCards();
  showToast("Presbytery updated successfully!");
}

let _pendingDeleteId = null;

function openDeleteConfirmation(id, name) {
  const db = getDatabase();
  const congCount = (db.Congregation || []).filter(c => Number(c.presbyteryID) === Number(id)).length;

  const warningEl = document.getElementById("deletePresbyteryWarning");
  const confirmBtn = document.getElementById("confirmDeletePresbyteryBtn");

  if (congCount > 0) {
    warningEl.textContent = `Cannot delete — this presbytery has ${congCount} congregation${congCount !== 1 ? 's' : ''}. Remove them first.`;
    warningEl.classList.remove("d-none");
    confirmBtn.classList.add("d-none");
    _pendingDeleteId = null;
  } else {
    warningEl.classList.add("d-none");
    confirmBtn.classList.remove("d-none");
    _pendingDeleteId = id;
  }

  document.getElementById("deletePresbyteryName").textContent = name;
  bootstrap.Modal.getOrCreateInstance(document.getElementById("deletePresbyteryModal")).show();
}

function confirmDeletePresbytery() {
  if (_pendingDeleteId === null) return;
  const id = _pendingDeleteId;
  _pendingDeleteId = null;

  try {
    bootstrap.Modal.getInstance(document.getElementById("deletePresbyteryModal")).hide();
  } catch (e) {}

  const db = getDatabase();
  const oldRecord = db.Presbytery.find(p => Number(p.presbyteryID) === Number(id));
  const removedCongs = db.Congregation ? db.Congregation.filter(c => Number(c.presbyteryID) === Number(id)) : [];
  db.Presbytery = db.Presbytery.filter(p => Number(p.presbyteryID) !== Number(id));
  if (db.Congregation) db.Congregation = db.Congregation.filter(c => Number(c.presbyteryID) !== Number(id));
  saveDatabase(db);
  trackChange("deletePresbytery", null, oldRecord || { presbyteryID: id });
  removedCongs.forEach(c => trackChange("deleteCongregation", null, c));
  if (typeof updateFileStatus === "function") updateFileStatus();

  renderPresbyterySelect();
  if (typeof renderPresbyteryTable === "function") renderPresbyteryTable();
  loadPresbyteryCards();
  showToast("Presbytery deleted.", "error");
}

function loadPresbyteries() {
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const presbyterySelect = document.getElementById("presbytery-select");
  if (currentUser && currentUser.activePresbytery && presbyterySelect) {
    presbyterySelect.value = currentUser.activePresbytery.presbyteryID || currentUser.activePresbytery.PresbyteryID || "";
  }
  return renderPresbyterySelect();
}

function renderPresbyterySelect() {
  const presbyteries = getDatabase().Presbytery || [];
  const selectEls = document.querySelectorAll("[data-presbytery-select], #presbytery-select");

  selectEls.forEach(selectEl => {
    if (!selectEl) return;
    const placeholder = selectEl.getAttribute("data-placeholder") || "-- Select Presbytery --";
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    presbyteries.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.presbyteryID;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
  });

  return presbyteries;
}

function renderPresbyteryTable() {
  const tbody = document.querySelector("#presbytery-table tbody");
  if (!tbody) return;

  const presbyteries = getDatabase().Presbytery || [];
  tbody.innerHTML = "";
  presbyteries.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${p.name}</td>
      <td>${p.synod || ""}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deletePresbytery(${p.presbyteryID})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function deletePresbytery(id) {
  if (!confirm("Delete this presbytery? This will NOT delete congregations automatically.")) return;
  const numericId = Number(id);
  const db = getDatabase();
  const oldRecord = db.Presbytery.find(p => Number(p.presbyteryID) === numericId);
  db.Presbytery = db.Presbytery.filter(p => Number(p.presbyteryID) !== numericId);
  saveDatabase(db);
  trackChange("deletePresbytery", null, oldRecord || { presbyteryID: numericId });
  renderPresbyterySelect();
  if (typeof renderPresbyteryTable === "function") renderPresbyteryTable();
  loadPresbyteryCards();
}

function loadPresbyteryCards() {
  const container = document.getElementById("presbyteryList");
  if (!container) return;

  const db = getDatabase();
  const presbyteries = db.Presbytery || [];
  const congregations = db.Congregation || [];
  const members = db.Member || [];
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const activePresbyteryID = currentUser?.activePresbytery?.presbyteryID
    ? Number(currentUser.activePresbytery.presbyteryID)
    : null;

  const scope = getUserScope();
  let visiblePresbyteries = scope.presbytery === "ALL"
    ? presbyteries
    : presbyteries.filter(p => p.name === scope.presbytery);

  // Search filter
  const searchEl = document.getElementById("presbyterySearch");
  const searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";
  if (searchTerm) {
    visiblePresbyteries = visiblePresbyteries.filter(p =>
      p.name.toLowerCase().includes(searchTerm) ||
      (p.synod || "").toLowerCase().includes(searchTerm)
    );
  }

  // Sort
  const sortEl = document.getElementById("presbyterySort");
  const sortVal = sortEl ? sortEl.value : "name";
  if (sortVal === "congregations") {
    visiblePresbyteries = [...visiblePresbyteries].sort((a, b) => {
      const ca = congregations.filter(c => Number(c.presbyteryID) === Number(a.presbyteryID)).length;
      const cb = congregations.filter(c => Number(c.presbyteryID) === Number(b.presbyteryID)).length;
      return cb - ca;
    });
  } else {
    visiblePresbyteries = [...visiblePresbyteries].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Update stats count
  const statsEl = document.getElementById("presbyteryStats");
  if (statsEl) {
    const total = presbyteries.length;
    const showing = visiblePresbyteries.length;
    statsEl.textContent = searchTerm
      ? `${showing} of ${total} presbyter${total === 1 ? 'y' : 'ies'} match`
      : `${total} presbyter${total === 1 ? 'y' : 'ies'}`;
  }

  // Empty state
  const emptyEl = document.getElementById("presbyteryEmpty");
  container.innerHTML = "";

  if (visiblePresbyteries.length === 0) {
    if (emptyEl) emptyEl.classList.remove("d-none");
    return;
  }
  if (emptyEl) emptyEl.classList.add("d-none");

  visiblePresbyteries.forEach(p => {
    const synodName = p.synod || "";
    const presName = p.name || "Unnamed Presbytery";
    const presCongregs = congregations.filter(c => Number(c.presbyteryID) === Number(p.presbyteryID));
    const congCount = presCongregs.length;
    const congIDs = new Set(presCongregs.map(c => c.congregationID || c.CongregationID));
    const memberCount = members.filter(m => congIDs.has(m.congregationID || m.CongregationID)).length;
    const color = getCardColor(p.presbyteryID);
    const isActive = Number(p.presbyteryID) === activePresbyteryID;

    const card = document.createElement("div");
    card.className = "col-6 col-md-4 col-lg-3 mb-3 presbytery-col";
    card.innerHTML = `
      <div class="card shadow-sm p-0 presby-card h-100${isActive ? ' active' : ''}" style="cursor:pointer;" title="Click to view congregations">
        <div class="d-flex h-100">
          <div class="color-block" style="background:${color}; flex-shrink:0;"></div>
          <div class="p-3 flex-grow-1 d-flex flex-column">
            ${synodName ? `<p class="text-muted small mb-0">${synodName}</p>` : ''}
            <h5 class="mb-1 mt-1">${presName}</h5>
            <div class="d-flex gap-2 flex-wrap mt-auto pt-2">
              <span class="badge bg-primary-subtle text-primary-emphasis" title="${congCount} congregation${congCount !== 1 ? 's' : ''}"><i class="bi bi-building me-1"></i>${congCount}</span>
              <span class="badge bg-success-subtle text-success-emphasis" title="${memberCount} member${memberCount !== 1 ? 's' : ''}"><i class="bi bi-people me-1"></i>${memberCount}</span>
            </div>
            <div class="d-flex gap-1 mt-2">
              <button class="btn btn-outline-secondary btn-edit presby-btn" title="Edit presbytery"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-danger btn-delete presby-btn" title="Delete presbytery"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
        </div>
      </div>
    `;

    const cardElement = card.querySelector(".presby-card");

    cardElement.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete") || e.target.closest(".btn-edit")) return;

      container.querySelectorAll(".presby-card.active").forEach(el => el.classList.remove("active"));
      cardElement.classList.add("active");

      const cu = JSON.parse(localStorage.getItem("currentUser")) || {};
      cu.activePresbytery = { presbyteryID: Number(p.presbyteryID), name: presName, synod: synodName };
      localStorage.setItem("currentUser", JSON.stringify(cu));
      window.location.href = "congregations.html";
    });

    card.querySelector(".btn-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditPresbytery(p.presbyteryID);
    });

    card.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      openDeleteConfirmation(p.presbyteryID, presName);
    });

    container.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", () => { initDatabase().then(() => {
  renderPresbyterySelect();
  loadPresbyteryCards();

  if (document.querySelector("#presbytery-table")) {
    renderPresbyteryTable();
  }

  const registerBtn = document.getElementById("btn-register-presbytery");
  if (registerBtn) registerBtn.addEventListener("click", (e) => { e.preventDefault(); registerPresbytery(); });

  const searchEl = document.getElementById("presbyterySearch");
  if (searchEl) searchEl.addEventListener("input", loadPresbyteryCards);

  const sortEl = document.getElementById("presbyterySort");
  if (sortEl) sortEl.addEventListener("change", loadPresbyteryCards);

  const confirmDeleteBtn = document.getElementById("confirmDeletePresbyteryBtn");
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDeletePresbytery);
}); });

// Public API
window.registerPresbytery = registerPresbytery;
window.loadPresbyteries = loadPresbyteries;
window.updatePresbyteryDropdown = renderPresbyterySelect;
window.loadPresbyteryCards = loadPresbyteryCards;
window.openEditPresbytery = openEditPresbytery;
window.saveEditPresbytery = saveEditPresbytery;
