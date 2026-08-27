// SCRIPT: fuzzy-match.js
// Pure, DOM-free fuzzy string matching used to detect near-duplicate members
// before creating a new Member record. Algorithms ported from fuzzy-lookup.html.

function jaro(s1, s2) {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (!l1 || !l2) return 0;
  const dist = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const m1 = new Array(l1).fill(false), m2 = new Array(l2).fill(false);
  let matches = 0, t = 0;
  for (let i = 0; i < l1; i++) {
    const lo = Math.max(0, i - dist), hi = Math.min(i + dist + 1, l2);
    for (let j = lo; j < hi; j++) { if (m2[j] || s1[i] !== s2[j]) continue; m1[i] = m2[j] = true; matches++; break; }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < l1; i++) { if (!m1[i]) continue; while (!m2[k]) k++; if (s1[i] !== s2[k]) t++; k++; }
  return (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;
}

function jaroWinkler(a, b) {
  const jd = jaro(a, b);
  let p = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) { if (a[i] === b[i]) p++; else break; }
  return jd + p * 0.1 * (1 - jd);
}

function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bg = new Map();
  for (let i = 0; i < a.length - 1; i++) { const s = a.slice(i, i + 2); bg.set(s, (bg.get(s) || 0) + 1); }
  let inter = 0;
  for (let i = 0; i < b.length - 1; i++) { const s = b.slice(i, i + 2); if (bg.get(s) > 0) { inter++; bg.set(s, bg.get(s) - 1); } }
  return (2 * inter) / (a.length + b.length - 2);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i ? (j ? 0 : i) : j));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

function sim(a, b, algo) {
  a = (a || '').toLowerCase().trim();
  b = (b || '').toLowerCase().trim();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (algo === 'jaro') return jaroWinkler(a, b);
  if (algo === 'dice') return dice(a, b);
  return levenshtein(a, b);
}

function normalizeDate(s) {
  s = (s || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\s\-\/\.](\d{1,2})[\s\-\/\.](\d{4})$/);
  if (dmy) { const [, d, m, y] = dmy; return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  const ymd = s.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})$/);
  if (ymd) { const [, y, m, d] = ymd; return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

// Compares "name surname" against both orderings so a swapped name/surname pair still scores well.
function nameSim(a, b, algo) {
  const fullA = `${a.name || ''} ${a.surname || ''}`.trim().toLowerCase();
  const fullB = `${b.name || ''} ${b.surname || ''}`.trim().toLowerCase();
  const swapB = `${b.surname || ''} ${b.name || ''}`.trim().toLowerCase();
  return Math.max(sim(fullA, fullB, algo), sim(fullA, swapB, algo));
}

function dobSim(dobA, dobB, algo) {
  const a = normalizeDate(dobA), b = normalizeDate(dobB);
  if (!a || !b) return null; // either side missing — excluded from score
  if (a === b) return 1;
  return sim(a, b, algo);
}

// Member-identity match: name (swap-aware), DOB (date-normalized), gender.
// Congregation/presbytery/period aren't Member fields (they live on Affiliation), so they're not scored here.
function scoreMemberMatch(input, candidate, weights, algo) {
  weights = weights || { name: 55, dob: 30, gender: 15 };
  algo = algo || 'jaro';
  const scores = {};
  let totalW = 0, weightedSum = 0;

  scores.name = nameSim(input, candidate, algo);
  totalW += weights.name; weightedSum += scores.name * weights.name;

  scores.dob = dobSim(input.dob, candidate.dob, algo);
  if (scores.dob !== null) { totalW += weights.dob; weightedSum += scores.dob * weights.dob; }

  scores.gender = (!input.gender || !candidate.gender) ? null : sim(input.gender, candidate.gender, algo);
  if (scores.gender !== null) { totalW += weights.gender; weightedSum += scores.gender * weights.gender; }

  return { overall: totalW > 0 ? weightedSum / totalW : 0, scores };
}

// Returns candidates scoring at/above `threshold`, sorted highest first.
function findMemberMatches(input, existingMembers, opts) {
  opts = opts || {};
  const threshold = opts.threshold !== undefined ? opts.threshold : 0.75;
  const weights = opts.weights;
  const algo = opts.algo;
  return (existingMembers || [])
    .map(member => ({ member, ...scoreMemberMatch(input, member, weights, algo) }))
    .filter(r => r.overall >= threshold)
    .sort((a, b) => b.overall - a.overall);
}
