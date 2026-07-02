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

  const db = getDatabase();

  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    document.getElementById("register-error").textContent = "Email already registered.";
    return;
  }

  const hashedPassword = await hashPassword(password);
  const newId = db.users.length ? Math.max(...db.users.map(u => u.UserID)) + 1 : 1;
  const presbytery   = (document.getElementById("userPresbytery")   || {}).value || "ALL";
  const congregation = (document.getElementById("userCongregation") || {}).value || "ALL";

  const newUser = { UserID: newId, name, email, password: hashedPassword, role, presbytery, congregation };
  db.users.push(newUser);
  saveDatabase(db);

  // Write the new user back to the Sheet
  postToSheet("addUser", newUser).catch(function(err) {
    console.warn("Sheet write for new user failed:", err.message);
  });

  alert("Registration successful!");

  const modal = bootstrap.Modal.getInstance(document.getElementById("registerUserModal"));
  modal.hide();
  document.getElementById("registerUserForm").reset();
}

// -------------------- LOGIN --------------------
async function loginENC() {
  await initDatabase();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const errorEl  = document.getElementById("register-error");
  const btnText  = document.getElementById("login-btn-text");
  const spinner  = document.getElementById("login-spinner");

  errorEl.textContent = "";

  const sheetURL = getSheetURL();

  // Step 1 — Pre-fetch users from Sheet so new accounts created elsewhere are available.
  // Falls back silently to cached users if Sheet is unreachable (offline support).
  if (sheetURL) {
    if (btnText) btnText.textContent = "Checking account…";
    if (spinner) spinner.classList.remove("d-none");
    try {
      const resp = await fetch(sheetURL + "?collection=users");
      const json = await resp.json();
      if (json.success && json.data && json.data.users && json.data.users.length) {
        const existingDB = getDatabase();
        existingDB.users = json.data.users;
        saveDatabase(existingDB);
      }
    } catch (e) {
      // Sheet unreachable — cached users will be used; login still works offline
    }
    if (btnText) btnText.textContent = "Login";
    if (spinner) spinner.classList.add("d-none");
  }

  // Step 2 — Check credentials against the now-current user list
  const hashedPassword = await hashPassword(password);
  const db   = getDatabase();
  const user = db.users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === hashedPassword
  );

  if (!user) {
    errorEl.textContent = "Invalid email or password.";
    return;
  }

  // Ensure scope fields are present (default to ALL if not set in Sheet)
  if (!user.presbytery)   user.presbytery   = "ALL";
  if (!user.congregation) user.congregation = "ALL";

  localStorage.setItem("currentUser", JSON.stringify(user));

  // Step 3 — Full data sync now that the user is authenticated
  if (sheetURL) {
    if (btnText) btnText.textContent = "Syncing data…";
    if (spinner) spinner.classList.remove("d-none");

    try {
      await syncFromSheet(sheetURL, { presbytery: user.presbytery || "ALL", congregation: user.congregation || "ALL" });
    } catch (err) {
      if (btnText) btnText.textContent = "Login";
      if (spinner) spinner.classList.add("d-none");
      const proceed = confirm(
        "⚠️ Could not sync from Google Sheet:\n" + err.message +
        "\n\nContinue with locally cached data?"
      );
      if (!proceed) {
        localStorage.removeItem("currentUser");
        return;
      }
    }
  }

  window.location.href = "dashboard.html";
}
// -------------------- SCOPE DROPDOWNS (Register User modal) --------------------
// Populates the Presbytery and Congregation selects with live DB values.
// Called when the registerUserModal is shown.
function populateUserScopeDropdowns() {
  const db = getDatabase();
  const presbyteries  = db.Presbytery   || [];
  const congregations = db.Congregation || [];

  const presSelect  = document.getElementById("userPresbytery");
  const congSelect  = document.getElementById("userCongregation");
  if (!presSelect || !congSelect) return;

  // Populate presbyteries
  presSelect.innerHTML = '<option value="ALL">ALL</option>' +
    presbyteries.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

  // Populate congregations (all initially)
  function fillCongregations(filteredPresName) {
    const filtered = filteredPresName && filteredPresName !== "ALL"
      ? congregations.filter(c => {
          const pres = presbyteries.find(p => String(p.presbyteryID) === String(c.presbyteryID));
          return pres && pres.name === filteredPresName;
        })
      : congregations;
    congSelect.innerHTML = '<option value="ALL">ALL</option>' +
      filtered.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  fillCongregations(null);

  // Re-filter congregations when presbytery changes
  presSelect.onchange = () => fillCongregations(presSelect.value);
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
