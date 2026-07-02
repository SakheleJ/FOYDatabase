// ─── FOY Database — storage layer (IndexedDB) ────────────────────────────────
// Uses IndexedDB so individual collections can grow beyond the 5 MB
// localStorage limit.  An in-memory cache means getDatabase() stays
// synchronous for all callers; saveDatabase() updates the cache immediately
// and persists to IndexedDB in the background.
// ─────────────────────────────────────────────────────────────────────────────

var _dbCache = null;          // in-memory copy — always current after init
var _idbPromise = null;       // singleton IDB connection promise

var _COLLECTIONS = ['users', 'Presbytery', 'Congregation', 'Member', 'Affiliation'];

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function _openIDB() {
  if (_idbPromise) return _idbPromise;
  _idbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open('foyDB', 1);
    req.onupgradeneeded = function(e) {
      e.target.result.createObjectStore('collections');
    };
    req.onsuccess  = function(e) { resolve(e.target.result); };
    req.onerror    = function(e) { reject(e.target.error); };
    req.onblocked  = function()  { reject(new Error('IndexedDB blocked — close other tabs and retry.')); };
  });
  return _idbPromise;
}

function _idbGet(key) {
  return _openIDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction('collections', 'readonly').objectStore('collections').get(key);
      req.onsuccess = function() { resolve(req.result !== undefined ? req.result : null); };
      req.onerror   = function() { reject(req.error); };
    });
  });
}

function _idbPutAll(db) {
  return _openIDB().then(function(idb) {
    return new Promise(function(resolve, reject) {
      var tx = idb.transaction('collections', 'readwrite');
      var store = tx.objectStore('collections');
      _COLLECTIONS.forEach(function(k) { store.put(db[k] || [], k); });
      tx.oncomplete = resolve;
      tx.onerror    = function() { reject(tx.error); };
    });
  });
}

// ── Migration: pull data from old localStorage keys into IDB ──────────────────
function _migrateFromLocalStorage() {
  // Check both legacy formats: single "foyDB" key and split "foyDB_*" keys
  var legacySingle = localStorage.getItem('foyDB');
  var legacySplit  = localStorage.getItem('foyDB_Member');

  var source = null;
  if (legacySingle) {
    try { source = JSON.parse(legacySingle); } catch(e) {}
  } else if (legacySplit) {
    source = {};
    _COLLECTIONS.forEach(function(k) {
      try { source[k] = JSON.parse(localStorage.getItem('foyDB_' + k) || '[]'); }
      catch(e) { source[k] = []; }
    });
  }

  if (!source) return Promise.resolve(null);

  return _idbPutAll(source).then(function() {
    // Clean up all legacy keys
    localStorage.removeItem('foyDB');
    _COLLECTIONS.forEach(function(k) { localStorage.removeItem('foyDB_' + k); });
    console.log('Migrated localStorage data to IndexedDB.');
    return source;
  });
}

// ── Apply data migrations / backfills to a raw db object ─────────────────────
function _applyMigrations(parsed) {
  parsed.users        = parsed.users        || [];
  parsed.Presbytery   = parsed.Presbytery   || [];
  parsed.Congregation = parsed.Congregation || [];
  parsed.Member       = parsed.Member       || [];
  parsed.Affiliation  = parsed.Affiliation  || [];

  // Normalize presbyteryID to numbers
  parsed.Presbytery = parsed.Presbytery.map(function(p) {
    return Object.assign({}, p, { presbyteryID: Number(p.presbyteryID) });
  });
  parsed.Congregation = parsed.Congregation.map(function(c) {
    return Object.assign({}, c, { presbyteryID: Number(c.presbyteryID) });
  });

  // Backfill member detail snapshot on Affiliation rows
  parsed.Affiliation = parsed.Affiliation.map(function(a) {
    if (!a.title && !a.surname && !a.name && !a.dob && !a.gender) {
      var member = parsed.Member.find(function(m) { return m.memberID === a.memberID; });
      if (member) {
        a = Object.assign({}, a, {
          title: member.title || '', surname: member.surname || '',
          name: member.name || '', dob: member.dob || '', gender: member.gender || ''
        });
      }
    }
    if (!a.congregationName && !a.presbyteryName) {
      var cong = parsed.Congregation.find(function(c) { return String(c.congregationID) === String(a.congregationID); });
      var pres = cong ? parsed.Presbytery.find(function(p) { return String(p.presbyteryID) === String(cong.presbyteryID); }) : null;
      a = Object.assign({}, a, {
        congregationName: (cong && cong.name) || '',
        presbyteryName:   (pres && pres.name) || ''
      });
    }
    return a;
  });

  // Ensure audit columns exist on every record
  ['Presbytery', 'Congregation', 'Member', 'Affiliation'].forEach(function(table) {
    (parsed[table] || []).forEach(function(row) {
      if (!row.lastModified)   row.lastModified   = '';
      if (!row.lastModifiedBy) row.lastModifiedBy = '';
    });
  });

  return parsed;
}

// ── Public: async init — call once at startup before getDatabase() ────────────
// Returns the loaded database. Safe to call multiple times (no-op if already loaded).
function initDatabase() {
  if (_dbCache) return Promise.resolve(_dbCache);

  return _openIDB()
    .then(function() { return _migrateFromLocalStorage(); })
    .then(function(migrated) {
      if (migrated) {
        _dbCache = _applyMigrations(migrated);
        return _dbCache;
      }
      // Load each collection from IDB
      return Promise.all(_COLLECTIONS.map(function(k) { return _idbGet(k); }))
        .then(function(results) {
          var raw = {};
          _COLLECTIONS.forEach(function(k, i) { raw[k] = results[i] || []; });
          _dbCache = _applyMigrations(raw);
          return _dbCache;
        });
    })
    .catch(function(err) {
      console.error('initDatabase failed:', err);
      _dbCache = { users: [], Presbytery: [], Congregation: [], Member: [], Affiliation: [] };
      return _dbCache;
    });
}

// ── Public: synchronous read (returns in-memory cache) ───────────────────────
// Always returns immediately. Call initDatabase() at least once before this.
function getDatabase() {
  if (_dbCache) return _dbCache;

  // Fallback: shouldn't normally be reached after initDatabase() is awaited,
  // but protects pages that call getDatabase() before init completes.
  console.warn('getDatabase() called before initDatabase() resolved — returning empty DB.');
  return { users: [], Presbytery: [], Congregation: [], Member: [], Affiliation: [] };
}

// ── Public: synchronous cache update + async IDB persist ─────────────────────
function saveDatabase(db) {
  _dbCache = db;                  // update in-memory copy immediately
  _idbPutAll(db).catch(function(err) {
    console.error('saveDatabase: IDB write failed:', err);
    alert(
      '⚠️ Failed to save the database to storage:\n' + (err.message || err) +
      '\n\nYour changes are held in memory for this session but will be lost on refresh. ' +
      'Please export a backup now.'
    );
  });
}

// ── Public: wipe all data from IDB and the in-memory cache ───────────────────
function clearDatabase() {
  _dbCache = null;
  return _openIDB().then(function(idb) {
    return new Promise(function(resolve, reject) {
      var tx = idb.transaction('collections', 'readwrite');
      tx.objectStore('collections').clear();
      tx.oncomplete = resolve;
      tx.onerror    = function() { reject(tx.error); };
    });
  }).catch(function(err) {
    console.error('clearDatabase failed:', err);
  });
}

// Kick off IDB load immediately when this script is parsed — by the time any
// DOMContentLoaded handler fires, the cache will already be populated (or close to it).
initDatabase();

function updateFileStatus() {
  var db = getDatabase();
  var el = document.getElementById('file-status');
  if (el) el.textContent = 'Database active with ' + (db.users || []).length + ' users.';
}
