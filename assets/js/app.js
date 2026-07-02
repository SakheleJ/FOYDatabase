document.addEventListener("DOMContentLoaded", function() { initDatabase().then(init); });

// Create timestamp (YYMMDD_HHMM)
const now = new Date();
const year = String(now.getFullYear()).slice(-2);
const month = String(now.getMonth() + 1).padStart(2, "0");
const day = String(now.getDate()).padStart(2, "0");
const hours = String(now.getHours()).padStart(2, "0");
const minutes = String(now.getMinutes()).padStart(2, "0");
const timestamp = `${year}${month}${day}_${hours}${minutes}`;

function init() {
  // Seed a default admin user if the database is brand new (no users yet)
  const db = getDatabase();
  if (!db.users || db.users.length === 0) {
    db.users = [{
      UserID: 1,
      name: "admin",
      email: "admin@foy.co.za",
      password: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
      role: "DBadmin"
    }];
    saveDatabase(db);
  }

  const fileInput = document.getElementById("file-input");
  if (fileInput) fileInput.addEventListener("change", handleFileSelect);

  updateFileStatus();

  try {
    const user = JSON.parse(localStorage.getItem("currentUser") || '{}');
    const isAdmin = user.role === 'Admin' || user.role === 'DBadmin';
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('d-none', !isAdmin));
  } catch (e) {}
}

// Run on every page except index.html
(function checkAuth() {
    const isLoginPage = window.location.pathname.endsWith("index.html") ||
                        window.location.pathname === "/";

    const user = localStorage.getItem("currentUser");

    if (!user && !isLoginPage) {
        window.location.href = "index.html";
    }
})();



function getSelectedCongregation() {
  const id = localStorage.getItem("selectedCongregation");
  if (!id) return null;

  const db = getDatabase();
  return db.Congregation.find(c => c.congregationID === id) || null;
}