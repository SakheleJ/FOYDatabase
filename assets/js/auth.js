// -------------------- REGISTER USER --------------------
async function registerUserENC() {
  await initDatabase();
  const name = document.getElementById("userName").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const password = document.getElementById("userPassword").value.trim();
  const role = document.getElementById("userRole").value;

  document.getElementById("register-error").textContent = "";

  if (!name || !email || !password || !role) {
    document.getElementById("register-error").textContent = "All fields are required.";
    return;
  }

  const structureBoxes = document.querySelectorAll('#userStructures input[type="checkbox"]:checked');
  const structures = Array.from(structureBoxes).map(cb => cb.value).join(",");
  const congregation = (document.getElementById("userCongregation") || {}).value || "ALL";

  if (!structures) {
    document.getElementById("register-error").textContent = "Select at least one structure.";
    return;
  }

  const hashedPassword = await hashPassword(password);
  const newUser = { name, email, password: hashedPassword, role, structures, congregation };

  try {
    await postToDirectory("addUser", newUser);
  } catch (err) {
    document.getElementById("register-error").textContent = "Could not register user: " + err.message;
    return;
  }

  alert("Registration successful!");

  const modal = bootstrap.Modal.getInstance(document.getElementById("registerUserModal"));
  modal.hide();
  document.getElementById("registerUserForm").reset();
}

// -------------------- LOGIN --------------------
// Two-step Directory login: authenticate against the Directory, which
// returns the data sheet(s) ("structures") this account may use, then
// connect to whichever one is chosen (auto-picked if there's only one).
async function attemptLogin() {
  await initDatabase();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const errorEl  = document.getElementById("register-error");
  const btnText  = document.getElementById("login-btn-text");
  const spinner  = document.getElementById("login-spinner");

  errorEl.textContent = "";
  if (btnText) btnText.textContent = "Checking account…";
  if (spinner) spinner.classList.remove("d-none");

  const hashedPassword = await hashPassword(password);
  let result;

  try {
    const resp = await fetch(DIRECTORY_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "login", email, password: hashedPassword })
    });
    result = await resp.json();

    if (result.success) {
      // Cache this device's own successful login for offline re-auth —
      // never the full user table, just this one account's own result.
      localStorage.setItem("foyDirectoryCache", JSON.stringify({
        email: email.toLowerCase(), password: hashedPassword,
        user: result.user, structures: result.structures
      }));
    }
  } catch (e) {
    // Directory unreachable — fall back to this device's own cached login
    const cached = JSON.parse(localStorage.getItem("foyDirectoryCache") || "null");
    if (cached && cached.email === email.toLowerCase() && cached.password === hashedPassword) {
      result = { success: true, user: cached.user, structures: cached.structures };
    } else {
      result = { success: false, error: "Could not reach the Directory, and no offline login is cached for this account." };
    }
  }

  if (btnText) btnText.textContent = "Login";
  if (spinner) spinner.classList.add("d-none");

  if (!result.success) {
    errorEl.textContent = result.error || "Invalid email or password.";
    return;
  }

  const structures = result.structures || [];
  if (structures.length === 0) {
    errorEl.textContent = "Your account has no structures assigned yet. Contact an admin.";
    return;
  }

  if (structures.length === 1) {
    completeLogin(result.user, structures[0]);
    return;
  }

  showStructurePicker(result.user, structures);
}

// Populates and shows the structure-picker modal — only reached when a
// user has more than one structure to choose from.
function showStructurePicker(user, structures) {
  const list = document.getElementById("structure-picker-list");
  list.innerHTML = "";
  structures.forEach(s => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-group-item list-group-item-action";
    btn.textContent = s.name;
    btn.onclick = () => completeLogin(user, s);
    list.appendChild(btn);
  });
  bootstrap.Modal.getOrCreateInstance(document.getElementById("structurePickerModal")).show();
}

// Finalizes login once the target structure is known: connects the app to
// that structure's data sheet exactly as if its URL had been pasted in.
async function completeLogin(user, structure) {
  const errorEl = document.getElementById("register-error");

  localStorage.setItem("currentUser", JSON.stringify(Object.assign({}, user, {
    structure: { name: structure.name, url: structure.url }
  })));
  saveSheetURL(structure.url);

  try {
    await syncFromSheet(structure.url, { presbytery: "ALL", congregation: user.congregation || "ALL" });
  } catch (err) {
    const proceed = confirm(
      "⚠️ Could not sync from Google Sheet:\n" + err.message +
      "\n\nContinue with locally cached data?"
    );
    if (!proceed) {
      localStorage.removeItem("currentUser");
      if (errorEl) errorEl.textContent = "";
      return;
    }
  }

  window.location.href = "dashboard.html";
}
// -------------------- SCOPE DROPDOWNS (Register User modal) --------------------
// Populates the Structures checkbox list (from the Directory) and the
// Congregation select (from the currently-connected data sheet).
// Called when the registerUserModal is shown.
async function populateUserScopeDropdowns() {
  const congSelect = document.getElementById("userCongregation");
  if (congSelect) {
    const congregations = (getDatabase().Congregation) || [];
    congSelect.innerHTML = '<option value="ALL">ALL</option>' +
      congregations.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  const structuresBox = document.getElementById("userStructures");
  if (!structuresBox) return;

  structuresBox.innerHTML = '<span class="text-muted small">Loading…</span>';
  try {
    const resp = await fetch(DIRECTORY_URL + "?action=structures");
    const json = await resp.json();
    const structures = (json.success && json.structures) ? json.structures : [];

    const allOption = `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" value="ALL" id="structure-ALL">
        <label class="form-check-label fw-semibold" for="structure-ALL">ALL (every structure, including future ones)</label>
      </div>`;

    structuresBox.innerHTML = allOption + (structures.length
      ? structures.map(s => `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${s.name}" id="structure-${s.name}">
            <label class="form-check-label" for="structure-${s.name}">${s.name}</label>
          </div>`).join('')
      : '<span class="text-muted small">No individual structures found yet — add one in the Directory sheet.</span>');

    // Picking ALL supersedes individual picks — disable them for clarity.
    const allBox = document.getElementById("structure-ALL");
    const otherBoxes = () => structuresBox.querySelectorAll('input[type="checkbox"]:not(#structure-ALL)');
    allBox.onchange = () => otherBoxes().forEach(cb => {
      cb.disabled = allBox.checked;
      if (allBox.checked) cb.checked = false;
    });
  } catch (e) {
    structuresBox.innerHTML = '<span class="text-danger small">Could not load structures from the Directory.</span>';
  }
}

// Wire up dropdown population whenever the modal opens
document.addEventListener("DOMContentLoaded", () => { initDatabase().then(() => {
  const modalEl = document.getElementById("registerUserModal");
  if (modalEl) {
    modalEl.addEventListener("show.bs.modal", populateUserScopeDropdowns);
  }
}); });

// -------------------- MANUAL SYNC (dashboard sync button) --------------------
async function manualSyncFromSheet() {
  const btn = document.getElementById("syncSheetBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⟳ Syncing…"; }

  try {
    await syncFromSheet();
    if (btn) { btn.disabled = false; btn.innerHTML = "&#x21BB; Sync"; }

    // Refresh whatever is currently on screen
    if (typeof loadMembers        === "function") loadMembers();
    if (typeof loadCongregations  === "function") loadCongregations();
    if (typeof loadPresbyteryCards === "function") loadPresbyteryCards();
    if (typeof renderAffiliations === "function") renderAffiliations();

  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = "&#x21BB; Sync"; }
    alert("Sync failed: " + err.message);
  }
}

// -------------------- LOGOUT --------------------
// Logs the user out and returns them to index.html
function logout() {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("session_timestamp");
    localStorage.removeItem("selectedCongregation");
    localStorage.removeItem("foyLastSync");
    // Legacy keys (safe to remove even if absent)
    localStorage.removeItem("foyDB");
    _COLLECTIONS.forEach(function(k) { localStorage.removeItem('foyDB_' + k); });

    // Clear IndexedDB and the in-memory cache
    clearDatabase().then(function() {
        window.location.href = "index.html";
    });
}
