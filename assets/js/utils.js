// Returns the logged-in user's data scope.
// { presbytery: "ALL"|"Name", congregation: "ALL"|"Name" }
function getUserScope() {
  try {
    const u = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const pres = u.presbytery   || "ALL";
    const cong = u.congregation || "ALL";
    return {
      presbytery:   pres.toLowerCase() === "all" ? "ALL" : pres,
      congregation: cong.toLowerCase() === "all" ? "ALL" : cong
    };
  } catch (e) {
    return { presbytery: "ALL", congregation: "ALL" };
  }
}

function generateGUID() {
  // Returns a standard 8-4-4-4-12 formatted UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0,
      v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ------------ REGISTER ENCRYPTED USER ------------
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
