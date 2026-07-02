// SCRIPT: dashboard.js
// Summary stats panel and presbytery breakdown table for the dashboard home page

// ── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(dob, asOf = new Date()) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  let age = asOf.getFullYear() - birth.getFullYear();
  const m = asOf.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < birth.getDate())) age--;
  return age;
}

function sparklineSVG(values) {
  const W = 80, H = 26;
  const data = values.map(Number);
  if (data.length === 0) return '';
  if (data.length === 1) {
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><circle cx="${W/2}" cy="${H/2}" r="3" fill="#0d6efd"/></svg>`;
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 3;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (W - pad * 2) + pad;
    const y = (H - pad * 2) - ((v - min) / range) * (H - pad * 2) + pad;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastPt = pts.split(' ').pop().split(',');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="#0d6efd" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="2.5" fill="#0d6efd"/>
  </svg>`;
}

// ── Stat Cards ───────────────────────────────────────────────────────────────

function computeDashboardStats(period) {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];

  const p = parseInt(period);
  const affsInPeriod = affiliations.filter(a => parseInt(a.yearRegistered) === p);
  const memberIDsInPeriod = new Set(affsInPeriod.map(a => a.memberID));

  const prevPeriod = p - 1;
  const memberIDsInPrev = new Set(
    affiliations.filter(a => parseInt(a.yearRegistered) === prevPeriod).map(a => a.memberID)
  );
  let retentionRate = null;
  if (memberIDsInPrev.size > 0) {
    const retained = [...memberIDsInPrev].filter(id => memberIDsInPeriod.has(id)).length;
    retentionRate = Math.round((retained / memberIDsInPrev.size) * 100);
  }

  let totalAge = 0, ageCount = 0;
  memberIDsInPeriod.forEach(memberID => {
    const allForMember = affiliations.filter(a => a.memberID === memberID);
    if (allForMember.length > 0) {
      const firstYear = Math.min(...allForMember.map(a => parseInt(a.yearRegistered)));
      totalAge += (p - firstYear);
      ageCount++;
    }
  });
  const avgMembershipAge = ageCount > 0 ? (totalAge / ageCount).toFixed(1) : null;

  const congIDsInPeriod = new Set(affsInPeriod.map(a => String(a.congregationID)));
  const presIDsInPeriod = new Set(
    [...congIDsInPeriod].map(cid => {
      const cong = (db.Congregation || []).find(c => String(c.congregationID) === cid);
      return cong ? String(cong.presbyteryID) : null;
    }).filter(Boolean)
  );

  return {
    presbyteries: presIDsInPeriod.size,
    congregations: congIDsInPeriod.size,
    members: memberIDsInPeriod.size,
    avgMembershipAge,
    retentionRate,
    prevPeriod
  };
}

function renderDashboardStats() {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];

  const periodFilter = document.getElementById('statPeriodFilter');
  if (!periodFilter) return;

  const periods = [...new Set(affiliations.map(a => parseInt(a.yearRegistered)))]
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a);

  const currentOptions = [...periodFilter.options].map(o => o.value);
  const newOptions = periods.map(String);
  if (JSON.stringify(currentOptions) !== JSON.stringify(newOptions)) {
    const prev = periodFilter.value;
    periodFilter.innerHTML = periods.map(p => `<option value="${p}">${p}</option>`).join('');
    if (prev && newOptions.includes(prev)) {
      periodFilter.value = prev;
    } else if (periods.length > 0) {
      periodFilter.value = periods[0];
    }
  }

  const selectedPeriod = periodFilter.value;

  if (!selectedPeriod || periods.length === 0) {
    ['statPresbyteries', 'statCongregations', 'statMembers', 'statMembershipAge', 'statRetention']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    const note = document.getElementById('statRetentionNote');
    if (note) note.textContent = 'No data';
    return;
  }

  const stats = computeDashboardStats(selectedPeriod);

  document.getElementById('statPresbyteries').textContent = stats.presbyteries;
  document.getElementById('statCongregations').textContent = stats.congregations;
  document.getElementById('statMembers').textContent = stats.members.toLocaleString();
  document.getElementById('statMembershipAge').textContent =
    stats.avgMembershipAge !== null ? `${stats.avgMembershipAge} yrs` : '—';

  const retEl = document.getElementById('statRetention');
  const retNote = document.getElementById('statRetentionNote');
  if (stats.retentionRate !== null) {
    retEl.textContent = `${stats.retentionRate}%`;
    if (retNote) retNote.textContent = `vs ${stats.prevPeriod}`;
  } else {
    retEl.textContent = '—';
    if (retNote) retNote.textContent = `No ${stats.prevPeriod} data`;
  }
}

// ── Presbytery Breakdown Table ───────────────────────────────────────────────

// Sort state persists across re-renders
var _breakdownSort = { col: 'name', dir: 'asc' };

function sortIndicator(col) {
  if (_breakdownSort.col !== col) return ' <span style="opacity:0.3">⇅</span>';
  return _breakdownSort.dir === 'asc' ? ' ↑' : ' ↓';
}

function thHTML(label, col, extraClass) {
  const cls = extraClass || 'text-center px-2';
  return `<th class="${cls}" style="cursor:pointer;white-space:nowrap;" data-sort-col="${col}">${label}${sortIndicator(col)}</th>`;
}

function renderPresbyterBreakdown() {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];
  const congregations = db.Congregation || [];
  const presbyteries = db.Presbytery || [];

  const thead = document.getElementById('presbyteryBreakdownHead');
  const tbody = document.getElementById('presbyteryBreakdownBody');
  if (!thead || !tbody) return;

  const periods = [...new Set(affiliations.map(a => parseInt(a.yearRegistered)))]
    .filter(y => !isNaN(y))
    .sort((a, b) => a - b);

  if (periods.length === 0 || presbyteries.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No affiliation data available.</td></tr>';
    return;
  }

  const periodFilter = document.getElementById('statPeriodFilter');
  const selectedPeriod = periodFilter && periodFilter.value ? parseInt(periodFilter.value) : periods[periods.length - 1];

  // Build header with sort triggers
  thead.innerHTML = `<tr>
    ${thHTML('Presbytery', 'name', 'px-2')}
    ${periods.map(p => thHTML(p, String(p))).join('')}
    <th class="text-center px-2" style="white-space:nowrap">Trend</th>
    ${thHTML('Male %', 'male')}
    ${thHTML('Female %', 'female')}
    ${thHTML('Avg Age', 'avgAge')}
    ${thHTML('Retention', 'retention')}
  </tr>`;

  // Wire up header click handlers
  thead.querySelectorAll('th[data-sort-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort-col');
      if (_breakdownSort.col === col) {
        _breakdownSort.dir = _breakdownSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        _breakdownSort.col = col;
        _breakdownSort.dir = col === 'name' ? 'asc' : 'desc';
      }
      renderPresbyterBreakdown();
    });
  });

  // Build row data
  const rows = presbyteries.map(pres => {
    const congIDs = new Set(
      congregations
        .filter(c => String(c.presbyteryID) === String(pres.presbyteryID))
        .map(c => String(c.congregationID))
    );
    const presAffs = affiliations.filter(a => congIDs.has(String(a.congregationID)));

    const membersByPeriod = {};
    periods.forEach(p => {
      membersByPeriod[p] = new Set(
        presAffs.filter(a => parseInt(a.yearRegistered) === p).map(a => a.memberID)
      );
    });

    const sparkValues = periods.map(p => membersByPeriod[p].size);
    const targetPeriod = membersByPeriod[selectedPeriod]?.size > 0 ? selectedPeriod : null;

    let males = 0, females = 0;
    if (targetPeriod) {
      const seen = new Set();
      presAffs.filter(a => parseInt(a.yearRegistered) === targetPeriod).forEach(a => {
        if (seen.has(a.memberID)) return;
        seen.add(a.memberID);
        if (a.gender === 'Male') males++;
        else if (a.gender === 'Female') females++;
      });
    }
    const genderTotal = males + females;
    const malePct = genderTotal > 0 ? Math.round((males / genderTotal) * 100) : null;
    const femalePct = genderTotal > 0 ? Math.round((females / genderTotal) * 100) : null;

    let avgAge = null;
    if (targetPeriod) {
      const seen = new Set();
      const ages = [];
      const asOf = new Date(targetPeriod, 11, 31);
      presAffs.filter(a => parseInt(a.yearRegistered) === targetPeriod).forEach(a => {
        if (seen.has(a.memberID)) return;
        seen.add(a.memberID);
        const age = calcAge(a.dob, asOf);
        if (age !== null) ages.push(age);
      });
      if (ages.length > 0) avgAge = (ages.reduce((s, v) => s + v, 0) / ages.length).toFixed(1);
    }

    let retention = null;
    if (targetPeriod) {
      const prevIDs = new Set(
        presAffs.filter(a => parseInt(a.yearRegistered) === targetPeriod - 1).map(a => a.memberID)
      );
      if (prevIDs.size > 0) {
        const retained = [...prevIDs].filter(id => membersByPeriod[targetPeriod].has(id)).length;
        retention = Math.round((retained / prevIDs.size) * 100);
      }
    }

    return { pres, membersByPeriod, sparkValues, malePct, femalePct, avgAge, retention };
  });

  // Sort
  const col = _breakdownSort.col;
  const dir = _breakdownSort.dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let va, vb;
    if (col === 'name') {
      va = a.pres.name.toLowerCase();
      vb = b.pres.name.toLowerCase();
      return va < vb ? -dir : va > vb ? dir : 0;
    }
    if (col === 'male')      { va = a.malePct ?? -1;  vb = b.malePct ?? -1; }
    else if (col === 'female')    { va = a.femalePct ?? -1; vb = b.femalePct ?? -1; }
    else if (col === 'avgAge')    { va = parseFloat(a.avgAge) || -1; vb = parseFloat(b.avgAge) || -1; }
    else if (col === 'retention') { va = a.retention ?? -1; vb = b.retention ?? -1; }
    else { // period column
      const p = parseInt(col);
      va = a.membersByPeriod[p]?.size ?? -1;
      vb = b.membersByPeriod[p]?.size ?? -1;
    }
    return (va - vb) * dir;
  });

  const dash = '<span class="text-muted">—</span>';

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="fw-semibold">${r.pres.name}</td>
      ${periods.map(p => {
        const count = r.membersByPeriod[p]?.size || 0;
        return `<td class="text-center">${count > 0 ? count : dash}</td>`;
      }).join('')}
      <td class="text-center">${sparklineSVG(r.sparkValues)}</td>
      <td class="text-center">${r.malePct !== null ? r.malePct + '%' : dash}</td>
      <td class="text-center">${r.femalePct !== null ? r.femalePct + '%' : dash}</td>
      <td class="text-center">${r.avgAge !== null ? r.avgAge : dash}</td>
      <td class="text-center">${r.retention !== null
        ? `<span class="${r.retention >= 80 ? 'text-success' : r.retention >= 60 ? 'text-warning' : 'text-danger'} fw-semibold">${r.retention}%</span>`
        : dash
      }</td>
    </tr>
  `).join('');
}

// ── Generic Line Chart (SVG) ─────────────────────────────────────────────────

var CHART_COLORS = ['#0d6efd','#d63384','#fd7e14','#198754','#6f42c1','#20c997','#dc3545','#0dcaf0','#ffc107','#adb5bd'];

// series: [{ name, values:[num|null,...], color }]; avgSeries: [num|null,...] (dashed grey), optional
function renderLineChartInto(container, periods, series, avgSeries, opts) {
  opts = Object.assign({ yMin: 0, yMax: 100, unit: '%' }, opts || {});
  if (!container) return;

  if (!periods || periods.length === 0 || !series || series.length === 0) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Not enough data to display.</p>';
    return;
  }

  const W = 600, H = 220;
  const ml = 42, mr = 16, mt = 16, mb = 44;
  const pw = W - ml - mr, ph = H - mt - mb;
  const yMin = opts.yMin, yMax = opts.yMax;
  const xOf = i => ml + (periods.length > 1 ? (i / (periods.length - 1)) * pw : pw / 2);
  const yOf = v => mt + ph - ((v - yMin) / (yMax - yMin)) * ph;

  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => yMin + f * (yMax - yMin)).map(v => `
    <line x1="${ml}" y1="${yOf(v)}" x2="${W - mr}" y2="${yOf(v)}" stroke="#e9ecef" stroke-width="1"/>
    <text x="${ml - 6}" y="${yOf(v) + 4}" text-anchor="end" font-size="10" fill="#adb5bd">${Math.round(v)}${opts.unit}</text>
  `).join('');

  const xLabels = periods.map((p, i) =>
    `<text x="${xOf(i)}" y="${H - mb + 16}" text-anchor="middle" font-size="10" fill="#6c757d">${p}</text>`
  ).join('');

  function buildPath(values) {
    let d = '', open = false;
    values.forEach((v, i) => {
      if (v === null || v === undefined) { open = false; return; }
      d += open ? `L${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} ` : `M${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  }

  // Visible thin lines + invisible wide hit areas per series
  const seriesLines = series.map((d, pi) => {
    const path = buildPath(d.values);
    if (!path) return '';
    const dots = d.values.map((v, i) => (v !== null && v !== undefined)
      ? `<circle class="s-dot" data-pi="${pi}" cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3" fill="${d.color}" style="pointer-events:none;"/>`
      : '').join('');
    return `
      <path class="s-line" data-pi="${pi}" d="${path}" fill="none" stroke="${d.color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" style="transition:stroke-width 0.15s;"/>
      ${dots}
      <path class="s-hit" data-pi="${pi}" d="${path}" fill="none" stroke="transparent" stroke-width="14" style="cursor:pointer;"/>
    `;
  }).join('');

  let avgLine = '';
  if (avgSeries) {
    const avgPath = buildPath(avgSeries);
    avgLine = avgPath
      ? `<path d="${avgPath}" fill="none" stroke="#6c757d" stroke-width="1.5" stroke-dasharray="6,4" stroke-linecap="round" style="pointer-events:none;"/>`
      : '';
  }

  container.style.position = 'relative';
  container.innerHTML = `
    <div class="chart-tooltip" style="
      display:none;position:absolute;pointer-events:none;
      background:rgba(30,30,30,0.85);color:#fff;
      font-size:0.75rem;padding:5px 10px;border-radius:6px;
      white-space:nowrap;z-index:10;
    "></div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="auto" style="display:block;overflow:visible;">
      ${grid}
      <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="#dee2e6" stroke-width="1"/>
      ${seriesLines}
      ${avgLine}
      ${xLabels}
    </svg>
  `;

  const tooltip = container.querySelector('.chart-tooltip');
  const svgEl   = container.querySelector('svg');

  container.querySelectorAll('.s-hit').forEach(hitPath => {
    const pi = parseInt(hitPath.dataset.pi);
    const visLine = container.querySelector(`.s-line[data-pi="${pi}"]`);
    const d = series[pi];

    hitPath.addEventListener('mouseenter', () => {
      if (visLine) visLine.setAttribute('stroke-width', '3.5');
    });

    hitPath.addEventListener('mouseleave', () => {
      if (visLine) visLine.setAttribute('stroke-width', '1.5');
      tooltip.style.display = 'none';
    });

    hitPath.addEventListener('mousemove', e => {
      const rect = svgEl.getBoundingClientRect();
      const svgX = (e.clientX - rect.left) * (W / rect.width);
      // Snap to nearest period
      let bestI = 0, bestDist = Infinity;
      periods.forEach((p, i) => {
        const dist = Math.abs(xOf(i) - svgX);
        if (dist < bestDist) { bestDist = dist; bestI = i; }
      });
      const val = d.values[bestI];
      tooltip.textContent = `${d.name} · ${periods[bestI]}: ${(val !== null && val !== undefined) ? val + opts.unit : '—'}`;
      tooltip.style.display = 'block';
      const cRect = container.getBoundingClientRect();
      tooltip.style.left = (e.clientX - cRect.left + 14) + 'px';
      tooltip.style.top  = (e.clientY - cRect.top - 32) + 'px';
    });
  });
}

// ── Generic Metric Table (per-presbytery rows, per-period columns, + averages) ──

// series: [{ name, values:[num|null,...] }]; avgSeries: [num|null,...] (per-period average across presbyteries)
function buildMetricTableHTML(periods, series, avgSeries, opts) {
  opts = Object.assign({ unit: '', decimals: 0 }, opts || {});
  const fmt = v => (v === null || v === undefined) ? '<span class="text-muted">—</span>' : `${Number(v).toFixed(opts.decimals)}${opts.unit}`;

  const rowsHTML = series.map(s => {
    const rowVals = s.values.filter(v => v !== null && v !== undefined);
    const rowAvg = rowVals.length > 0 ? rowVals.reduce((a, b) => a + b, 0) / rowVals.length : null;
    return `
      <tr>
        <td class="fw-semibold">${s.name}</td>
        ${s.values.map(v => `<td class="text-center">${fmt(v)}</td>`).join('')}
        <td class="text-center fw-semibold table-active">${fmt(rowAvg)}</td>
      </tr>`;
  }).join('');

  const overallAvgVals = (avgSeries || []).filter(v => v !== null && v !== undefined);
  const overallAvg = overallAvgVals.length > 0 ? overallAvgVals.reduce((a, b) => a + b, 0) / overallAvgVals.length : null;

  const avgRowHTML = `
    <tr class="table-active">
      <td class="fw-semibold">All Presbyteries — Average</td>
      ${(avgSeries || []).map(v => `<td class="text-center fw-semibold">${fmt(v)}</td>`).join('')}
      <td class="text-center fw-semibold">${fmt(overallAvg)}</td>
    </tr>`;

  return `
    <div class="table-responsive" style="border-radius:10px;overflow:hidden;border:1px solid #dee2e6;">
      <table class="table table-bordered table-sm table-hover align-middle mb-0">
        <thead class="table-active">
          <tr>
            <th class="px-2">Presbytery</th>
            ${periods.map(p => `<th class="text-center px-2">${p}</th>`).join('')}
            <th class="text-center px-2">Average (All Periods)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
          ${avgRowHTML}
        </tbody>
      </table>
    </div>`;
}

// ── Retention by Presbytery ──────────────────────────────────────────────────

function computeRetentionSeries() {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];
  const congregations = db.Congregation || [];
  const presbyteries = db.Presbytery || [];

  const allPeriods = [...new Set(affiliations.map(a => parseInt(a.yearRegistered)))]
    .filter(y => !isNaN(y)).sort((a, b) => a - b);

  if (allPeriods.length < 2) return null;

  const retPeriods = allPeriods.slice(1);

  const series = presbyteries.map((pres, i) => {
    const congIDs = new Set(
      congregations.filter(c => String(c.presbyteryID) === String(pres.presbyteryID))
        .map(c => String(c.congregationID))
    );
    const presAffs = affiliations.filter(a => congIDs.has(String(a.congregationID)));
    const values = retPeriods.map(p => {
      const curr = new Set(presAffs.filter(a => parseInt(a.yearRegistered) === p).map(a => a.memberID));
      const prev = new Set(presAffs.filter(a => parseInt(a.yearRegistered) === p - 1).map(a => a.memberID));
      if (prev.size === 0) return null;
      return Math.round(([...prev].filter(id => curr.has(id)).length / prev.size) * 100);
    });
    return { name: pres.name, values, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const avgSeries = retPeriods.map((p, i) => {
    const vals = series.map(d => d.values[i]).filter(v => v !== null);
    return vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  });

  return { periods: retPeriods, series, avgSeries };
}

function renderRetentionChart() {
  const container = document.getElementById('retentionChart');
  if (!container) return;
  const data = computeRetentionSeries();
  if (!data) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Need at least 2 periods of data to display retention trends.</p>';
    return;
  }
  renderLineChartInto(container, data.periods, data.series, data.avgSeries, { yMin: 0, yMax: 100, unit: '%' });
}

function renderRetentionTable() {
  const container = document.getElementById('retentionTable');
  if (!container) return;
  const data = computeRetentionSeries();
  if (!data) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">Need at least 2 periods of data to display retention trends.</p>';
    return;
  }
  container.innerHTML = buildMetricTableHTML(data.periods, data.series, data.avgSeries, { unit: '%', decimals: 0 });
}

var _retentionView = 'chart';
function setRetentionView(mode) {
  _retentionView = mode;
  const chartEl = document.getElementById('retentionChart');
  const tableEl = document.getElementById('retentionTable');
  const chartBtn = document.getElementById('retentionViewChartBtn');
  const tableBtn = document.getElementById('retentionViewTableBtn');
  if (!chartEl || !tableEl) return;
  if (mode === 'table') {
    chartEl.style.display = 'none';
    tableEl.style.display = '';
    chartBtn?.classList.remove('active');
    tableBtn?.classList.add('active');
    renderRetentionTable();
  } else {
    chartEl.style.display = '';
    tableEl.style.display = 'none';
    chartBtn?.classList.add('active');
    tableBtn?.classList.remove('active');
    renderRetentionChart();
  }
}

// ── Membership Average Age by Presbytery ─────────────────────────────────────

function computeMembershipAgeSeries() {
  const db = getDatabase();
  const affiliations = db.Affiliation || [];
  const congregations = db.Congregation || [];
  const presbyteries = db.Presbytery || [];

  const allPeriods = [...new Set(affiliations.map(a => parseInt(a.yearRegistered)))]
    .filter(y => !isNaN(y)).sort((a, b) => a - b);

  if (allPeriods.length === 0) return null;

  const series = presbyteries.map((pres, i) => {
    const congIDs = new Set(
      congregations.filter(c => String(c.presbyteryID) === String(pres.presbyteryID))
        .map(c => String(c.congregationID))
    );
    const presAffs = affiliations.filter(a => congIDs.has(String(a.congregationID)));
    const values = allPeriods.map(p => {
      const asOf = new Date(p, 11, 31);
      const seen = new Set();
      const ages = [];
      presAffs.filter(a => parseInt(a.yearRegistered) === p).forEach(a => {
        if (seen.has(a.memberID)) return;
        seen.add(a.memberID);
        const age = calcAge(a.dob, asOf);
        if (age !== null) ages.push(age);
      });
      return ages.length > 0 ? +(ages.reduce((s, v) => s + v, 0) / ages.length).toFixed(1) : null;
    });
    return { name: pres.name, values, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const avgSeries = allPeriods.map((p, i) => {
    const vals = series.map(d => d.values[i]).filter(v => v !== null);
    return vals.length > 0 ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null;
  });

  return { periods: allPeriods, series, avgSeries };
}

function renderMembershipAgeChart() {
  const container = document.getElementById('membershipAgeChart');
  if (!container) return;
  const data = computeMembershipAgeSeries();
  if (!data) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">No membership age data available.</p>';
    return;
  }
  const allVals = data.series.flatMap(s => s.values).concat(data.avgSeries).filter(v => v !== null && v !== undefined);
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 10;
  const yMax = Math.max(10, Math.ceil((maxVal + 5) / 10) * 10);
  renderLineChartInto(container, data.periods, data.series, data.avgSeries, { yMin: 0, yMax, unit: ' yrs' });
}

function renderMembershipAgeTable() {
  const container = document.getElementById('membershipAgeTable');
  if (!container) return;
  const data = computeMembershipAgeSeries();
  if (!data) {
    container.innerHTML = '<p class="text-muted text-center py-3 mb-0">No membership age data available.</p>';
    return;
  }
  container.innerHTML = buildMetricTableHTML(data.periods, data.series, data.avgSeries, { unit: ' yrs', decimals: 1 });
}

var _ageView = 'chart';
function setAgeView(mode) {
  _ageView = mode;
  const chartEl = document.getElementById('membershipAgeChart');
  const tableEl = document.getElementById('membershipAgeTable');
  const chartBtn = document.getElementById('ageViewChartBtn');
  const tableBtn = document.getElementById('ageViewTableBtn');
  if (!chartEl || !tableEl) return;
  if (mode === 'table') {
    chartEl.style.display = 'none';
    tableEl.style.display = '';
    chartBtn?.classList.remove('active');
    tableBtn?.classList.add('active');
    renderMembershipAgeTable();
  } else {
    chartEl.style.display = '';
    tableEl.style.display = 'none';
    chartBtn?.classList.add('active');
    tableBtn?.classList.remove('active');
    renderMembershipAgeChart();
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initDashboardStats() {
  const section = document.getElementById('dashboardStats');
  if (!section) return;

  renderDashboardStats();
  renderPresbyterBreakdown();
  renderRetentionChart();
  renderMembershipAgeChart();

  document.getElementById('statPeriodFilter')?.addEventListener('change', () => {
    renderDashboardStats();
    renderPresbyterBreakdown();
  });
}

document.addEventListener('DOMContentLoaded', function() { initDatabase().then(initDashboardStats); });

window.refreshDashboardStats = function () {
  renderDashboardStats();
  renderPresbyterBreakdown();
  if (_retentionView === 'table') renderRetentionTable(); else renderRetentionChart();
  if (_ageView === 'table') renderMembershipAgeTable(); else renderMembershipAgeChart();
};
