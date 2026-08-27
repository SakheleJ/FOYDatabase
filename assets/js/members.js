// SCRIPT: members.js

const MEMBER_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#14b8a6','#6366f1','#ec4899'];

function getMemberColor(id) {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length];
}

// Define showToast locally if not already provided by presbytery.js
if (typeof showToast !== 'function') {
  window.showToast = function(message, type) {
    const toast = document.getElementById('appToast');
    const body = document.getElementById('appToastBody');
    if (!toast || !body) { alert(message); return; }
    const bgClass = type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning' : 'bg-success';
    toast.className = `toast align-items-center text-white border-0 ${bgClass}`;
    body.textContent = message;
    bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
  };
}

// Normalise any date value to YYYY-MM-DD string for display/storage
function formatDate(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return String(dob).substring(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function updateCongregationDropdown(congSelect, allCong, presID, selectedCongID) {
  if (!congSelect) return;
  const filtered = presID ? allCong.filter(c => String(c.presbyteryID) === String(presID)) : allCong;
  congSelect.innerHTML = '';
  const def = document.createElement('option');
  def.value = '';
  def.textContent = '-- Select Congregation --';
  congSelect.appendChild(def);
  filtered.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.congregationID;
    opt.textContent = c.name;
    if (String(c.congregationID) === String(selectedCongID)) opt.selected = true;
    congSelect.appendChild(opt);
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function populateAddFormCongregations(db, selectedCongID) {
  const presbyteries  = db.Presbytery   || [];
  const congregations = db.Congregation || [];

  function fillPres(selEl) {
    if (!selEl) return;
    const cur = selEl.value;
    selEl.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = '-- Select Presbytery --';
    selEl.appendChild(def);
    presbyteries.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.presbyteryID;
      opt.textContent = p.name;
      selEl.appendChild(opt);
    });
    if (cur) selEl.value = cur;
  }

  function fillCong(congEl, presID) {
    if (!congEl) return;
    const filtered = presID
      ? congregations.filter(c => String(c.presbyteryID) === String(presID))
      : congregations;
    congEl.innerHTML = '';
    const def = document.createElement('option');
    def.value = ''; def.textContent = '-- Select Congregation --';
    congEl.appendChild(def);
    filtered.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.congregationID;
      opt.textContent = c.name;
      if (String(c.congregationID) === String(selectedCongID)) opt.selected = true;
      congEl.appendChild(opt);
    });
  }

  const addPresEl  = document.getElementById('memberPresbytery');
  const addCongEl  = document.getElementById('memberCongregation');
  const bulkPresEl = document.getElementById('bulkPresbytery');
  const bulkCongEl = document.getElementById('bulkCongregation');

  fillPres(addPresEl);
  fillPres(bulkPresEl);

  if (selectedCongID) {
    const cong = congregations.find(c => String(c.congregationID) === String(selectedCongID));
    if (cong) {
      if (addPresEl)  addPresEl.value  = cong.presbyteryID;
      if (bulkPresEl) bulkPresEl.value = cong.presbyteryID;
      fillCong(addCongEl,  cong.presbyteryID);
      fillCong(bulkCongEl, cong.presbyteryID);
    } else {
      fillCong(addCongEl,  null);
      fillCong(bulkCongEl, null);
    }
  } else {
    fillCong(addCongEl,  null);
    fillCong(bulkCongEl, null);
  }
}

// -------------------- FILTERS --------------------
function populateFilters(db, selectedCongID) {
  const congregations = db.Congregation || [];
  const affiliations = db.Affiliation || [];

  const congSel = document.getElementById('filterCongregation');
  if (congSel) {
    const current = congSel.value;
    congSel.innerHTML = '<option value="">All Congregations</option>';
    congregations.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.congregationID;
      opt.textContent = c.name;
      congSel.appendChild(opt);
    });
    if (selectedCongID) congSel.value = selectedCongID;
    else if (current) congSel.value = current;
  }

  updatePeriodFilter(affiliations, congSel ? congSel.value : '');
}

function updatePeriodFilter(affiliations, selectedCongID) {
  const periodSel = document.getElementById('filterPeriod');
  if (!periodSel) return;
  const current = periodSel.value;
  const relevantAffs = selectedCongID
    ? affiliations.filter(a => String(a.congregationID) === String(selectedCongID))
    : affiliations;
  const uniqueYears = [...new Set(relevantAffs.map(a => String(a.yearRegistered)).filter(Boolean))].sort((a, b) => b - a);
  periodSel.innerHTML = '<option value="">All Periods</option>';
  uniqueYears.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    periodSel.appendChild(opt);
  });
  if (current && uniqueYears.includes(current)) periodSel.value = current;
}

// -------------------- LOAD --------------------
function loadMembers() {
  const db = getDatabase();
  const selectedCong = localStorage.getItem("selectedCongregation");

  if (selectedCong) {
    const cong = (db.Congregation || []).find(c => String(c.congregationID) === String(selectedCong));
    if (cong) {
      const badge = document.getElementById("memberContextBadge");
      if (badge) { badge.textContent = cong.name; badge.dataset.congName = cong.name; }

      const backEl = document.getElementById("congBack");
      if (backEl) backEl.innerHTML = `<a href="congregations.html" class="text-decoration-none small"><i class="bi bi-arrow-left me-1"></i>Back to Congregations</a>`;

      const formContext = document.getElementById("addFormContext");
      if (formContext) formContext.textContent = `— ${cong.name}`;
    }
  }

  populateFilters(db, selectedCong);
  populateAddFormCongregations(db, selectedCong);
  renderAffiliations();
}

// -------------------- RENDER CARDS --------------------
function renderAffiliations(skipAutoSelect) {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];
  const members = db.Member || [];
  const congregations = db.Congregation || [];
  const presbyteries = db.Presbytery || [];

  const cardsContainer = document.getElementById("affiliationCards");
  const detailsPanel = document.getElementById("memberDetailPanel");
  if (!cardsContainer) return;

  const selectedCong = document.getElementById('filterCongregation')?.value || '';
  const filterPeriod = document.getElementById('filterPeriod')?.value || '';
  const filterSearch = (document.getElementById('filterSearch')?.value || '').toLowerCase().trim();

  // Determine congregation scope
  const activeCong = localStorage.getItem("selectedCongregation") || '';
  const explicitCong = selectedCong || activeCong; // set when navigating from a specific congregation
  let congsToFilter = explicitCong
    ? [explicitCong]
    : congregations.map(c => String(c.congregationID));

  // When scoped to a specific congregation, only include members affiliated with it.
  // When "All Congregations" with no context, show every member including unregistered ones.
  const isCongScoped = !!explicitCong;

  // All affiliations within the scoped congregations
  const scopedAffs = affiliations.filter(a => congsToFilter.includes(String(a.congregationID)));

  // Determine the "current period" = highest yearRegistered in scope (used to classify active vs lapsed)
  const allPeriods = [...new Set(scopedAffs.map(a => Number(a.yearRegistered)))].sort((a, b) => b - a);
  const currentPeriod = filterPeriod ? Number(filterPeriod) : (allPeriods[0] || new Date().getFullYear());

  // Index affiliations by memberID for fast lookup
  const affsByMember = {};
  scopedAffs.forEach(a => {
    if (!affsByMember[a.memberID]) affsByMember[a.memberID] = [];
    affsByMember[a.memberID].push(a);
  });

  // Build entries from the Member table.
  // When congregation-scoped: only include members who have at least one affiliation in scope.
  // When showing all: include every member, even those with no affiliations.
  let entries = members.reduce((acc, m) => {
    const memberAffs = (affsByMember[m.memberID] || []).sort((a, b) => Number(b.yearRegistered) - Number(a.yearRegistered));
    if (isCongScoped && memberAffs.length === 0) return acc; // not in this congregation
    const latestAff  = memberAffs[0] || null;
    const isActive   = latestAff && Number(latestAff.yearRegistered) === currentPeriod;
    const isLapsed   = !isActive && memberAffs.length > 0;
    acc.push({ member: m, latestAff, isActive, isLapsed });
    return acc;
  }, []);

  // Apply search (against Member table fields + latest affiliation fields)
  if (filterSearch) {
    entries = entries.filter(({ member: m, latestAff: a }) => {
      const hay = `${m.title||''} ${m.surname||''} ${m.name||''} ${a?.title||''} ${a?.surname||''} ${a?.name||''}`.toLowerCase();
      return hay.includes(filterSearch);
    });
  }

  // Sort: active → lapsed → unregistered, then surname alphabetically within each group
  entries.sort((a, b) => {
    const rank = e => e.isActive ? 0 : e.isLapsed ? 1 : 2;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.member.surname||'').toLowerCase().localeCompare((b.member.surname||'').toLowerCase()) ||
           (a.member.name||'').localeCompare(b.member.name||'');
  });

  // Stats
  const statsEl = document.getElementById("memberStats");
  if (statsEl) {
    const nActive  = entries.filter(e => e.isActive).length;
    const nLapsed  = entries.filter(e => e.isLapsed).length;
    const nNone    = entries.filter(e => !e.isActive && !e.isLapsed).length;
    const parts    = [`${entries.length} member${entries.length !== 1 ? 's' : ''}`];
    if (nActive)  parts.push(`${nActive} active`);
    if (nLapsed)  parts.push(`${nLapsed} lapsed`);
    if (nNone)    parts.push(`${nNone} unregistered`);
    statsEl.textContent = parts.join(' · ');
  }

  const ctxBadge = document.getElementById("memberContextBadge");
  if (ctxBadge && isCongScoped && ctxBadge.dataset.congName) {
    ctxBadge.textContent = `${ctxBadge.dataset.congName} (${entries.length})`;
  }

  cardsContainer.innerHTML = "";
  if (detailsPanel && !detailsPanel.querySelector('#memberDetailForm')) {
    detailsPanel.innerHTML = `<div class="p-3 border rounded text-muted small">Click a member to see details.</div>`;
  }

  if (entries.length === 0) {
    cardsContainer.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-people display-5 text-muted"></i>
        <p class="text-muted mt-2 mb-0">No members found.</p>
      </div>`;
    return;
  }

  entries.forEach(({ member: m, latestAff: a, isActive, isLapsed }, idx) => {
    const congID = a?.congregationID || m.CongregationID || '';
    const cong   = congID ? (congregations.find(c => String(c.congregationID) === String(congID)) || {}) : {};
    const presID = cong.presbyteryID || m.PresbyteryID || '';
    const pres   = presID ? (presbyteries.find(p => String(p.presbyteryID) === String(presID)) || {}) : {};
    const age   = computeAge(m.dob);
    const color = isActive ? getMemberColor(m.memberID) : (isLapsed ? '#f59e0b' : '#9ca3af');

    // Prefer affiliation snapshot name, fall back to Member record
    const dispTitle   = a?.title   || m.title   || '';
    const dispSurname = a?.surname || m.surname || '';
    const dispName    = a?.name    || m.name    || '';
    const fullName    = `${dispSurname}${dispName ? ', ' + dispName : ''}`;
    const titleStr    = dispTitle ? `<span class="text-muted me-1" style="font-size:0.75rem;">${dispTitle}</span>` : '';

    let statusBadge = '';
    let subLine     = '';
    if (isActive) {
      subLine = `${cong.name || 'Unknown'} · ${a.yearRegistered}${age !== '' ? ' · ' + age + ' yrs' : ''}`;
    } else if (isLapsed) {
      statusBadge = `<span class="badge bg-warning text-dark ms-1" style="font-size:0.62rem;">lapsed</span>`;
      subLine     = `Last: ${cong.name || 'Unknown'} · ${a.yearRegistered}${age !== '' ? ' · ' + age + ' yrs' : ''}`;
    } else {
      statusBadge = `<span class="badge bg-secondary ms-1" style="font-size:0.62rem;">no record</span>`;
      subLine     = age !== '' ? `${age} yrs · no affiliation on file` : 'No affiliation on file';
    }

    const showReregister = isActive || isLapsed;

    const card = document.createElement('div');
    card.className = `card affiliation-card shadow-sm p-0 mb-1${!isActive ? ' opacity-75' : ''}`;
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="d-flex align-items-stretch">
        <div style="background:${color}; width:5px; flex-shrink:0; border-radius:4px 0 0 4px;"></div>
        <div class="px-2 py-1 flex-grow-1">
          <div class="d-flex align-items-center justify-content-between gap-1">
            <span style="font-size:0.88rem;">${titleStr}<strong>${fullName}</strong>${statusBadge}</span>
            ${showReregister ? `<button class="btn btn-outline-secondary btn-reregister presby-btn flex-shrink-0" title="Re-register for next period" style="font-size:0.65rem;padding:1px 5px;"><i class="bi bi-calendar-plus"></i></button>` : ''}
          </div>
          <div class="text-muted" style="font-size:0.75rem;">${subLine}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-reregister')) return;
      cardsContainer.querySelectorAll('.affiliation-card').forEach(el => el.classList.remove('border-primary', 'border'));
      card.classList.add('border', 'border-primary');
      selectMember(m, a || null, cong, pres);
    });

    if (showReregister) {
      card.querySelector('.btn-reregister').addEventListener('click', (e) => {
        e.stopPropagation();
        cardsContainer.querySelectorAll('.affiliation-card').forEach(el => el.classList.remove('border-primary', 'border'));
        card.classList.add('border', 'border-primary');
        const nextPeriod = a ? Math.max(Number(a.yearRegistered) + 1, new Date().getFullYear()) : new Date().getFullYear();
        selectMember(m, a || null, cong, pres, { nextPeriod });
      });
    }

    cardsContainer.appendChild(card);

    if (!skipAutoSelect && idx === 0) {
      card.classList.add('border', 'border-primary');
      selectMember(m, a || null, cong, pres);
    }
  });
}

// -------------------- DETAIL PANEL --------------------
function selectMember(member, affiliation, congregation, presbytery, opts) {
  _selectedMember = member;
  const detailsPanel = document.getElementById('memberDetailPanel');
  if (!detailsPanel) return;

  const db = getDatabase();
  const allPresbyteries = db.Presbytery || [];
  const allCongregations = db.Congregation || [];
  const periodVal = opts?.nextPeriod ?? affiliation?.yearRegistered ?? new Date().getFullYear();

  detailsPanel.innerHTML = `
    <div class="card p-3 mb-2">
      <h6 class="mb-2">Edit Member</h6>
      <form id="memberDetailForm" class="row g-2" novalidate>
        <div class="col-6 col-md-3">
          <label class="form-label small">Presbytery</label>
          <select id="detailPresbytery" class="form-select form-select-sm" required></select>
          <div class="invalid-feedback">Please select a presbytery.</div>
        </div>
        <div class="col-6 col-md-4">
          <label class="form-label small">Congregation</label>
          <select id="detailCongregation" class="form-select form-select-sm" required></select>
          <div class="invalid-feedback">Please select a congregation.</div>
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Title</label>
          <input id="detailTitle" class="form-control form-control-sm" value="${member.title || ''}" />
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small">Surname</label>
          <input id="detailSurname" class="form-control form-control-sm" value="${member.surname || ''}" required />
          <div class="invalid-feedback">Surname is required.</div>
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small">Name</label>
          <input id="detailName" class="form-control form-control-sm" value="${member.name || ''}" required />
          <div class="invalid-feedback">Name is required.</div>
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Date of Birth</label>
          <input id="detailDOB" type="date" class="form-control form-control-sm" value="${formatDate(member.dob)}" required />
          <div class="invalid-feedback">Date of birth is required.</div>
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Gender</label>
          <select id="detailGender" class="form-select form-select-sm" required>
            <option value="">-- Select Gender --</option>
            <option value="Male" ${member.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${member.gender === 'Female' ? 'selected' : ''}>Female</option>
            <option value="Other" ${member.gender === 'Other' ? 'selected' : ''}>Other</option>
          </select>
          <div class="invalid-feedback">Please select a gender.</div>
        </div>
        <div class="col-6 col-md-2">
          <label class="form-label small">Period</label>
          <input id="detailPeriod" type="number" class="form-control form-control-sm" value="${periodVal}" min="2000" required />
          <div class="invalid-feedback">Please enter a valid period year.</div>
        </div>
        <div class="col-12 d-flex gap-2 flex-wrap align-items-center">
          <button type="submit" id="saveMemberDetail" class="btn btn-primary btn-sm">Save Changes</button>
          <button type="button" id="addAffiliationBtn" class="btn btn-success btn-sm">
            <i class="bi bi-plus-circle me-1"></i>Add Period
          </button>
          <button type="button" id="deleteMemberBtn" class="btn btn-outline-danger btn-sm ms-auto">
            <i class="bi bi-person-x me-1"></i>Delete Member
          </button>
        </div>
      </form>
    </div>
    <div id="memberAffiliationInstances"></div>
  `;

  const presSelect = document.getElementById('detailPresbytery');
  const congSelect = document.getElementById('detailCongregation');

  if (presSelect) {
    presSelect.innerHTML = '<option value="">-- Select Presbytery --</option>' +
      allPresbyteries.map(p => `<option value="${p.presbyteryID}" ${String(p.presbyteryID) === String(presbytery?.presbyteryID) ? 'selected' : ''}>${p.name}</option>`).join('');
  }
  updateCongregationDropdown(congSelect, allCongregations, presbytery?.presbyteryID, congregation?.congregationID);

  presSelect?.addEventListener('change', () => {
    updateCongregationDropdown(congSelect, allCongregations, presSelect.value, null);
  });

  const detailForm = document.getElementById('memberDetailForm');
  detailForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!detailForm.checkValidity()) {
      detailForm.classList.add('was-validated');
      showToast('Please fill out all required fields.', 'warning');
      return;
    }

    const updTitle    = document.getElementById('detailTitle').value.trim();
    const updSurname  = document.getElementById('detailSurname').value.trim();
    const updName     = document.getElementById('detailName').value.trim();
    const updDob      = document.getElementById('detailDOB').value;
    const updGender   = document.getElementById('detailGender').value;
    const updPeriod   = parseInt(document.getElementById('detailPeriod').value, 10);
    const updCong     = document.getElementById('detailCongregation').value;

    const dbS = getDatabase();
    const mIdx = (dbS.Member || []).findIndex(x => x.memberID === member.memberID);
    const oldMember = mIdx > -1 ? { ...dbS.Member[mIdx] } : null;
    if (mIdx > -1) dbS.Member[mIdx] = { ...dbS.Member[mIdx], title: updTitle, surname: updSurname, name: updName, dob: updDob, gender: updGender };

    const aIdx = affiliation?.affiliationID
      ? (dbS.Affiliation || []).findIndex(x => x.affiliationID === affiliation.affiliationID)
      : -1;
    const oldAff = aIdx > -1 ? { ...dbS.Affiliation[aIdx] } : null;
    const updCongObj = allCongregations.find(c => String(c.congregationID) === String(updCong)) || {};
    const updPresObj = allPresbyteries.find(p => String(p.presbyteryID) === String(updCongObj.presbyteryID)) || {};

    if (aIdx > -1) {
      dbS.Affiliation[aIdx] = { ...dbS.Affiliation[aIdx], congregationID: updCong, yearRegistered: updPeriod,
        title: updTitle, surname: updSurname, name: updName, dob: updDob, gender: updGender,
        congregationName: updCongObj.name || '', presbyteryName: updPresObj.name || '' };
    }

    saveDatabase(dbS);
    if (mIdx > -1 && oldMember) trackChange("updateMember", dbS.Member[mIdx], oldMember);
    if (aIdx > -1 && oldAff)   trackChange("updateAffiliation", dbS.Affiliation[aIdx], oldAff);
    if (typeof updateFileStatus === "function") updateFileStatus();

    showToast('Member updated successfully!');
    populateFilters(getDatabase(), localStorage.getItem("selectedCongregation"));
    renderAffiliations(true);
    selectMember(dbS.Member[mIdx] || member, aIdx > -1 ? dbS.Affiliation[aIdx] : null, updCongObj, updPresObj);
  });

  document.getElementById('addAffiliationBtn')?.addEventListener('click', () => {
    const selCong    = document.getElementById('detailCongregation').value;
    const selPeriod  = parseInt(document.getElementById('detailPeriod').value, 10);
    const fTitle     = document.getElementById('detailTitle').value.trim();
    const fSurname   = document.getElementById('detailSurname').value.trim();
    const fName      = document.getElementById('detailName').value.trim();
    const fDob       = document.getElementById('detailDOB').value;
    const fGender    = document.getElementById('detailGender').value;

    if (!selCong || Number.isNaN(selPeriod) || !fSurname || !fName || !fDob || !fGender) {
      showToast('Please fill out all required fields.', 'warning'); return;
    }

    const dbS = getDatabase();
    if (!dbS.Affiliation) dbS.Affiliation = [];

    if (dbS.Affiliation.find(a => a.memberID === member.memberID && String(a.congregationID) === String(selCong) && Number(a.yearRegistered) === selPeriod)) {
      showToast(`Already registered for ${selPeriod} in this congregation.`, 'warning'); return;
    }

    const memberAffs = dbS.Affiliation.filter(a => a.memberID === member.memberID);
    const maxPeriod  = memberAffs.length ? Math.max(...memberAffs.map(a => Number(a.yearRegistered))) : 0;
    let updatedMember = null;

    if (selPeriod > maxPeriod) {
      const mIdx = (dbS.Member || []).findIndex(x => x.memberID === member.memberID);
      if (mIdx > -1) {
        const oldM = { ...dbS.Member[mIdx] };
        dbS.Member[mIdx] = { ...dbS.Member[mIdx], title: fTitle, surname: fSurname, name: fName, dob: fDob, gender: fGender };
        updatedMember = dbS.Member[mIdx];
        trackChange("updateMember", updatedMember, oldM);
      }
    }

    const updCongObj = allCongregations.find(c => String(c.congregationID) === String(selCong)) || {};
    const updPresObj = allPresbyteries.find(p => String(p.presbyteryID) === String(updCongObj.presbyteryID)) || {};
    const newAff = { affiliationID: generateGUID(), memberID: member.memberID, congregationID: selCong,
      yearRegistered: selPeriod, title: fTitle, surname: fSurname, name: fName, dob: fDob, gender: fGender,
      congregationName: updCongObj.name || '', presbyteryName: updPresObj.name || '' };
    dbS.Affiliation.push(newAff);
    saveDatabase(dbS);
    trackChange("addAffiliation", newAff, null);
    if (typeof updateFileStatus === "function") updateFileStatus();

    showToast(`Registered for period ${selPeriod}.`);
    populateFilters(getDatabase(), localStorage.getItem("selectedCongregation"));
    renderAffiliations(true);
    selectMember(updatedMember || member, newAff, updCongObj, updPresObj);
  });

  document.getElementById('deleteMemberBtn')?.addEventListener('click', () => {
    const db2 = getDatabase();
    const affCount = (db2.Affiliation || []).filter(a => a.memberID === member.memberID).length;
    const fullName  = `${member.title ? member.title + ' ' : ''}${member.surname || ''} ${member.name || ''}`.trim();
    openDeleteConfirmation(
      `Delete ${fullName}? This will remove all ${affCount} affiliation record${affCount !== 1 ? 's' : ''}.`,
      () => deleteMember(member.memberID)
    );
  });

  renderMemberAffiliations(member, affiliation?.affiliationID);
}

// -------------------- AFFILIATION HISTORY --------------------
function renderMemberAffiliations(member, activeAffiliationID) {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];
  const congregations = db.Congregation || [];

  const listContainer = document.getElementById('memberAffiliationInstances');
  if (!listContainer) return;

  const memberAffs = affiliations
    .filter(a => a.memberID === member.memberID)
    .sort((a, b) => Number(b.yearRegistered) - Number(a.yearRegistered));

  if (!memberAffs.length) {
    listContainer.innerHTML = '<div class="small text-muted p-2">No affiliation history.</div>';
    return;
  }

  listContainer.innerHTML = '<p class="small fw-semibold text-muted mb-1 mt-1">Affiliation History <span class="fw-normal text-warning" style="font-size:0.7rem;" title="Fields shown in orange were different at the time of this registration"><i class="bi bi-info-circle"></i> orange = snapshot differs from current record</span></p>';

  memberAffs.forEach(a => {
    const cong = congregations.find(c => String(c.congregationID) === String(a.congregationID)) || {};
    const color = getMemberColor(member.memberID + a.congregationID + a.yearRegistered);
    const isActive = a.affiliationID === activeAffiliationID;

    // Detect fields that differ from the current member record
    const titleDiff   = a.title             !== member.title;
    const surnameDiff = a.surname           !== member.surname;
    const nameDiff    = a.name              !== member.name;
    const dobDiff     = formatDate(a.dob)   !== formatDate(member.dob);
    const genderDiff  = a.gender            !== member.gender;
    const hasDiff     = titleDiff || surnameDiff || nameDiff || dobDiff || genderDiff;

    const row = document.createElement('div');
    row.className = `card affiliation-card shadow-sm p-0 mb-1${isActive ? ' border border-primary' : ''}`;
    row.dataset.affiliationId = a.affiliationID;
    row.innerHTML = `
      <div class="d-flex align-items-stretch">
        <div style="background:${color}; width:5px; flex-shrink:0; border-radius:4px 0 0 4px;"></div>
        <div class="px-2 py-2 flex-grow-1">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <span class="badge bg-secondary me-1" style="font-size:0.7rem;">${a.yearRegistered}</span>
              <span class="fw-semibold" style="font-size:0.82rem;">${cong.name || 'Unknown Congregation'}</span>
              ${hasDiff ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem;" title="Data differs from current member record">edited</span>' : ''}
            </div>
            <button class="btn btn-outline-danger btn-delete-aff presby-btn flex-shrink-0" title="Remove this affiliation record (member is not deleted)" style="font-size:0.65rem;padding:1px 5px;">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
          <div class="mt-1 text-muted" style="font-size:0.75rem;">
            <span class="${titleDiff ? 'text-warning fw-semibold' : ''}">${a.title || '—'}</span>
            <span class="${surnameDiff ? 'text-warning fw-semibold' : ''} ms-1">${a.surname || '—'}</span>,
            <span class="${nameDiff ? 'text-warning fw-semibold' : ''} ms-1">${a.name || '—'}</span>
          </div>
          <div class="text-muted" style="font-size:0.75rem;">
            <span class="${dobDiff ? 'text-warning fw-semibold' : ''}">DOB: ${formatDate(a.dob) || '—'}</span>
            <span class="ms-2 ${genderDiff ? 'text-warning fw-semibold' : ''}">${a.gender || '—'}</span>
          </div>
        </div>
      </div>
    `;

    row.querySelector('.btn-delete-aff').addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteConfirmation(
        `Remove the ${a.yearRegistered} affiliation record with ${cong.name || 'this congregation'}? The member record will not be deleted.`,
        () => deleteAffiliation(a.affiliationID, member)
      );
    });

    listContainer.appendChild(row);
  });
}

// Tracks the currently open member so deleteAffiliation can refresh in place
let _selectedMember = null;

// -------------------- DELETE --------------------
let _pendingDeleteFn = null;

function openDeleteConfirmation(message, onConfirm) {
  _pendingDeleteFn = onConfirm;
  const msgEl = document.getElementById('deleteMemberMessage');
  if (msgEl) msgEl.textContent = message;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteMemberModal')).show();
}

function deleteAffiliation(affiliationID, member) {
  const db = getDatabase();
  const old = (db.Affiliation || []).find(a => a.affiliationID === affiliationID);
  db.Affiliation = (db.Affiliation || []).filter(a => a.affiliationID !== affiliationID);
  saveDatabase(db);
  if (old) trackChange("deleteAffiliation", null, old);
  if (typeof updateFileStatus === "function") updateFileStatus();
  showToast("Affiliation record removed. Member is still in the database.");

  // Refresh the left cards panel without auto-selecting (keeps detail panel open)
  renderAffiliations(true);

  // Refresh the affiliation history in the detail panel for the same member
  const memberToRefresh = member || _selectedMember;
  if (memberToRefresh) {
    const db2 = getDatabase();
    const remaining = (db2.Affiliation || []).filter(a => a.memberID === memberToRefresh.memberID);
    if (remaining.length > 0) {
      renderMemberAffiliations(memberToRefresh, remaining[0].affiliationID);
    } else {
      const histContainer = document.getElementById('memberAffiliationInstances');
      if (histContainer) {
        histContainer.innerHTML = `
          <div class="alert alert-info small mt-2 py-2">
            <i class="bi bi-info-circle me-1"></i>
            All affiliation records removed. The member is still in the database and can be re-registered for a new period.
          </div>`;
      }
    }
  }
}

function deleteMember(memberID) {
  const db = getDatabase();
  const oldMember   = (db.Member || []).find(m => m.memberID === memberID);
  const removedAffs = (db.Affiliation || []).filter(a => a.memberID === memberID);
  db.Member      = (db.Member || []).filter(m => m.memberID !== memberID);
  db.Affiliation = (db.Affiliation || []).filter(a => a.memberID !== memberID);
  saveDatabase(db);
  if (oldMember) trackChange("deleteMember", null, oldMember);
  removedAffs.forEach(a => trackChange("deleteAffiliation", null, a));
  if (typeof updateFileStatus === "function") updateFileStatus();
  showToast("Member deleted.", "error");
  const detailsPanel = document.getElementById('memberDetailPanel');
  if (detailsPanel) detailsPanel.innerHTML = `<div class="p-3 border rounded text-muted small">Click a member to see details.</div>`;
  loadMembers();
}

// -------------------- REGISTER --------------------

// Finds an existing Member that is an exact match on identity fields (case-insensitive name/surname).
function findExactMemberMatch(members, fields) {
  return (members || []).find(m =>
    m.surname.toLowerCase() === fields.surname.toLowerCase() &&
    m.name.toLowerCase() === fields.name.toLowerCase() &&
    m.dob === fields.dob && m.gender === fields.gender
  );
}

// Resolves the Member to attach an Affiliation to: reuses `existingMember` if given (an exact
// match, or a fuzzy match the user explicitly confirmed), otherwise creates + pushes a new one
// into `membersArray`. Does not save the database — caller is responsible for calling
// saveDatabase() once all member/affiliation records for the current operation are in place.
function resolveMember(membersArray, fields, existingMember) {
  if (existingMember) return { member: existingMember, isNew: false };
  const member = { memberID: generateGUID(), title: fields.title || '', surname: fields.surname, name: fields.name, dob: fields.dob, gender: fields.gender };
  membersArray.push(member);
  return { member, isNew: true };
}

let _pendingMatchChoiceFn = null;
let _pendingResolveConfirmFn = null;
const MAX_MATCH_CARDS = 6; // sane display cap if an unusual number of candidates score above threshold

const MEMBER_DIFF_FIELDS = [
  { key: 'title',   label: 'Title' },
  { key: 'surname', label: 'Surname' },
  { key: 'name',    label: 'Name' },
  { key: 'dob',     label: 'Date of Birth' },
  { key: 'gender',  label: 'Gender' },
];

function normalizeForCompare(v) { return (v || '').toString().trim().toLowerCase(); }

// Fields where the just-typed input differs from an existing member's stored value.
function diffFields(fields, member) {
  return MEMBER_DIFF_FIELDS.filter(f => normalizeForCompare(fields[f.key]) !== normalizeForCompare(member[f.key]));
}

function matchBadgeClass(pct) {
  return pct >= 90 ? 'bg-success' : pct >= 75 ? 'bg-warning text-dark' : 'bg-secondary';
}

function setPossibleMatchView(view) {
  const cardsView   = document.getElementById('possibleMatchCardsView');
  const resolveView = document.getElementById('possibleMatchResolveView');
  const backBtn      = document.getElementById('possibleMatchBackBtn');
  const confirmBtn   = document.getElementById('possibleMatchConfirmLinkBtn');
  const createNewBtn = document.getElementById('createNewMemberBtn');
  const inResolve = view === 'resolve';
  cardsView?.classList.toggle('d-none', inResolve);
  resolveView?.classList.toggle('d-none', !inResolve);
  backBtn?.classList.toggle('d-none', !inResolve);
  confirmBtn?.classList.toggle('d-none', !inResolve);
  createNewBtn?.classList.toggle('d-none', inResolve);
}

// Shows the "possible existing member" confirmation modal as one card per candidate (each with
// its own Link button), a persistent summary of what was just typed for direct comparison, and —
// if the chosen candidate's stored details differ from the input — a per-field "which value do I
// keep" step before finalizing, instead of silently keeping (or silently overwriting) the record.
// onResolve(resolution) fires with either null (create new) or { member, updates }, where
// `updates` is a plain object of field:newValue overrides to apply, or null if nothing changed.
function openPossibleMatchModal(fields, candidates, onResolve) {
  const shown = candidates.slice(0, MAX_MATCH_CARDS);

  function finalize(resolution) {
    _pendingMatchChoiceFn = null;
    _pendingResolveConfirmFn = null;
    try { bootstrap.Modal.getInstance(document.getElementById('possibleMatchModal'))?.hide(); } catch (e) {}
    onResolve(resolution);
  }

  const yourInputEl = document.getElementById('possibleMatchYourInput');
  if (yourInputEl) {
    const dobDisplay = fields.dob ? formatDate(fields.dob) : '—';
    yourInputEl.innerHTML = `<span class="text-muted small text-uppercase fw-semibold">You entered</span><br><strong>${fields.title ? fields.title + ' ' : ''}${fields.surname}, ${fields.name}</strong> — DOB ${dobDisplay}, ${fields.gender || '—'}`;
  }

  const intro = document.getElementById('possibleMatchIntro');
  if (intro) intro.textContent = `Found ${shown.length} possible existing match${shown.length > 1 ? 'es' : ''}. Choose one to link this registration to, or create a new member.`;

  const cardsEl = document.getElementById('possibleMatchCards');
  if (cardsEl) {
    cardsEl.innerHTML = shown.map((c, i) => {
      const m = c.member;
      const pct = Math.round(c.overall * 100);
      const dobDisplay = m.dob ? formatDate(m.dob) : '—';
      const diffs = new Set(diffFields(fields, m).map(f => f.key));
      const mark = (key, text) => diffs.has(key) ? `<span class="text-danger" title="Differs from what you entered">${text} ⚠</span>` : text;
      return `
        <div class="col-12 col-md-6">
          <div class="card h-100 shadow-sm">
            <div class="card-body py-2 px-3">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${mark('title', m.title ? m.title + ' ' : '')}${mark('surname', m.surname)}, ${mark('name', m.name)}</div>
                  <div class="text-muted small">DOB ${mark('dob', dobDisplay)} &middot; ${mark('gender', m.gender || '—')}</div>
                </div>
                <span class="badge ${matchBadgeClass(pct)}">${pct}%</span>
              </div>
              ${diffs.size > 0 ? `<div class="text-danger small mt-1"><i class="bi bi-exclamation-triangle me-1"></i>${diffs.size} field${diffs.size > 1 ? 's' : ''} differ from what you entered</div>` : ''}
              <button type="button" class="btn btn-sm btn-primary w-100 mt-2 link-candidate-btn" data-idx="${i}">Link to this person</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  _pendingMatchChoiceFn = (idx) => {
    if (idx === null) { finalize(null); return; } // Create New Member
    const candidate = shown[idx].member;
    const diffs = diffFields(fields, candidate);

    if (diffs.length === 0) { finalize({ member: candidate, updates: null }); return; }

    const resolveFieldsEl = document.getElementById('possibleMatchResolveFields');
    if (resolveFieldsEl) {
      resolveFieldsEl.innerHTML = diffs.map(f => `
        <div class="mb-2 p-2 border rounded">
          <div class="fw-semibold small mb-1">${f.label}</div>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="resolve_${f.key}" id="resolve_${f.key}_existing" value="existing" checked>
            <label class="form-check-label small" for="resolve_${f.key}_existing">Keep existing: <strong>${candidate[f.key] || '—'}</strong></label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="resolve_${f.key}" id="resolve_${f.key}_new" value="new">
            <label class="form-check-label small" for="resolve_${f.key}_new">Use what you entered: <strong>${fields[f.key] || '—'}</strong></label>
          </div>
        </div>`).join('');
    }

    _pendingResolveConfirmFn = () => {
      const updates = {};
      diffs.forEach(f => {
        const chosen = document.querySelector(`input[name="resolve_${f.key}"]:checked`);
        if (chosen && chosen.value === 'new') updates[f.key] = fields[f.key];
      });
      finalize({ member: candidate, updates: Object.keys(updates).length ? updates : null });
    };

    setPossibleMatchView('resolve');
  };

  const backBtn = document.getElementById('possibleMatchBackBtn');
  if (backBtn) backBtn.onclick = () => setPossibleMatchView('cards');

  setPossibleMatchView('cards');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('possibleMatchModal')).show();
}

function readMemberFormFields() {
  const title   = document.getElementById("memberTitle").value.trim();
  const surname = document.getElementById("memberSurname").value.trim();
  const name    = document.getElementById("memberName").value.trim();
  const dob     = document.getElementById("memberDOB").value;
  const gender  = document.getElementById("memberGender").value;
  const year    = parseInt(document.getElementById("memberYear").value, 10);
  const presID  = document.getElementById("memberPresbytery")?.value || '';
  const cong    = document.getElementById("memberCongregation")?.value || '';

  // Presbytery/Congregation must be explicitly chosen on the visible form — no falling back to a
  // stale localStorage value the dropdown itself doesn't show as selected.
  if (!presID) { showToast("Please select a presbytery.", "warning"); return null; }
  if (!cong) { showToast("Please select a congregation.", "warning"); return null; }
  if (!surname || !name || !dob || !gender || !year) { showToast("Please complete all required fields.", "warning"); return null; }

  return { title, surname, name, dob, gender, year, cong };
}

function registerMemberFromForm(e) {
  e.preventDefault();
  const fields = readMemberFormFields();
  if (!fields) return; // validation failed — leave the modal open so the error is visible in context

  try { bootstrap.Modal.getInstance(document.getElementById('addMemberModal'))?.hide(); } catch (err) {}

  const db = getDatabase();
  if (!db.Member) db.Member = [];

  const exactMatch = findExactMemberMatch(db.Member, fields);
  if (exactMatch) { finishRegisterMember(fields, { member: exactMatch, updates: null }); return; }

  const candidates = findMemberMatches(fields, db.Member);
  if (candidates.length > 0) {
    openPossibleMatchModal(fields, candidates, (resolution) => {
      finishRegisterMember(fields, resolution);
    });
    return;
  }

  finishRegisterMember(fields, null);
}

// `resolution` is either null (create a new member) or { member, updates }, where `member` is the
// existing Member to link to and `updates` (if any) are field:newValue overrides the user chose to
// apply from the "which value do I keep" step — e.g. correcting a typo on file via this registration.
function finishRegisterMember(fields, resolution) {
  const db = getDatabase();
  if (!db.Member) db.Member = [];
  if (!db.Affiliation) db.Affiliation = [];

  const existingMember = resolution ? resolution.member : null;
  let { member, isNew } = resolveMember(db.Member, fields, existingMember);

  if (!isNew && resolution && resolution.updates) {
    const mIdx = db.Member.findIndex(m => m.memberID === member.memberID);
    if (mIdx > -1) {
      const oldMember = { ...db.Member[mIdx] };
      db.Member[mIdx] = { ...db.Member[mIdx], ...resolution.updates };
      member = db.Member[mIdx];
      trackChange("updateMember", member, oldMember);
    }
  }

  if (db.Affiliation.find(a => a.memberID === member.memberID && String(a.congregationID) === String(fields.cong) && Number(a.yearRegistered) === fields.year)) {
    showToast(`${fields.surname} ${fields.name} is already registered for ${fields.year}.`, "warning"); return;
  }

  const congObj  = (db.Congregation || []).find(c => String(c.congregationID) === String(fields.cong)) || {};
  const presObj  = (db.Presbytery   || []).find(p => String(p.presbyteryID)   === String(congObj.presbyteryID)) || {};
  const affiliation = {
    affiliationID: generateGUID(), memberID: member.memberID, congregationID: fields.cong, yearRegistered: fields.year,
    title: member.title || '', surname: member.surname || '', name: member.name || '', dob: member.dob || '', gender: member.gender || '',
    congregationName: congObj.name || '', presbyteryName: presObj.name || ''
  };
  db.Affiliation.push(affiliation);
  saveDatabase(db);
  if (isNew) trackChange("addMember", member, null);
  trackChange("addAffiliation", affiliation, null);
  if (typeof updateFileStatus === "function") updateFileStatus();

  document.getElementById("memberForm").reset();
  const yearInput = document.getElementById("memberYear");
  if (yearInput) yearInput.value = new Date().getFullYear();

  showToast(`${isNew ? 'Member registered' : 'Re-registered'} successfully!`);
  loadMembers();
}

// -------------------- BULK IMPORT --------------------
function parseBulkMembers(text) {
  return text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean).reduce((rows, line) => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 5) return rows;
    const [title, surname, name, dob, gender, periodStr] = parts;
    rows.push({ title: title || '', surname, name, dob, gender, year: parseInt(periodStr, 10) || new Date().getFullYear() });
    return rows;
  }, []);
}

let _pendingBulkReviewFn = null;

// Shows the review table for bulk-import rows that fuzzy-matched an existing member but weren't
// an exact match. onResolve(decisions) fires once the user hits Commit, where `decisions` is an
// array parallel to `ambiguous`: either the matched Member object (link) or null (create new).
function openBulkMatchReviewModal(ambiguous, onResolve) {
  _pendingBulkReviewFn = () => {
    const decisions = ambiguous.map((item, i) => {
      const sel = document.getElementById(`bulkMatchDecision_${i}`);
      return (sel && sel.value === 'link') ? item.best.member : null;
    });
    onResolve(decisions);
  };

  const tbody = document.getElementById('bulkMatchReviewBody');
  if (tbody) {
    tbody.innerHTML = ambiguous.map((item, i) => {
      const r = item.row, m = item.best.member, pct = Math.round(item.best.overall * 100);
      return `
        <tr>
          <td>${r.title ? r.title + ' ' : ''}${r.surname}, ${r.name}<br><span class="text-muted small">DOB ${r.dob || '—'}, ${r.gender || '—'}</span></td>
          <td>${m.title ? m.title + ' ' : ''}${m.surname}, ${m.name}<br><span class="text-muted small">DOB ${m.dob || '—'}, ${m.gender || '—'}</span></td>
          <td>${pct}%</td>
          <td>
            <select id="bulkMatchDecision_${i}" class="form-select form-select-sm">
              <option value="new" selected>Create new member</option>
              <option value="link">Link to existing</option>
            </select>
          </td>
        </tr>`;
    }).join('');
  }

  bootstrap.Modal.getOrCreateInstance(document.getElementById('bulkMatchReviewModal')).show();
}

function registerBulkMembersFromTextarea() {
  const text = document.getElementById('bulkMemberTextarea').value || '';
  const bulkPresID = document.getElementById('bulkPresbytery')?.value || '';
  const cong = document.getElementById('bulkCongregation')?.value || '';
  if (!bulkPresID) { showToast('Please select a presbytery.', 'warning'); return; }
  if (!cong) { showToast('Please select a congregation.', 'warning'); return; }

  const parsed = parseBulkMembers(text).filter(r => r.surname && r.name && r.dob && r.gender);
  if (!parsed.length) { showToast('No valid rows. Format: Title,Surname,Name,DOB,Gender,Period', 'warning'); return; }

  const db = getDatabase();
  if (!db.Member) db.Member = [];
  if (!db.Affiliation) db.Affiliation = [];

  // Scan against snapshots, not the live arrays. Nothing is written into the real (shared,
  // cached) db.Member/db.Affiliation until the whole batch — including any ambiguous-match
  // decisions — is finalized, so canceling the review modal leaves the database untouched
  // instead of leaving orphaned rows sitting in memory for some later unrelated save to persist.
  const scratchMembers = db.Member.slice();
  let added = 0;
  const newMembers = [], newAffs = [];
  const ambiguous = [];

  function buildAffiliation(member, r) {
    const bulkCongObj = (db.Congregation || []).find(c => String(c.congregationID) === String(cong)) || {};
    const bulkPresObj = (db.Presbytery   || []).find(p => String(p.presbyteryID)   === String(bulkCongObj.presbyteryID)) || {};
    return { affiliationID: generateGUID(), memberID: member.memberID, congregationID: cong, yearRegistered: r.year,
      title: member.title || '', surname: member.surname || '', name: member.name || '', dob: member.dob || '', gender: member.gender || '',
      congregationName: bulkCongObj.name || '', presbyteryName: bulkPresObj.name || '' };
  }

  function commitRow(r, existingMember) {
    const { member, isNew } = resolveMember(scratchMembers, r, existingMember);
    if (isNew) { newMembers.push(member); added++; }
    const alreadyRegistered =
      db.Affiliation.some(a => a.memberID === member.memberID && String(a.congregationID) === String(cong) && Number(a.yearRegistered) === r.year) ||
      newAffs.some(a => a.memberID === member.memberID && String(a.congregationID) === String(cong) && Number(a.yearRegistered) === r.year);
    if (!alreadyRegistered) newAffs.push(buildAffiliation(member, r));
  }

  function finishBulkImport() {
    db.Member.push(...newMembers);
    db.Affiliation.push(...newAffs);
    saveDatabase(db);
    newMembers.forEach(m => trackChange("addMember", m, null));
    newAffs.forEach(a => trackChange("addAffiliation", a, null));
    if (typeof updateFileStatus === "function") updateFileStatus();

    document.getElementById('bulkMemberTextarea').value = '';
    showToast(`Imported ${parsed.length} rows (${added} new members).`);
    loadMembers();
  }

  for (const r of parsed) {
    const exactMatch = findExactMemberMatch(scratchMembers, r);
    if (exactMatch) { commitRow(r, exactMatch); continue; }

    const candidates = findMemberMatches(r, scratchMembers);
    if (candidates.length > 0) { ambiguous.push({ row: r, best: candidates[0] }); continue; }

    commitRow(r, null);
  }

  if (ambiguous.length === 0) { finishBulkImport(); return; }

  openBulkMatchReviewModal(ambiguous, (decisions) => {
    ambiguous.forEach((item, i) => commitRow(item.row, decisions[i]));
    finishBulkImport();
  });
}

// -------------------- EVENT WIRING --------------------
document.addEventListener("DOMContentLoaded", () => { initDatabase().then(() => {
  if (!document.getElementById("affiliationSection")) return;

  loadMembers();

  const yearInput = document.getElementById("memberYear");
  if (yearInput) {
    if (!yearInput.value) yearInput.value = new Date().getFullYear();
    yearInput.max = new Date().getFullYear() + 1;
  }

  // Presbytery change → filter congregations in Add Member form
  document.getElementById('memberPresbytery')?.addEventListener('change', () => {
    const db = getDatabase();
    const presID  = document.getElementById('memberPresbytery').value;
    const congEl  = document.getElementById('memberCongregation');
    if (!congEl) return;
    const filtered = presID
      ? (db.Congregation || []).filter(c => String(c.presbyteryID) === String(presID))
      : (db.Congregation || []);
    congEl.innerHTML = '';
    const def = document.createElement('option'); def.value = ''; def.textContent = '-- Select Congregation --';
    congEl.appendChild(def);
    filtered.forEach(c => { const o = document.createElement('option'); o.value = c.congregationID; o.textContent = c.name; congEl.appendChild(o); });
  });

  // Presbytery change → filter congregations in Bulk Import form
  document.getElementById('bulkPresbytery')?.addEventListener('change', () => {
    const db = getDatabase();
    const presID  = document.getElementById('bulkPresbytery').value;
    const congEl  = document.getElementById('bulkCongregation');
    if (!congEl) return;
    const filtered = presID
      ? (db.Congregation || []).filter(c => String(c.presbyteryID) === String(presID))
      : (db.Congregation || []);
    congEl.innerHTML = '';
    const def = document.createElement('option'); def.value = ''; def.textContent = '-- Select Congregation --';
    congEl.appendChild(def);
    filtered.forEach(c => { const o = document.createElement('option'); o.value = c.congregationID; o.textContent = c.name; congEl.appendChild(o); });
  });

  const form = document.getElementById("memberForm");
  if (form) form.addEventListener("submit", registerMemberFromForm);

  // Add Member now opens as a modal via data-bs-toggle — no manual toggle JS needed.

  // Toggle bulk import
  const toggleBulkBtn = document.getElementById('toggleBulkImport');
  const bulkSection   = document.getElementById('bulkSection');
  if (toggleBulkBtn && bulkSection) {
    toggleBulkBtn.addEventListener('click', () => {
      bulkSection.classList.toggle('d-none');
      toggleBulkBtn.innerHTML = bulkSection.classList.contains('d-none')
        ? '<i class="bi bi-upload me-1"></i>Bulk Import'
        : '<i class="bi bi-x me-1"></i>Hide Import';
    });
  }

  document.getElementById('bulkAddBtn')?.addEventListener('click', (e) => { e.preventDefault(); registerBulkMembersFromTextarea(); });
  document.getElementById('bulkClearBtn')?.addEventListener('click', () => { document.getElementById('bulkMemberTextarea').value = ''; });

  // Filters
  document.getElementById('filterCongregation')?.addEventListener('change', () => {
    updatePeriodFilter(getDatabase().Affiliation || [], document.getElementById('filterCongregation').value);
    renderAffiliations();
  });
  document.getElementById('filterPeriod')?.addEventListener('change', renderAffiliations);
  document.getElementById('filterSearch')?.addEventListener('input', debounce(renderAffiliations, 200));

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    const activeCong = localStorage.getItem("selectedCongregation");
    const congSel  = document.getElementById('filterCongregation');
    const periodSel = document.getElementById('filterPeriod');
    const searchEl  = document.getElementById('filterSearch');
    if (congSel)   congSel.value   = activeCong || '';
    if (periodSel) periodSel.value = '';
    if (searchEl)  searchEl.value  = '';
    updatePeriodFilter(getDatabase().Affiliation || [], activeCong || '');
    renderAffiliations();
  });

  // Delete modal confirm
  document.getElementById('confirmDeleteMemberBtn')?.addEventListener('click', () => {
    try { bootstrap.Modal.getInstance(document.getElementById('deleteMemberModal')).hide(); } catch (e) {}
    if (_pendingDeleteFn) { _pendingDeleteFn(); _pendingDeleteFn = null; }
  });

  // Possible-match modal (single Add Member) — one "Link to this person" button per candidate
  // card, delegated since the cards are re-rendered fresh each time the modal opens. These just
  // forward to whatever openPossibleMatchModal() currently has pending; that handler decides
  // whether to resolve immediately, show the per-field diff-resolution step (staying open), or
  // (Create New) skip straight through — and owns hiding/clearing state once truly resolved.
  document.getElementById('possibleMatchCards')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.link-candidate-btn');
    if (!btn) return;
    _pendingMatchChoiceFn?.(parseInt(btn.dataset.idx, 10));
  });
  document.getElementById('createNewMemberBtn')?.addEventListener('click', () => {
    _pendingMatchChoiceFn?.(null);
  });
  document.getElementById('possibleMatchConfirmLinkBtn')?.addEventListener('click', () => {
    _pendingResolveConfirmFn?.();
  });
  document.getElementById('possibleMatchModal')?.addEventListener('hidden.bs.modal', () => {
    // Dismissed via X / backdrop / Escape without resolving — abandon silently, nothing was saved.
    _pendingMatchChoiceFn = null;
    _pendingResolveConfirmFn = null;
    setPossibleMatchView('cards'); // reset so a future open doesn't start on a stale resolve view
  });

  // Bulk match review modal
  document.getElementById('confirmBulkMatchReviewBtn')?.addEventListener('click', () => {
    try { bootstrap.Modal.getInstance(document.getElementById('bulkMatchReviewModal')).hide(); } catch (e) {}
    if (_pendingBulkReviewFn) { const fn = _pendingBulkReviewFn; _pendingBulkReviewFn = null; fn(); }
  });
  document.getElementById('bulkMatchReviewModal')?.addEventListener('hidden.bs.modal', () => {
    _pendingBulkReviewFn = null; // modal dismissed without committing (Cancel Import / backdrop is static, so this is X or Cancel Import) — abandon silently, nothing was saved
  });

  // Init keyboard-help popover
  const kbdBtn = document.getElementById('kbdHelpBtn');
  if (kbdBtn) new bootstrap.Popover(kbdBtn, { sanitize: false });

  // -------------------- KEYBOARD NAVIGATION --------------------
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const inInput = ['input', 'textarea', 'select'].includes(tag);
    const modKey  = e.ctrlKey || e.metaKey;

    // Ctrl+S — save detail form
    if (modKey && e.key === 's') {
      e.preventDefault();
      document.getElementById('saveMemberDetail')?.click();
      return;
    }

    // '/' — focus search
    if (e.key === '/' && !inInput) {
      e.preventDefault();
      const s = document.getElementById('filterSearch');
      if (s) { s.focus(); s.select(); }
      return;
    }

    // Escape — blur input or close open forms
    if (e.key === 'Escape') {
      if (inInput) { document.activeElement.blur(); return; }
      // Add Member is a Bootstrap modal now — it already closes on Escape natively.
      const bulkSection = document.getElementById('bulkSection');
      const toggleBulkBtn = document.getElementById('toggleBulkImport');
      if (bulkSection && !bulkSection.classList.contains('d-none')) {
        bulkSection.classList.add('d-none');
        if (toggleBulkBtn) toggleBulkBtn.innerHTML = '<i class="bi bi-upload me-1"></i>Bulk Import';
        return;
      }
      return;
    }

    // Arrow keys — move between member cards
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !inInput) {
      e.preventDefault();
      const cards = Array.from(document.querySelectorAll('#affiliationCards .affiliation-card'));
      if (!cards.length) return;
      const activeIdx = cards.findIndex(c => c.classList.contains('border-primary'));
      let next = e.key === 'ArrowDown' ? activeIdx + 1 : activeIdx - 1;
      next = Math.max(0, Math.min(next, cards.length - 1));
      cards[next].click();
      cards[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    // Letter shortcuts — only when not typing in an input
    if (inInput) return;

    switch (e.key) {
      case 'n': case 'N':
        // N — open Add Member modal
        document.getElementById('toggleAddForm')?.click();
        break;
      case 'r': case 'R':
        // R — re-register selected member for next period
        document.querySelector('#affiliationCards .affiliation-card.border-primary .btn-reregister')?.click();
        break;
      case '?':
        // ? — show keyboard shortcuts popover
        bootstrap.Popover.getOrCreateInstance(document.getElementById('kbdHelpBtn'))?.toggle();
        break;
    }
  });
}); });

// Public API
window.loadMembers = loadMembers;
window.addMember = function(memberObj) {
  const db = getDatabase();
  if (!db.Member) db.Member = [];
  db.Member.push(Object.assign({ memberID: generateGUID() }, memberObj));
  saveDatabase(db);
};
