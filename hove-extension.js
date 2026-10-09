/* ═══════════════════════════════════════════════════════════════
   HOVE OPS — EXTENSION v2.1 (cahier des charges "fractionné")
   Charger APRÈS le script principal : <script src="hove-extension.js"></script>
   juste avant </body> (ou coller ce contenu dans un 2e <script>).
   Persistance : table Supabase hove_ext (voir hove-ext.sql), cache localStorage.
═══════════════════════════════════════════════════════════════ */

/* ── DONNÉES ── */
const XD = (() => {
  let d = {};
  try { d = JSON.parse(localStorage.getItem('hove_ext') || '{}'); } catch (e) {}
  ['coprops', 'trips', 'frats', 'sms', 'squawks', 'insp', 'peak', 'duty'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  ['flightStatus', 'subcharter', 'counters'].forEach(k => { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; });
  d.cfg = Object.assign({ fratGreen: 15, fratAmber: 30, dailyMax: 8, monthlyMax: 100, minRestDays: 8, overageMult: 1.25, availPerDay: 8 }, d.cfg || {});
  return d;
})();
const XS = { co: 'reg', fr: 'frat', mt: 'cnt', fa: 'inv', month: new Date().toISOString().slice(0, 7) };
/* ── PERSISTANCE SUPABASE (table hove_ext : 1 ligne par enregistrement) ── */
const XCOLS = ['coprops', 'trips', 'frats', 'sms', 'squawks', 'insp', 'peak', 'duty'];
const XMAPS = ['flightStatus', 'subcharter', 'counters', 'cfg'];
const XCFG_DEF = Object.assign({}, XD.cfg);
const XHW = Object.assign({}, H, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
let xCache = {}, xTimer = null, xOK = true;
function xRows() {
  const rows = [];
  XCOLS.forEach(k => XD[k].forEach(it => rows.push({ id: it.id, kind: k, data: it })));
  XMAPS.forEach(k => rows.push({ id: 'map:' + k, kind: 'map', data: XD[k] }));
  return rows;
}
function xWarn() {
  let el = document.getElementById('x-warn');
  if (xOK) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'x-warn'; el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2000;background:#FEF2F2;border:1px solid #EF4444;color:#B91C1C;border-radius:8px;padding:8px 12px;font:600 12px "DM Sans",sans-serif;max-width:320px'; document.body.appendChild(el); }
  el.textContent = '⚠ Sync Supabase impossible (table hove_ext créée ? politique RLS ?) — données gardées localement';
}
async function xSync() {
  const rows = xRows(), ids = new Set(rows.map(r => r.id));
  const changed = rows.filter(r => xCache[r.id] !== JSON.stringify(r.data));
  const gone = Object.keys(xCache).filter(id => !ids.has(id));
  try {
    if (changed.length) {
      const r = await fetch(`${SB}/rest/v1/hove_ext?on_conflict=id`, { method: 'POST', headers: XHW, body: JSON.stringify(changed.map(c => ({ id: c.id, kind: c.kind, data: c.data, updated_at: new Date().toISOString() }))) });
      if (!r.ok) throw new Error(await r.text());
      changed.forEach(c => { xCache[c.id] = JSON.stringify(c.data); });
    }
    for (const id of gone) {
      const r = await fetch(`${SB}/rest/v1/hove_ext?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: H });
      if (r.ok) delete xCache[id]; else throw new Error(await r.text());
    }
    xOK = true;
  } catch (e) { xOK = false; console.warn('hove_ext sync', e); }
  xWarn();
}
function xSave() { localStorage.setItem('hove_ext', JSON.stringify(XD)); clearTimeout(xTimer); xTimer = setTimeout(xSync, 400); }
async function xLoad() {
  try {
    const r = await fetch(`${SB}/rest/v1/hove_ext?select=*&order=created_at.asc&limit=10000`, { headers: H });
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error(JSON.stringify(rows));
    if (rows.length === 0) { await xSync(); return; } // 1er lancement : envoie les données locales existantes
    XCOLS.forEach(k => { XD[k] = []; });
    rows.forEach(r => {
      xCache[r.id] = JSON.stringify(r.data);
      if (r.kind === 'map') XD[r.id.slice(4)] = r.data; else if (XD[r.kind]) XD[r.kind].push(r.data);
    });
    XD.cfg = Object.assign({}, XCFG_DEF, XD.cfg);
    localStorage.setItem('hove_ext', JSON.stringify(XD));
    xOK = true;
  } catch (e) { xOK = false; console.warn('hove_ext load', e); }
  xWarn(); renderPage();
}
function xid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const xT = s => new Date(String(s).slice(0, 16) + ':00Z').getTime();
const xH = (a, b) => Math.max(0, (xT(b) - xT(a)) / 3600000);
const xN = v => parseFloat(v) || 0;
const xF = n => (Math.round(n * 10) / 10).toFixed(1);
const xHM = s => String(s || '').slice(11, 16);
const xHH = (a, b) => { const [h1, m1] = String(a || '0:0').split(':').map(Number), [h2, m2] = String(b || '0:0').split(':').map(Number); return Math.max(0, ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60); };
const xCancelled = f => (XD.flightStatus[f.id] === 'Annulé');
const xNonFlight = f => ['Maintenance', 'AOG'].includes(f.flight_type);

/* ── HELPERS UI ── */
const xi = (id, l, v = '', t = 'text', ex = '') => `<div class="field"><label>${l}</label><input id="${id}" type="${t}" value="${esc(v)}" ${ex}></div>`;
const xta = (id, l, v = '', ph = '') => `<div class="field"><label>${l}</label><textarea id="${id}" placeholder="${esc(ph)}">${esc(v)}</textarea></div>`;
const xs = (id, l, opts, sel = '', ex = '') => `<div class="field"><label>${l}</label><select id="${id}" ${ex}>${opts.map(o => { const v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return `<option value="${esc(v)}" ${String(sel) === String(v) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></div>`;
const xv = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
function xPage(t, sub, act, body) {
  document.getElementById('content').innerHTML = `<div class="ph"><div><h1>${t}</h1><div class="pg-sub">${sub || ''}</div></div><div class="row">${act || ''}</div></div>${body}`;
}
function xTabs(cur, items, key) {
  return `<div class="tabs" style="overflow-x:auto;flex-wrap:nowrap">${items.map(([id, l]) => `<button class="tab ${cur === id ? 'on' : ''}" onclick="xSet('${key}','${id}')">${l}</button>`).join('')}</div>`;
}
function xSet(k, v) { XS[k] = v; renderPage(); }
function xBadge(txt, bg, col) { return `<span class="badge" style="background:${bg};color:${col}">${esc(txt)}</span>`; }
function xBar(p, col) { return `<div class="dossier-progress"><div class="dossier-progress-bar" style="width:${Math.max(0, Math.min(100, p))}%;background:${col || 'var(--navy)'}"></div></div>`; }
const XCFGL = { fratGreen: 'Seuil vert FRAT (≤ validation auto)', fratAmber: 'Seuil orange FRAT (≤)', dailyMax: 'Max h de vol / jour', monthlyMax: 'Max h de vol / mois', minRestDays: 'Jours de repos min. / mois', overageMult: 'Coef. tarif majoré (dépassement)', availPerDay: 'Heures dispo. / jour / avion' };
function xCfgCard(keys) {
  return `<div class="card" style="margin-bottom:16px"><span class="sec-label">Paramètres — à aligner sur vos contrats / MANEX</span>
    <div class="g2">${keys.map(k => xi('cfg-' + k, XCFGL[k], XD.cfg[k], 'number', 'step="any"')).join('')}</div>
    <button class="btn btn-sm" onclick="xSaveCfg('${keys.join(',')}')">Enregistrer</button></div>`;
}
function xSaveCfg(keys) { keys.split(',').forEach(k => { XD.cfg[k] = xN(xv('cfg-' + k)); }); xSave(); renderPage(); }
function xPDF(title, sub) {
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const o = { doc, y: 32 };
  doc.setFillColor(11, 37, 89); doc.rect(0, 0, 210, 24, 'F'); doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('HOVE AVIATION EXECUTIVE', 15, 10);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(title, 15, 18);
  doc.setFontSize(8); doc.text(sub || '', 195, 18, { align: 'right' }); doc.setTextColor(0, 0, 0);
  o.chk = () => { if (o.y > 275) { doc.addPage(); o.y = 15; } };
  o.sec = t => { o.chk(); doc.setFillColor(238, 242, 250); doc.rect(15, o.y, 180, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(11, 37, 89); doc.text(String(t).toUpperCase(), 18, o.y + 5); doc.setTextColor(0, 0, 0); o.y += 10; };
  o.row = (l, v) => { o.chk(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(String(l), 15, o.y); doc.setFont('helvetica', 'bold'); doc.text(String(v == null || v === '' ? '—' : v), 195, o.y, { align: 'right' }); doc.setDrawColor(228, 233, 242); doc.line(15, o.y + 1.5, 195, o.y + 1.5); o.y += 6; };
  o.txt = (l, t) => { o.chk(); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(l, 15, o.y); o.y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.splitTextToSize(t || '—', 180).forEach(x => { o.chk(); doc.text(x, 15, o.y); o.y += 4.5; }); o.y += 2; };
  return o;
}

/* ═══════════════════════════════════════════
   1. PLANNING — statuts, conflits, sub-charter, verrous maintenance
═══════════════════════════════════════════ */
const XST = { 'Réservé': '#9CA3AF', 'Confirmé': '#1D4ED8', 'FRAT validé': '#059669', 'En vol': '#F59E0B', 'Clôturé': '#374151', 'Annulé': '#EF4444', 'Maintenance': '#D97706' };
function xFlightStatus(f) {
  if (xNonFlight(f)) return 'Maintenance';
  const s = XD.flightStatus[f.id];
  if (s === 'Annulé') return s;
  if (f.departure_time && f.arrival_time) {
    const now = Date.now();
    if (now >= xT(f.departure_time) && now <= xT(f.arrival_time)) return 'En vol';
    if (now > xT(f.arrival_time) && (!s || ['Réservé', 'Confirmé', 'FRAT validé'].includes(s))) return 'Clôturé';
  }
  if (s) return s;
  if (f.status === 'RELEASED') return 'FRAT validé';
  return 'Réservé';
}
function xConflicts(acId, s, e, ignoreFlights, ignoreTrip) {
  const out = []; if (!acId || !s || !e) return out;
  const a = xT(s), b = xT(e), ig = [].concat(ignoreFlights || []);
  if (!(b > a)) return out;
  S.flights.forEach(f => {
    if (ig.includes(f.id) || f.aircraft_id !== acId || !f.departure_time || !f.arrival_time || xCancelled(f)) return;
    if (a < xT(f.arrival_time) && xT(f.departure_time) < b) out.push(`Chevauche ${f.departure || '?'}→${f.arrival || '?'} (${xHM(f.departure_time)}–${xHM(f.arrival_time)} UTC, ${f.departure_time.slice(0, 10)})`);
  });
  XD.trips.forEach(t => {
    if (t.id === ignoreTrip || t.published || t.status === 'Annulé' || t.aircraft_id !== acId) return;
    t.legs.forEach(l => { if (l.dt && l.at && a < xT(l.at) && xT(l.dt) < b) out.push(`Chevauche une demande non publiée (${l.dep}→${l.arr}, ${l.dt.slice(0, 10)} ${l.dt.slice(11, 16)}–${l.at.slice(11, 16)})`); });
  });
  XD.insp.forEach(i => {
    if (i.aircraft_id !== acId || !i.lock_start) return;
    const ls = xT(i.lock_start + 'T00:00'), le = xT((i.lock_end || i.lock_start) + 'T23:59');
    if (a < le && ls < b) out.push(`Plage verrouillée : inspection « ${i.label} » (${i.lock_start} → ${i.lock_end || i.lock_start})`);
  });
  return out;
}
const _xSaveVol = saveVol;
saveVol = async function (id) {
  const c = xConflicts(val('f-ac'), val('f-dt'), val('f-at'), id);
  if (c.length && !confirm('⚠️ CONFLIT DE PLANNING\n\n' + c.join('\n') + '\n\nEnregistrer quand même ?')) return;
  return _xSaveVol(id);
};
const _xSaveTL = saveTLAcEvent;
saveTLAcEvent = async function (type, acId, dateStr) {
  const c = xConflicts(acId, document.getElementById('tl-start')?.value, document.getElementById('tl-end')?.value);
  if (c.length && !confirm('⚠️ CONFLIT DE PLANNING\n\n' + c.join('\n') + '\n\nEnregistrer quand même ?')) return;
  return _xSaveTL(type, acId, dateStr);
};
const _xSaveTLP = saveTLPilotVol;
saveTLPilotVol = async function (pilotId, dateStr) {
  const c = xConflicts(document.getElementById('tl-ac')?.value, document.getElementById('tl-start')?.value, document.getElementById('tl-end')?.value);
  if (c.length && !confirm('⚠️ CONFLIT DE PLANNING\n\n' + c.join('\n') + '\n\nEnregistrer quand même ?')) return;
  return _xSaveTLP(pilotId, dateStr);
};
const _xTL = renderPlanningTimeline;
renderPlanningTimeline = function () { _xTL(); try { xDecorateTL(); } catch (e) { console.warn(e); } };
function xDecorateTL() {
  const dateStr = S.planDate.length === 10 ? S.planDate : todayStr();
  const lg = document.querySelector('.tl-legend');
  if (lg) lg.innerHTML = Object.entries(XST).map(([k, c]) => `<div class="tl-legend-item"><div class="tl-legend-dot" style="background:${c}"></div>${k}</div>`).join('') +
    '<div class="tl-legend-item"><div class="tl-legend-dot" style="background:#7C3AED"></div>Simulateur</div><div class="tl-legend-item"><div class="tl-legend-dot" style="background:#fff;border:2px solid #EF4444"></div>Conflit</div>';
  const dayF = S.flights.filter(f => f.departure_time?.startsWith(dateStr) && f.arrival_time);
  const conflict = new Set();
  dayF.forEach(a => dayF.forEach(b => { if (a.id !== b.id && a.aircraft_id && a.aircraft_id === b.aircraft_id && !xCancelled(a) && !xCancelled(b) && xT(a.departure_time) < xT(b.arrival_time) && xT(b.departure_time) < xT(a.arrival_time)) { conflict.add(a.id); conflict.add(b.id); } }));
  document.querySelectorAll('.tl-block[onclick*="openEditVol"]').forEach(el => {
    const m = (el.getAttribute('onclick') || '').match(/openEditVol\('([^']+)'\)/); if (!m) return;
    const f = S.flights.find(x => x.id === m[1]); if (!f) return;
    const st = xFlightStatus(f); el.style.background = XST[st] || el.style.background; el.title = st;
    if (conflict.has(f.id)) { el.style.outline = '3px solid #EF4444'; el.style.outlineOffset = '1px'; el.title += ' — ⚠ CONFLIT'; }
    if (XD.subcharter[f.id]) el.style.display = 'none';
  });
  // Lignes de verrouillage maintenance (inspections planifiées)
  const grid = document.querySelector('.tl-grid'); if (!grid) return;
  const pct = iso => Math.max(0, Math.min(100, ((new Date(iso).getUTCHours() + new Date(iso).getUTCMinutes() / 60) - 4) / 20 * 100));
  const lines = []; for (let h = 4; h <= 24; h++) lines.push(`<div class="tl-bg-hour" style="left:${(h - 4) / 20 * 100}%"></div>`);
  const sub = dayF.filter(f => XD.subcharter[f.id]);
  const blocks = sub.map(f => { const l = pct(f.departure_time + (f.departure_time.endsWith('Z') ? '' : '')), r = pct(f.arrival_time); return `<div class="tl-block" style="left:${l}%;width:${Math.max(r - l, .5)}%;background:${XST[xFlightStatus(f)]}" onclick="event.stopPropagation();openEditVol('${f.id}')"><div class="tl-block-label">${esc(f.departure || '?')}→${esc(f.arrival || '?')}</div></div>`; }).join('');
  grid.insertAdjacentHTML('beforeend', `<div style="height:16px"></div><div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Sub-charter</div>
    <div class="tl-row"><div class="tl-row-label tl-res-col"><div class="tl-row-name">Sub-charter</div><div class="tl-row-sub">Sur-réservation / panne</div></div><div class="tl-track">${lines.join('')}${blocks || '<div class="tl-empty-track">Aucun vol sub-charter</div>'}</div></div>`);
}

/* ═══════════════════════════════════════════
   2. COPROPRIÉTAIRES & CONTRATS FRACTIONNÉS
═══════════════════════════════════════════ */
function xTripHours(t) { return t.legs.reduce((s, l) => s + (l.dt && l.at ? xH(l.dt, l.at) : 0), 0); }
function xCoHours(c) {
  const y0 = parseInt(c.start_year) || new Date().getFullYear(), n = parseInt(c.years) || 5, allow = xN(c.annual_hours);
  const rows = []; for (let i = 0; i < n; i++) rows.push({ year: y0 + i, allow, used: 0, planned: 0, borrowed: 0, over: 0 });
  XD.trips.filter(t => t.coprop_id === c.id && t.status !== 'Annulé').forEach(t => t.legs.forEach(l => {
    if (!l.dt || !l.at) return; const r = rows.find(r => r.year === parseInt(l.dt.slice(0, 4))); if (!r) return;
    const h = xH(l.dt, l.at); if (t.status === 'Clôturé') r.used += h; else r.planned += h;
  }));
  const free = rows.map(r => Math.max(0, r.allow - r.used));
  rows.forEach((r, i) => { let ex = Math.max(0, r.used - r.allow); for (let j = i + 1; j < rows.length && ex > 0; j++) { const tk = Math.min(ex, free[j]); free[j] -= tk; ex -= tk; r.borrowed += tk; } r.over = ex; });
  const total = allow * n, used = rows.reduce((s, r) => s + r.used, 0), planned = rows.reduce((s, r) => s + r.planned, 0);
  return { rows, total, used, planned, balance: total - used, over: rows.reduce((s, r) => s + r.over, 0) };
}
function xRenderCoprop() {
  const tab = XS.co; let body = xTabs(tab, [['reg', 'Registre'], ['peak', 'Jours de pointe']], 'co');
  if (tab === 'peak') {
    const l = [...XD.peak].sort((a, b) => a.date.localeCompare(b.date));
    body += l.length === 0 ? '<div class="empty">Aucun jour de pointe / blackout défini</div>' : l.map(p => `<div class="alert-li amber"><div><strong>${fmtDate(p.date)}</strong> <span style="color:var(--t2);font-size:13px">— ${esc(p.label || 'Jour de pointe')}</span></div><button class="btn-d" onclick="xDelPeak('${p.id}')">Supprimer</button></div>`).join('');
  } else {
    body += XD.coprops.length === 0 ? '<div class="empty">Aucun copropriétaire</div>' : XD.coprops.map(c => {
      const h = xCoHours(c), pct = h.total ? (h.used + h.planned) / h.total * 100 : 0;
      return `<div class="crew-card"><div class="crew-h"><div>
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:20px;color:var(--navy)">${esc(c.name)}</div>
        <div style="font-size:13px;color:var(--t2);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${xBadge('Fraction ' + esc(c.fraction), 'var(--navy-pale)', 'var(--navy)')}<span>${esc(c.annual_hours)} h/an · ${esc(c.years)} ans dès ${esc(c.start_year)}</span>${c.assistant_email ? `<span>${esc(c.assistant_email)}</span>` : ''}${c.notice_hours ? `<span>Préavis garanti ${esc(c.notice_hours)} h</span>` : ''}</div>
        ${c.persons ? `<div style="font-size:12px;color:var(--t2);margin-top:6px"><strong>Autorisés :</strong> ${esc(c.persons).replace(/\n/g, ', ')}</div>` : ''}${c.cost_centers ? `<div style="font-size:12px;color:var(--t2)"><strong>Centres de coûts :</strong> ${esc(c.cost_centers).replace(/\n/g, ', ')}</div>` : ''}</div>
        <div class="li-actions"><button class="btn-g btn-sm" onclick="xOpenCo('${c.id}')">Modifier</button><button class="btn-d" onclick="xDelCo('${c.id}')">Supprimer</button></div></div>
        <div class="stats" style="margin-bottom:12px"><div class="stat"><div class="stat-v" style="color:var(--navy)">${xF(h.total)}</div><div class="stat-l">h contractuelles</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--navy)">${xF(h.used)}</div><div class="stat-l">h consommées</div></div>
        <div class="stat"><div class="stat-v" style="color:var(--amber)">${xF(h.planned)}</div><div class="stat-l">h planifiées</div></div>
        <div class="stat"><div class="stat-v" style="color:${h.balance < 0 ? 'var(--red)' : 'var(--green)'}">${xF(h.balance)}</div><div class="stat-l">solde disponible</div></div></div>
        ${xBar(pct, pct > 100 ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)')}
        ${h.over > 0 ? `<div class="alert-li red" style="margin-top:10px"><strong style="font-size:13px">Dépassement global : ${xF(h.over)} h → tarif majoré ×${XD.cfg.overageMult} appliqué</strong></div>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px"><tr style="color:var(--t2);text-align:left"><th>Année</th><th>Contrat</th><th>Consommé</th><th>Planifié</th><th>Emprunté (années suiv.)</th><th>Hors contrat</th></tr>
        ${h.rows.map(r => `<tr style="border-top:1px solid var(--border)"><td>${r.year}</td><td>${xF(r.allow)}</td><td>${xF(r.used)}</td><td>${xF(r.planned)}</td><td style="color:${r.borrowed > 0 ? 'var(--amber)' : 'inherit'}">${xF(r.borrowed)}</td><td style="color:${r.over > 0 ? 'var(--red)' : 'inherit'}">${xF(r.over)}</td></tr>`).join('')}</table></div>`;
    }).join('');
  }
  xPage('Copropriétaires', 'Contrats fractionnés — portefeuille d\'heures sur 5 ans', tab === 'peak' ? '<button class="btn" onclick="xOpenPeak()">+ Jour de pointe</button>' : '<button class="btn" onclick="xOpenCo()">+ Copropriétaire</button>', body);
}
function xOpenCo(id) {
  const c = XD.coprops.find(x => x.id === id) || { fraction: '1/8', annual_hours: 100, start_year: new Date().getFullYear(), years: 5, notice_hours: 4 };
  openModal(id ? 'Modifier le copropriétaire' : 'Nouveau copropriétaire', `
    ${xi('co-name', 'Société / personne *', c.name || '')}
    <div class="g2">${xs('co-frac', 'Fraction détenue', ['1/8', '1/4', '1/2', 'Autre'], c.fraction, 'onchange="xCoFrac()"')}${xi('co-hours', 'Heures / an', c.annual_hours, 'number')}</div>
    <div class="g2">${xi('co-start', 'Début contrat (année)', c.start_year, 'number')}${xi('co-years', 'Durée (ans)', c.years, 'number')}</div>
    ${xta('co-persons', 'Personnes autorisées à commander un vol (1 par ligne)', c.persons || '')}
    ${xta('co-cc', 'Centres de coûts (1 par ligne)', c.cost_centers || '')}
    <div class="g2">${xi('co-mail', 'E-mail assistant(e)', c.assistant_email || '', 'email')}${xi('co-notice', 'Préavis garanti (h)', c.notice_hours, 'number')}</div>
    <div class="g2">${xi('co-fee', 'Frais de gestion mensuels (€)', c.monthly_fee || '', 'number', 'step="any"')}${xi('co-rate', 'Tarif horaire (€/h)', c.hourly_rate || '', 'number', 'step="any"')}</div>
    ${xta('co-prefs', 'Préférences CRM (catering, exigences, transports sol)', c.prefs || '')}
    <div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveCo('${id || ''}')">Enregistrer</button></div>`);
}
function xCoFrac() { const m = { '1/8': 100, '1/4': 200, '1/2': 400 }[xv('co-frac')]; if (m) document.getElementById('co-hours').value = m; }
function xSaveCo(id) {
  const d = { name: xv('co-name'), fraction: xv('co-frac'), annual_hours: xN(xv('co-hours')), start_year: parseInt(xv('co-start')) || new Date().getFullYear(), years: parseInt(xv('co-years')) || 5, persons: xv('co-persons'), cost_centers: xv('co-cc'), assistant_email: xv('co-mail'), notice_hours: xN(xv('co-notice')), monthly_fee: xN(xv('co-fee')), hourly_rate: xN(xv('co-rate')), prefs: xv('co-prefs') };
  if (!d.name) return alert('Nom requis');
  if (id) XD.coprops = XD.coprops.map(c => c.id === id ? { ...c, ...d } : c); else XD.coprops.push({ id: xid(), ...d });
  xSave(); closeModal(); renderPage();
}
function xDelCo(id) { if (!confirm('Supprimer ce copropriétaire ?')) return; XD.coprops = XD.coprops.filter(c => c.id !== id); xSave(); renderPage(); }
function xOpenPeak() { openModal('Jour de pointe / blackout', `${xi('pk-date', 'Date', '', 'date')}${xi('pk-label', 'Libellé', '', 'text', 'placeholder="Vacances de Noël, Grand Prix…"')}<div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSavePeak()">Enregistrer</button></div>`); }
function xSavePeak() { const d = xv('pk-date'); if (!d) return alert('Date requise'); XD.peak.push({ id: xid(), date: d, label: xv('pk-label') }); xSave(); closeModal(); renderPage(); }
function xDelPeak(id) { XD.peak = XD.peak.filter(p => p.id !== id); xSave(); renderPage(); }

/* ═══════════════════════════════════════════
   3. DISPATCH & SAISIE DE MISSION (TRIPS)
═══════════════════════════════════════════ */
const XTS = ['Réservé', 'Confirmé', 'FRAT validé', 'En vol', 'Clôturé', 'Annulé'];
let XDR = null;
const xNewLeg = () => ({ dep: '', arr: '', dt: '', at: '', adt: '', pax: '', fbo: '', fuel_order: '' });
function xCoName(id) { return XD.coprops.find(c => c.id === id)?.name || '—'; }
function xRoute(t) { return t.legs.map(l => l.dep).concat(t.legs.length ? [t.legs[t.legs.length - 1].arr] : []).join(' → '); }
function xRenderDispatch() {
  const trips = [...XD.trips].sort((a, b) => String(b.legs[0]?.dt || '').localeCompare(String(a.legs[0]?.dt || '')));
  const body = trips.length === 0 ? '<div class="empty">Aucune mission — créez la première demande</div>' : trips.map(t => {
    const fr = xFratFor(t), pax = t.legs.reduce((s, l) => s + String(l.pax || '').split('\n').filter(Boolean).length, 0);
    return `<div class="li" style="align-items:flex-start"><div style="min-width:0;flex:1">
      <div class="li-title">${esc(xRoute(t) || '—')}</div>
      <div class="li-sub">${esc(xCoName(t.coprop_id))} · ${esc(t.requester || '')}${t.reason ? ' · ' + esc(t.reason) : ''}</div>
      <div style="font-size:12px;color:var(--t3);margin-top:3px">${esc(t.legs[0]?.dt ? t.legs[0].dt.replace('T', ' ') : '')} UTC · ${xF(xTripHours(t))} h · ${esc(aircraftName(t.aircraft_id))} · ${esc(pilotName(t.pilot_id))} · ${pax} PAX${t.subcharter ? ' · SUB-CHARTER' : ''}</div>
      <div class="row" style="margin-top:8px">${xBadge(fr ? 'FRAT ' + fr.level + ' · ' + fr.status : 'FRAT manquant', fr && ['AUTO', 'APPROUVÉ'].includes(fr.status) ? 'var(--green-p)' : 'var(--amber-p)', fr && ['AUTO', 'APPROUVÉ'].includes(fr.status) ? 'var(--green)' : 'var(--amber)')}${t.published ? xBadge('Au planning', 'var(--navy-pale)', 'var(--navy)') : ''}</div></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <select onchange="xTripStatus('${t.id}',this.value)" style="padding:5px 8px;border-radius:8px;border:1px solid var(--border);font-weight:600;color:#fff;background:${XST[t.status] || '#999'}">${XTS.map(s => `<option ${t.status === s ? 'selected' : ''} style="color:#000;background:#fff">${s}</option>`).join('')}</select>
        <div class="row" style="justify-content:flex-end"><button class="btn-g btn-sm" onclick="xOpenTrip('${t.id}')">Modifier</button><button class="btn-g btn-sm" onclick="xPublish('${t.id}')">${t.published ? 'Mettre à jour planning' : 'Publier au planning'}</button></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-sm" onclick="xTripPdf('${t.id}','sheet')">Trip sheet</button><button class="btn btn-sm" onclick="xTripPdf('${t.id}','confirm')">Confirmation</button><button class="btn-g btn-sm" onclick="xTripMail('${t.id}')">E-mail</button><button class="btn-d" onclick="xDelTrip('${t.id}')">✕</button></div></div></div>`;
  }).join('');
  xPage('Dispatch', 'Saisie de mission — itinéraire, manifeste, logistique, documents', '<button class="btn" onclick="xOpenTrip()">+ Nouvelle mission</button>', body);
}
function xOpenTrip(id) {
  const t = XD.trips.find(x => x.id === id);
  XDR = t ? JSON.parse(JSON.stringify(t)) : { id: '', coprop_id: '', requester: '', reason: '', aircraft_id: '', pilot_id: '', status: 'Réservé', cancel_reason: '', subcharter: false, legs: [xNewLeg()], prefs: '', hotel: '', transport: '', fuel_budget: '', fuel_actual: '', c_fuel: '', c_cat: '', c_tax: '', c_other: '' };
  xTripRender();
}
function xTripRender() {
  const t = XDR;
  openModal(t.id ? 'Modifier la mission' : 'Nouvelle mission', `
    ${secTitle('DEMANDE')}
    <div class="g2">${xs('tr-co', 'Copropriétaire *', [['', 'Choisir...'], ...XD.coprops.map(c => [c.id, c.name])], t.coprop_id, 'onchange="xTripCo()"')}${xi('tr-req', 'Demandeur *', t.requester)}</div>
    ${xi('tr-reason', 'Motif du déplacement', t.reason)}
    <div class="g2">${xs('tr-ac', 'Appareil', [['', '—'], ...S.aircraft.filter(a => a.type === 'aircraft').map(a => [a.id, a.name])], t.aircraft_id)}${xs('tr-pi', 'Pilote', [['', '—'], ...S.pilots.map(p => [p.id, p.first_name + ' ' + p.last_name])], t.pilot_id)}</div>
    <div class="g2">${xs('tr-st', 'Statut', XTS, t.status)}${xs('tr-cr', 'Si annulé : cause', ['', 'Technique', 'Météo', 'Client', 'Autre'], t.cancel_reason)}</div>
    <label style="display:flex;gap:6px;font-size:13px;margin-bottom:8px"><input type="checkbox" id="tr-sub" ${t.subcharter ? 'checked' : ''}> Vol en sub-charter (ligne dédiée du planning)</label>
    ${secTitle('ITINÉRAIRE PAR TRONÇONS (heures bloc UTC)')}
    ${t.legs.map((l, i) => `<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><strong>Tronçon ${i + 1}</strong>${t.legs.length > 1 ? `<button class="btn-d" onclick="xTripDelLeg(${i})">Retirer</button>` : ''}</div>
      <div class="g2">${xi(`tr-l${i}-dep`, 'Départ OACI/IATA', l.dep, 'text', 'style="text-transform:uppercase"')}${xi(`tr-l${i}-arr`, 'Arrivée OACI/IATA', l.arr, 'text', 'style="text-transform:uppercase"')}</div>
      <div class="g2">${xi(`tr-l${i}-dt`, 'Départ bloc prévu', l.dt, 'datetime-local')}${xi(`tr-l${i}-at`, 'Arrivée bloc prévue', l.at, 'datetime-local')}</div>
      ${xi(`tr-l${i}-adt`, 'Départ bloc réel (ponctualité)', l.adt, 'datetime-local')}
      ${xta(`tr-l${i}-pax`, 'Manifeste PAX (1 par ligne — préfixer * pour le passager principal)', l.pax)}
      <div class="g2">${xi(`tr-l${i}-fbo`, 'FBO / assistance escale', l.fbo)}${xi(`tr-l${i}-fuel`, 'Commande carburant', l.fuel_order)}</div></div>`).join('')}
    <button class="btn-g btn-sm" onclick="xTripAddLeg()">+ Tronçon</button>
    ${secTitle('PRÉFÉRENCES & LOGISTIQUE ÉQUIPAGE')}
    ${xta('tr-prefs', 'Préférences passagers (catering, exigences, transports sol)', t.prefs)}
    <div class="g2">${xi('tr-hotel', 'Hébergement équipage', t.hotel)}${xi('tr-trans', 'Transport équipage', t.transport)}</div>
    ${secTitle('CARBURANT & COÛTS RÉELS')}
    <div class="g2">${xi('tr-fb', 'Carburant budgété (L)', t.fuel_budget, 'number')}${xi('tr-fa', 'Carburant réel (L)', t.fuel_actual, 'number')}</div>
    <div class="g2">${xi('tr-cf', 'Carburant (€)', t.c_fuel, 'number', 'step="any"')}${xi('tr-cc', 'Catering (€)', t.c_cat, 'number', 'step="any"')}</div>
    <div class="g2">${xi('tr-ct', 'Taxes / redevances (€)', t.c_tax, 'number', 'step="any"')}${xi('tr-co2', 'Autres frais d\'escale (€)', t.c_other, 'number', 'step="any"')}</div>
    <div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xTripSave()">Enregistrer</button></div>`);
}
function xTripCap() {
  const t = XDR; if (!document.getElementById('tr-co')) return;
  Object.assign(t, { coprop_id: xv('tr-co'), requester: xv('tr-req'), reason: xv('tr-reason'), aircraft_id: xv('tr-ac'), pilot_id: xv('tr-pi'), status: xv('tr-st'), cancel_reason: xv('tr-cr'), subcharter: !!document.getElementById('tr-sub')?.checked, prefs: xv('tr-prefs'), hotel: xv('tr-hotel'), transport: xv('tr-trans'), fuel_budget: xv('tr-fb'), fuel_actual: xv('tr-fa'), c_fuel: xv('tr-cf'), c_cat: xv('tr-cc'), c_tax: xv('tr-ct'), c_other: xv('tr-co2') });
  t.legs = t.legs.map((l, i) => ({ dep: xv(`tr-l${i}-dep`).toUpperCase(), arr: xv(`tr-l${i}-arr`).toUpperCase(), dt: xv(`tr-l${i}-dt`), at: xv(`tr-l${i}-at`), adt: xv(`tr-l${i}-adt`), pax: xv(`tr-l${i}-pax`), fbo: xv(`tr-l${i}-fbo`), fuel_order: xv(`tr-l${i}-fuel`) }));
}
function xTripCo() { xTripCap(); const c = XD.coprops.find(c => c.id === XDR.coprop_id); if (c && !XDR.prefs) XDR.prefs = c.prefs || ''; xTripRender(); }
function xTripAddLeg() { xTripCap(); const last = XDR.legs[XDR.legs.length - 1]; const n = xNewLeg(); if (last) n.dep = last.arr; XDR.legs.push(n); xTripRender(); }
function xTripDelLeg(i) { xTripCap(); XDR.legs.splice(i, 1); xTripRender(); }
function xTripWarnings(t) {
  const w = [], co = XD.coprops.find(c => c.id === t.coprop_id), l0 = t.legs[0];
  if (co && l0 && l0.dt && !t.id && co.notice_hours) { const lead = (xT(l0.dt) - Date.now()) / 3600000; if (lead < co.notice_hours) w.push(`Préavis garanti (${co.notice_hours} h) : délai disponible ${xF(Math.max(0, lead))} h`); }
  t.legs.forEach(l => {
    const d = (l.dt || '').slice(0, 10), pk = XD.peak.find(p => p.date === d);
    if (pk) { const oth = XD.trips.filter(o => o.id !== t.id && o.status !== 'Annulé' && o.legs.some(x => (x.dt || '').startsWith(d))).map(o => xCoName(o.coprop_id)); w.push(`Jour de pointe ${d} (${pk.label || 'blackout'})${oth.length ? ' — autres demandes : ' + [...new Set(oth)].join(', ') + ' → attribution équitable à arbitrer' : ''}`); }
    if (!t.subcharter) xConflicts(t.aircraft_id, l.dt, l.at, t.flight_ids, t.id).forEach(c => w.push(c));
  });
  if (co) { const h = xCoHours(co), add = xTripHours(t) - (t.id ? xTripHours(XD.trips.find(x => x.id === t.id) || t) : 0); if (h.balance - h.planned - add < 0) w.push(`Solde d'heures insuffisant (${xF(h.balance - h.planned)} h restant) : emprunt sur années suivantes / tarif majoré`); }
  return w;
}
async function xTripSave() {
  xTripCap(); const t = XDR;
  if (!t.coprop_id || !t.requester) return alert('Copropriétaire et demandeur requis');
  if (t.legs.some(l => !l.dep || !l.arr || !l.dt || !l.at)) return alert('Chaque tronçon : départ, arrivée et heures bloc requis');
  if (t.legs.some(l => xT(l.at) <= xT(l.dt))) return alert('L\'arrivée doit être après le départ');
  if (t.status === 'Annulé' && !t.cancel_reason) return alert('Cause d\'annulation requise');
  const w = xTripWarnings(t); if (w.length && !confirm('⚠️ Points d\'attention :\n\n• ' + w.join('\n• ') + '\n\nEnregistrer quand même ?')) return;
  if (!t.id) { t.id = xid(); XD.trips.push(t); } else XD.trips = XD.trips.map(x => x.id === t.id ? t : x);
  (t.flight_ids || []).forEach(fid => { if (fid) { XD.flightStatus[fid] = t.status; if (t.subcharter) XD.subcharter[fid] = true; else delete XD.subcharter[fid]; } });
  xSave(); closeModal(); renderPage();
}
function xDelTrip(id) { if (!confirm('Supprimer cette mission ?')) return; XD.trips = XD.trips.filter(t => t.id !== id); xSave(); renderPage(); }
function xTripStatus(id, st) {
  const t = XD.trips.find(x => x.id === id); if (!t) return;
  const fr = xFratFor(t);
  if (['En vol', 'Clôturé'].includes(st) && fr && !['AUTO', 'APPROUVÉ'].includes(fr.status)) { alert('⛔ FRAT non validé (' + fr.status + ') — libération bloquée. Faire approuver le FRAT dans « Sécurité ».'); return renderPage(); }
  if (st === 'En vol' && !fr && !confirm('Aucun FRAT enregistré pour cette mission. Continuer ?')) return renderPage();
  t.status = st; (t.flight_ids || []).forEach(fid => { if (fid) XD.flightStatus[fid] = st; }); xSave(); renderPage();
}
async function xPublish(id) {
  const t = XD.trips.find(x => x.id === id); if (!t) return;
  if (!t.aircraft_id || !t.pilot_id) return alert('Appareil et pilote requis pour publier au planning');
  const w = t.subcharter ? [] : t.legs.flatMap(l => xConflicts(t.aircraft_id, l.dt, l.at, t.flight_ids, t.id));
  if (w.length && !confirm('⚠️ CONFLIT DE PLANNING\n\n' + w.join('\n') + '\n\nPublier quand même ?')) return;
  t.flight_ids = t.flight_ids || [];
  for (let i = 0; i < t.legs.length; i++) {
    const l = t.legs[i];
    const d = { aircraft_id: t.aircraft_id, pilot_id: t.pilot_id, flight_type: 'Voyage', departure: l.dep, arrival: l.arr, departure_time: l.dt.slice(0, 16) + ':00Z', arrival_time: l.at.slice(0, 16) + ':00Z', notes: 'Mission ' + xCoName(t.coprop_id) + ' — ' + (t.requester || '') };
    const fid = t.flight_ids[i];
    try {
      if (fid && !String(fid).startsWith('local-')) { const r = await db.patch('flights', fid, d); const u = first(r) || { ...S.flights.find(f => f.id === fid), ...d }; S.flights = S.flights.map(f => f.id === fid ? u : f); }
      else { const r = await db.post('flights', d); const n = first(r) || { ...d, id: 'local-' + Date.now() + i }; S.flights.unshift(n); t.flight_ids[i] = n.id; }
    } catch (e) { const n = { ...d, id: 'local-' + Date.now() + i }; S.flights.unshift(n); t.flight_ids[i] = n.id; }
  }
  t.published = true; if (t.status === 'Réservé') t.status = 'Confirmé';
  t.flight_ids.forEach(fid => { if (fid) { XD.flightStatus[fid] = t.status; if (t.subcharter) XD.subcharter[fid] = true; else delete XD.subcharter[fid]; } });
  xSave(); renderPage();
}
function xTripPdf(id, mode) {
  const t = XD.trips.find(x => x.id === id); if (!t) return;
  const isSheet = mode === 'sheet', co = XD.coprops.find(c => c.id === t.coprop_id);
  const o = xPDF(isSheet ? 'FEUILLE DE ROUTE (TRIP SHEET)' : 'CONFIRMATION DE VOL', new Date().toLocaleDateString('fr-FR'));
  o.sec('Mission'); o.row('Copropriétaire', xCoName(t.coprop_id)); o.row('Demandeur', t.requester); o.row('Motif', t.reason); o.row('Appareil', aircraftName(t.aircraft_id)); o.row('Heures bloc totales', xF(xTripHours(t)) + ' h');
  if (isSheet) { o.row('Pilote', pilotName(t.pilot_id)); }
  t.legs.forEach((l, i) => {
    o.sec(`Tronçon ${i + 1} : ${l.dep} > ${l.arr}`); o.row('Départ bloc (UTC)', (l.dt || '').replace('T', ' ')); o.row('Arrivée bloc (UTC)', (l.at || '').replace('T', ' '));
    if (isSheet) { o.row('FBO / escale', l.fbo); o.row('Carburant', l.fuel_order); }
    const px = String(l.pax || '').split('\n').filter(Boolean); o.txt(`Passagers (${px.length})`, px.map(p => p.startsWith('*') ? p.slice(1).trim() + '  (passager principal)' : p).join('\n'));
  });
  if (t.prefs) o.txt('Préférences / catering / transports', t.prefs);
  if (isSheet) { o.sec('Équipage — logistique'); o.row('Hébergement', t.hotel); o.row('Transport', t.transport); }
  o.doc.save(`${isSheet ? 'TripSheet' : 'Confirmation'}-${(t.legs[0]?.dt || '').slice(0, 10)}-${(t.legs[0]?.dep || '')}.pdf`);
}
function xTripMail(id) {
  const t = XD.trips.find(x => x.id === id), co = XD.coprops.find(c => c.id === t?.coprop_id); if (!t) return;
  const body = `Bonjour,\n\nConfirmation de votre vol (${xCoName(t.coprop_id)}) :\n\n` + t.legs.map((l, i) => `Tronçon ${i + 1} : ${l.dep} → ${l.arr}\n  Départ ${(l.dt || '').replace('T', ' ')} UTC — Arrivée ${(l.at || '').replace('T', ' ')} UTC\n  Passagers : ${String(l.pax || '').split('\n').filter(Boolean).map(p => p.replace(/^\*/, '')).join(', ') || '—'}`).join('\n') + `\n\nAppareil : ${aircraftName(t.aircraft_id)}\n\nCordialement,\nHOVE Aviation Executive`;
  window.location.href = `mailto:${co?.assistant_email || ''}?subject=${encodeURIComponent('Confirmation de vol ' + xRoute(t))}&body=${encodeURIComponent(body)}`;
}

/* ═══════════════════════════════════════════
   4. SÉCURITÉ — FRAT & REGISTRE SMS
═══════════════════════════════════════════ */
const XFRAT = [
  ['wx', 'Météo (départ / route / destination)', [[0, 'VMC, aucun phénomène'], [3, 'MVMC / vent traversier modéré'], [6, 'IMC, givrage possible, orages isolés'], [10, 'Proche minima / CB / givrage avéré']]],
  ['rwy', 'Longueur de piste / performances', [[0, 'Marge > 50 %'], [3, 'Marge 25–50 %'], [6, 'Marge < 25 % ou piste contaminée'], [10, 'Marge insuffisante']]],
  ['fat', 'Fatigue pilote (repos, durée de service)', [[0, 'Reposé'], [3, 'Légère fatigue'], [6, 'Fatigue marquée / journée longue'], [10, 'Inapte']]],
  ['night', 'Vol de nuit', [[0, 'Jour'], [3, 'Départ ou arrivée de nuit'], [6, 'Nuit complète']]],
  ['exp', 'Expérience type / terrain', [[0, 'Familier'], [3, 'Peu récent'], [6, 'Premier vol terrain / type récent']]],
  ['tech', 'État technique (squawks / MEL)', [[0, 'RAS'], [3, 'Report MEL mineur'], [6, 'Plusieurs reports']]],
  ['pres', 'Pression opérationnelle / passagers', [[0, 'Aucune'], [3, 'Modérée'], [6, 'Forte']]],
];
const xFratLevel = n => n <= XD.cfg.fratGreen ? 'VERT' : n <= XD.cfg.fratAmber ? 'ORANGE' : 'ROUGE';
const xFratCol = l => l === 'VERT' ? 'var(--green)' : l === 'ORANGE' ? 'var(--amber)' : 'var(--red)';
function xFratFor(t) { return [...XD.frats].reverse().find(f => f.trip_id === t.id) || null; }
function xFratBlock(dep, arr, date) {
  const f = [...XD.frats].reverse().find(f => f.dep === dep && f.arr === arr && f.date === date);
  if (!f) return 'none'; return ['AUTO', 'APPROUVÉ'].includes(f.status) ? 'ok' : 'blocked';
}
const _xRel = releaseToEFB;
releaseToEFB = async function () {
  const d = S.ofpData, b = xFratBlock(d.dep, d.arr, d.date || todayStr());
  if (b === 'blocked') return alert('⛔ RELEASE BLOQUÉ — FRAT en attente d\'approbation (ou refusé) pour ' + d.dep + '→' + d.arr + '.\nLe Chef Pilote / Directeur doit le signer dans « Sécurité ».');
  if (b === 'none' && !confirm('Aucun FRAT enregistré pour ' + d.dep + '→' + d.arr + ' à cette date. Releaser quand même ?')) return;
  return _xRel();
};
function xRenderFrat() {
  const tab = XS.fr; let body = xTabs(tab, [['frat', 'FRAT'], ['sms', 'Registre SMS / audits']], 'fr');
  if (tab === 'frat') {
    body += xCfgCard(['fratGreen', 'fratAmber']);
    const chiefs = S.pilots.filter(p => p.role === 'chief_pilot');
    body += XD.frats.length === 0 ? '<div class="empty">Aucun FRAT</div>' : [...XD.frats].reverse().map(f => {
      const pend = f.status === 'EN ATTENTE';
      return `<div class="alert-li ${f.level === 'VERT' ? 'navy' : f.level === 'ORANGE' ? 'amber' : 'red'}" style="align-items:flex-start"><div>
        <div style="font-weight:700;font-size:15px">${esc(f.dep)} → ${esc(f.arr)} <span style="font-weight:400;color:var(--t2);font-size:13px">· ${fmtDate(f.date)} · ${esc(pilotName(f.pilot_id))}</span></div>
        <div style="margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${xBadge('Score ' + f.total + ' — ' + f.level, 'var(--bg)', xFratCol(f.level))}${xBadge(f.status, ['AUTO', 'APPROUVÉ'].includes(f.status) ? 'var(--green-p)' : f.status === 'REFUSÉ' ? 'var(--red-p)' : 'var(--amber-p)', ['AUTO', 'APPROUVÉ'].includes(f.status) ? 'var(--green)' : f.status === 'REFUSÉ' ? 'var(--red)' : 'var(--amber)')}</div>
        ${f.signer ? `<div style="font-size:12px;color:var(--t2);margin-top:4px">Signé : ${esc(f.signer)} — ${new Date(f.signed_at).toLocaleString('fr-FR')}</div>` : ''}
        ${f.notes ? `<div style="font-size:12px;color:var(--t3);margin-top:2px">${esc(f.notes)}</div>` : ''}
        ${pend ? `<div class="row" style="margin-top:8px"><select id="sig-${f.id}" style="padding:6px;border-radius:8px;border:1px solid var(--border)">${chiefs.map(p => `<option>${esc(p.first_name + ' ' + p.last_name)} (Chef Pilote)</option>`).join('')}<option>Directeur de l'Aviation</option></select><button class="btn btn-sm" onclick="xFratDecide('${f.id}',true)">Approuver & signer</button><button class="btn-d" onclick="xFratDecide('${f.id}',false)">Refuser</button></div>` : ''}</div>
        <button class="btn-d" onclick="xDelFrat('${f.id}')">✕</button></div>`;
    }).join('');
  } else {
    body += XD.sms.length === 0 ? '<div class="empty">Aucun événement SMS</div>' : [...XD.sms].sort((a, b) => b.date.localeCompare(a.date)).map(e => `<div class="alert-li ${e.status === 'Clos' ? 'navy' : e.severity >= 3 ? 'red' : 'amber'}" style="align-items:flex-start"><div><div style="font-weight:600;font-size:14px">${esc(e.type)} · gravité ${e.severity} ${xBadge(e.status, e.status === 'Clos' ? 'var(--green-p)' : 'var(--amber-p)', e.status === 'Clos' ? 'var(--green)' : 'var(--amber)')}</div><div style="font-size:13px;margin-top:3px">${esc(e.desc)}</div>${e.action ? `<div style="font-size:12px;color:var(--t2);margin-top:3px"><strong>Action corrective :</strong> ${esc(e.action)}${e.owner ? ' — ' + esc(e.owner) : ''}</div>` : ''}<div style="font-size:12px;color:var(--t3);margin-top:3px">${fmtDate(e.date)}</div></div><div class="row"><button class="btn-g btn-sm" onclick="xToggleSms('${e.id}')">${e.status === 'Clos' ? 'Rouvrir' : 'Clore'}</button><button class="btn-d" onclick="xDelSms('${e.id}')">✕</button></div></div>`).join('');
  }
  xPage('Sécurité', 'Évaluation du risque (FRAT) et système de gestion de la sécurité (SMS)', tab === 'frat' ? '<button class="btn" onclick="xOpenFrat()">+ Nouveau FRAT</button>' : '<button class="btn" onclick="xOpenSms()">+ Événement</button>', body);
}
function xOpenFrat() {
  const trips = XD.trips.filter(t => !['Clôturé', 'Annulé'].includes(t.status));
  openModal('Nouveau FRAT', `
    ${xs('fr-trip', 'Mission liée (optionnel)', [['', '— Aucune —'], ...trips.map(t => [t.id, xRoute(t) + ' · ' + (t.legs[0]?.dt || '').slice(0, 10)])], '', 'onchange="xFratFill()"')}
    <div class="g2">${xi('fr-date', 'Date UTC', todayStr(), 'date')}${xs('fr-pi', 'Pilote *', [['', 'Choisir...'], ...S.pilots.map(p => [p.id, p.first_name + ' ' + p.last_name])], '')}</div>
    <div class="g2">${xi('fr-dep', 'Départ *', '', 'text', 'style="text-transform:uppercase"')}${xi('fr-arr', 'Arrivée *', '', 'text', 'style="text-transform:uppercase"')}</div>
    ${XFRAT.map(([k, l, o]) => xs('frk-' + k, l, o.map(([v, t]) => [v, `${t} (${v})`]), 0, 'onchange="xFratCalc()"')).join('')}
    <div id="fr-total" style="padding:12px;border-radius:10px;font-weight:700;margin-bottom:12px"></div>
    ${xta('fr-notes', 'Notes / mesures d\'atténuation')}
    <div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveFrat()">Enregistrer</button></div>`);
  xFratCalc();
}
function xFratFill() { const t = XD.trips.find(x => x.id === xv('fr-trip')); if (!t) return; const l = t.legs[0]; document.getElementById('fr-dep').value = l.dep; document.getElementById('fr-arr').value = t.legs[t.legs.length - 1].arr; document.getElementById('fr-date').value = (l.dt || '').slice(0, 10); if (t.pilot_id) document.getElementById('fr-pi').value = t.pilot_id; }
function xFratScore() { return XFRAT.reduce((s, [k]) => s + xN(xv('frk-' + k)), 0); }
function xFratCalc() {
  const n = xFratScore(), lv = xFratLevel(n), el = document.getElementById('fr-total'); if (!el) return;
  el.style.background = lv === 'VERT' ? 'var(--green-p)' : lv === 'ORANGE' ? 'var(--amber-p)' : 'var(--red-p)'; el.style.color = xFratCol(lv);
  el.textContent = `Score ${n} — ${lv} · ` + (lv === 'VERT' ? 'validation automatique du dispatch' : 'libération BLOQUÉE : signature Chef Pilote / Directeur requise');
}
function xSaveFrat() {
  const total = xFratScore(), level = xFratLevel(total), dep = xv('fr-dep').toUpperCase(), arr = xv('fr-arr').toUpperCase();
  if (!dep || !arr || !xv('fr-pi')) return alert('Pilote, départ et arrivée requis');
  const scores = {}; XFRAT.forEach(([k]) => scores[k] = xN(xv('frk-' + k)));
  const f = { id: xid(), trip_id: xv('fr-trip'), date: xv('fr-date'), pilot_id: xv('fr-pi'), dep, arr, scores, total, level, status: level === 'VERT' ? 'AUTO' : 'EN ATTENTE', notes: xv('fr-notes'), created: new Date().toISOString() };
  XD.frats.push(f); xFratSyncTrip(f); xSave(); closeModal(); renderPage();
}
function xFratSyncTrip(f) {
  const t = XD.trips.find(x => x.id === f.trip_id); if (!t) return;
  if (['AUTO', 'APPROUVÉ'].includes(f.status) && ['Réservé', 'Confirmé'].includes(t.status)) { t.status = 'FRAT validé'; (t.flight_ids || []).forEach(fid => { if (fid) XD.flightStatus[fid] = t.status; }); }
}
function xFratDecide(id, ok) {
  const f = XD.frats.find(x => x.id === id); if (!f) return;
  const signer = document.getElementById('sig-' + id)?.value || '';
  if (!confirm((ok ? 'Approuver' : 'Refuser') + ' ce FRAT (score ' + f.total + ') et signer en tant que « ' + signer + ' » ?')) return;
  f.status = ok ? 'APPROUVÉ' : 'REFUSÉ'; f.signer = signer; f.signed_at = new Date().toISOString(); xFratSyncTrip(f); xSave(); renderPage();
}
function xDelFrat(id) { if (!confirm('Supprimer ce FRAT ?')) return; XD.frats = XD.frats.filter(f => f.id !== id); xSave(); renderPage(); }
function xOpenSms() {
  openModal('Événement SMS', `<div class="g2">${xi('sm-date', 'Date', todayStr(), 'date')}${xs('sm-type', 'Type', ['Déclaration de risque', 'Incident léger', 'Audit', 'Action corrective'], '')}</div>
    ${xs('sm-sev', 'Gravité', [[1, '1 — Faible'], [2, '2 — Modérée'], [3, '3 — Élevée']], 1)}${xta('sm-desc', 'Description *')}${xta('sm-action', 'Action corrective')}${xi('sm-owner', 'Responsable')}
    <div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveSms()">Enregistrer</button></div>`);
}
function xSaveSms() { if (!xv('sm-desc')) return alert('Description requise'); XD.sms.push({ id: xid(), date: xv('sm-date'), type: xv('sm-type'), severity: parseInt(xv('sm-sev')), desc: xv('sm-desc'), action: xv('sm-action'), owner: xv('sm-owner'), status: 'Ouvert' }); xSave(); closeModal(); renderPage(); }
function xToggleSms(id) { const e = XD.sms.find(x => x.id === id); e.status = e.status === 'Clos' ? 'Ouvert' : 'Clos'; xSave(); renderPage(); }
function xDelSms(id) { if (!confirm('Supprimer ?')) return; XD.sms = XD.sms.filter(e => e.id !== id); xSave(); renderPage(); }

/* ═══════════════════════════════════════════
   5. TEMPS DE SERVICE & QUALIFICATIONS
═══════════════════════════════════════════ */
LIC_TYPES.push('CTRL_VOL', 'FORMATION');
licLabel = function (t) { return { MEP: 'MEP', SEP: 'SEP', IRME: 'IR/ME', CRM: 'CRM', CLASSE_1: 'Médical Classe 1', CTRL_VOL: 'Contrôle en vol', FORMATION: 'Formation obligatoire' }[t] || t; };
function xDutyStats(pid, month) {
  const fl = S.flights.filter(f => f.pilot_id === pid && f.departure_time && f.arrival_time && f.departure_time.startsWith(month) && !xNonFlight(f) && !xCancelled(f));
  const perDay = {}, active = new Set(); let simH = 0, standbyH = 0, dutyH = 0;
  fl.forEach(f => { const d = f.departure_time.slice(0, 10); perDay[d] = (perDay[d] || 0) + xH(f.departure_time, f.arrival_time); active.add(d); });
  S.sims.filter(s => s.handler_id === pid && (s.date || '').startsWith(month)).forEach(s => { simH += xHH(s.start_time, s.end_time); active.add(s.date); });
  XD.duty.filter(d => d.pilot_id === pid && d.date.startsWith(month)).forEach(d => { const h = xHH(d.start, d.end); if (d.kind === 'standby') { standbyH += h; active.add(d.date); } else if (d.kind === 'duty') { dutyH += h; active.add(d.date); } });
  const [Y, M] = month.split('-').map(Number), n = new Date(Y, M, 0).getDate();
  const maxDay = Math.max(0, ...Object.values(perDay)), flightH = Object.values(perDay).reduce((s, v) => s + v, 0);
  return { flightH, maxDay, standbyH, dutyH, simH, rest: n - active.size, days: n };
}
function xRenderDuty() {
  const m = XS.month, cfg = XD.cfg;
  const rows = S.pilots.map(p => {
    const s = xDutyStats(p.id, m), a = [];
    if (s.maxDay > cfg.dailyMax) a.push('Jour > ' + cfg.dailyMax + ' h'); if (s.flightH > cfg.monthlyMax) a.push('Mois > ' + cfg.monthlyMax + ' h'); if (s.rest < cfg.minRestDays) a.push('Repos < ' + cfg.minRestDays + ' j');
    return `<tr style="border-top:1px solid var(--border)"><td><strong>${esc(p.first_name + ' ' + p.last_name)}</strong></td><td>${xF(s.flightH)}</td><td style="color:${s.maxDay > cfg.dailyMax ? 'var(--red)' : 'inherit'}">${xF(s.maxDay)}</td><td>${xF(s.standbyH)}</td><td>${xF(s.dutyH + s.simH)}</td><td style="color:${s.rest < cfg.minRestDays ? 'var(--red)' : 'var(--green)'}">${s.rest}/${s.days}</td><td>${a.length ? xBadge(a.join(' · '), 'var(--red-p)', 'var(--red)') : xBadge('OK', 'var(--green-p)', 'var(--green)')}</td></tr>`;
  }).join('');
  const qTypes = ['CLASSE_1', 'SEP', 'MEP', 'IRME', 'CRM', 'CTRL_VOL', 'FORMATION'];
  const qual = S.pilots.map(p => `<tr style="border-top:1px solid var(--border)"><td><strong>${esc(p.first_name + ' ' + p.last_name)}</strong></td>${qTypes.map(t => { const l = S.licenses.find(x => x.pilot_id === p.id && x.type === t); if (!l) return '<td style="color:var(--t3)">—</td>'; const d = daysUntil(l.expiry_date); return `<td><span class="badge" style="background:${alertBg(d)};color:${alertColor(d)}">${fmtDate(l.expiry_date)}</span></td>`; }).join('')}</tr>`).join('');
  const entries = XD.duty.filter(d => d.date.startsWith(m)).sort((a, b) => a.date.localeCompare(b.date)).map(d => `<div class="alert-li navy"><div><strong>${fmtDate(d.date)}</strong> — ${esc(pilotName(d.pilot_id))} · ${{ standby: 'Astreinte hangar', duty: 'Service', rest: 'Repos' }[d.kind]}${d.kind !== 'rest' ? ` ${esc(d.start)}–${esc(d.end)}` : ''}${d.note ? ` <span style="color:var(--t3)">${esc(d.note)}</span>` : ''}</div><button class="btn-d" onclick="xDelDuty('${d.id}')">✕</button></div>`).join('');
  xPage('Temps de service', 'Heures de vol, astreintes, repos et qualifications', '<button class="btn" onclick="xOpenDuty()">+ Astreinte / service / repos</button>', `
    <div class="row" style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:var(--t2)">MOIS</label><input type="month" value="${m}" onchange="XS.month=this.value;renderPage()" style="padding:8px;border-radius:8px;border:1px solid var(--border)"></div>
    ${xCfgCard(['dailyMax', 'monthlyMax', 'minRestDays'])}
    <span class="sec-label">Heures et repos du mois</span><div class="card" style="overflow-x:auto;margin-bottom:24px"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px"><tr style="color:var(--t2);text-align:left"><th>Pilote</th><th>Vol (h)</th><th>Max/jour</th><th>Astreinte (h)</th><th>Service+sim (h)</th><th>Jours de repos</th><th>Conformité</th></tr>${rows || '<tr><td>Aucun pilote</td></tr>'}</table></div>
    <span class="sec-label">Qualifications (échéances)</span><div class="card" style="overflow-x:auto;margin-bottom:24px"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:700px"><tr style="color:var(--t2);text-align:left"><th>Pilote</th>${qTypes.map(t => `<th>${licLabel(t)}</th>`).join('')}</tr>${qual}</table><div style="font-size:12px;color:var(--t3);margin-top:8px">Saisie dans Crew → Licences (types Contrôle en vol / Formation obligatoire ajoutés).</div></div>
    <span class="sec-label">Astreintes & services saisis</span>${entries || '<div class="empty">Aucune saisie ce mois</div>'}`);
}
function xOpenDuty() {
  openModal('Astreinte / service / repos', `${xs('du-pi', 'Pilote *', S.pilots.map(p => [p.id, p.first_name + ' ' + p.last_name]), '')}<div class="g2">${xi('du-date', 'Date', todayStr(), 'date')}${xs('du-kind', 'Type', [['standby', 'Astreinte hangar (compte comme service)'], ['duty', 'Service'], ['rest', 'Repos']], 'standby')}</div><div class="g2">${xi('du-s', 'Début', '08:00', 'time')}${xi('du-e', 'Fin', '18:00', 'time')}</div>${xi('du-note', 'Note')}<div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveDuty()">Enregistrer</button></div>`);
}
function xSaveDuty() { if (!xv('du-pi')) return alert('Pilote requis'); XD.duty.push({ id: xid(), pilot_id: xv('du-pi'), date: xv('du-date'), kind: xv('du-kind'), start: xv('du-s'), end: xv('du-e'), note: xv('du-note') }); xSave(); closeModal(); renderPage(); }
function xDelDuty(id) { XD.duty = XD.duty.filter(d => d.id !== id); xSave(); renderPage(); }

/* ═══════════════════════════════════════════
   6. MAINTENANCE & NAVIGABILITÉ
═══════════════════════════════════════════ */
function xAcCurrent(ac) {
  const b = XD.counters[ac.id] || { hours: 0, cycles: 0, asOf: '1970-01-01' }, now = Date.now();
  const done = S.flights.filter(f => f.aircraft_id === ac.id && f.departure_time && f.arrival_time && xT(f.arrival_time) < now && !xNonFlight(f) && !xCancelled(f));
  const since = done.filter(f => f.departure_time.slice(0, 10) > b.asOf);
  const hours = xN(b.hours) + since.reduce((s, f) => s + xH(f.departure_time, f.arrival_time), 0);
  const l90 = done.filter(f => now - xT(f.departure_time) < 90 * 864e5).reduce((s, f) => s + xH(f.departure_time, f.arrival_time), 0);
  return { hours, cycles: xN(b.cycles) + since.length, avg: l90 / 90, base: b };
}
function xInspProj(i) {
  const ac = S.aircraft.find(a => a.id === i.aircraft_id); if (!ac) return { lvl: 'green' };
  const cur = xAcCurrent(ac); let remH = null, remD = null, est = null;
  if (i.due_hours !== '' && i.due_hours != null) remH = xN(i.due_hours) - cur.hours;
  if (i.due_date) remD = Math.ceil((new Date(i.due_date) - new Date()) / 864e5);
  let eff = remD; if (remH != null && cur.avg > 0) { est = new Date(Date.now() + Math.max(0, remH) / cur.avg * 864e5); const dd = Math.ceil((est - new Date()) / 864e5); eff = remD == null ? dd : Math.min(remD, dd); }
  const lvl = (remH != null && remH < 0) || (remD != null && remD < 0) ? 'red' : (eff != null && eff < 30) || (remH != null && remH < 10) ? 'amber' : 'green';
  return { remH, remD, est, lvl };
}
function xAirworthy(ac) {
  const sq = XD.squawks.filter(s => s.aircraft_id === ac.id && s.status !== 'Clos'), bad = [], deferred = [];
  sq.forEach(s => { if (s.status === 'Ouvert') bad.push(s); else if (s.deferral_expiry && new Date(s.deferral_expiry) < new Date()) bad.push(s); else deferred.push(s); });
  const overdue = XD.insp.filter(i => i.aircraft_id === ac.id && xInspProj(i).lvl === 'red');
  return { ok: bad.length === 0 && overdue.length === 0, bad, deferred, overdue };
}
function xRenderMaint() {
  const tab = XS.mt, planes = S.aircraft.filter(a => a.type === 'aircraft');
  let body = xTabs(tab, [['cnt', 'Compteurs'], ['insp', 'Inspections'], ['sq', 'Anomalies / MEL']], 'mt');
  const banners = planes.map(ac => { const a = xAirworthy(ac); return `<div class="alert-li ${a.ok ? 'navy' : 'red'}"><div><strong>${esc(ac.name)}</strong> ${esc(ac.registration || '')} — ${a.ok ? (a.deferred.length ? 'Apte au vol avec ' + a.deferred.length + ' report(s) MEL' : 'Apte au vol') : '<span style="color:var(--red)">NO-GO : ' + (a.bad.length ? a.bad.length + ' anomalie(s) non reportée(s)/MEL expirée' : '') + (a.overdue.length ? ' ' + a.overdue.length + ' inspection(s) échue(s)' : '') + '</span>'}</div></div>`; }).join('');
  body += banners;
  if (tab === 'cnt') {
    body += '<div style="height:12px"></div>' + (planes.length === 0 ? '<div class="empty">Aucun avion</div>' : planes.map(ac => { const c = xAcCurrent(ac); return `<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><div class="li-title">${esc(ac.name)} <span style="font-weight:400;font-size:13px;color:var(--t2)">${esc(ac.registration || '')}</span></div><div class="li-sub">Base saisie : ${xF(c.base.hours)} h / ${c.base.cycles} cycles au ${c.base.asOf === '1970-01-01' ? '—' : fmtDate(c.base.asOf)} · vols suivants ajoutés automatiquement</div></div><button class="btn-g btn-sm" onclick="xOpenCnt('${ac.id}')">Définir la base</button></div>
      <div class="stats" style="margin:12px 0 0"><div class="stat"><div class="stat-v" style="color:var(--navy)">${xF(c.hours)}</div><div class="stat-l">heures cellule</div></div><div class="stat"><div class="stat-v" style="color:var(--navy)">${c.cycles}</div><div class="stat-l">cycles</div></div><div class="stat"><div class="stat-v" style="color:var(--navy)">${xF(c.avg * 30)}</div><div class="stat-l">h / mois (moy. 90 j)</div></div></div></div>`; }).join(''));
  } else if (tab === 'insp') {
    body += '<div style="height:12px"></div>' + (XD.insp.length === 0 ? '<div class="empty">Aucune inspection suivie</div>' : [...XD.insp].sort((a, b) => ({ red: 0, amber: 1, green: 2 })[xInspProj(a).lvl] - ({ red: 0, amber: 1, green: 2 })[xInspProj(b).lvl]).map(i => { const p = xInspProj(i), col = { red: 'var(--red)', amber: 'var(--amber)', green: 'var(--green)' }[p.lvl]; return `<div class="alert-li ${p.lvl === 'red' ? 'red' : p.lvl === 'amber' ? 'amber' : 'navy'}"><div><div style="font-weight:600">${esc(i.label)} <span style="font-weight:400;font-size:12px;color:var(--t2)">· ${esc(i.kind)} · ${esc(aircraftName(i.aircraft_id))}</span></div><div style="font-size:12px;color:var(--t2);margin-top:3px">${i.due_date ? 'Échéance ' + fmtDate(i.due_date) + (p.remD != null ? ' (J' + (p.remD >= 0 ? '-' : '+') + Math.abs(p.remD) + ')' : '') : ''}${i.due_hours !== '' && i.due_hours != null ? ' · À ' + esc(i.due_hours) + ' h (reste ' + xF(p.remH) + ' h)' : ''}${p.est ? ' · projection ~' + fmtDate(p.est) : ''}${i.lock_start ? ' · 🔒 planning verrouillé ' + fmtDate(i.lock_start) + '→' + fmtDate(i.lock_end || i.lock_start) : ''}</div></div><div class="row"><span style="color:${col};font-weight:700;font-size:12px">${p.lvl === 'red' ? 'ÉCHUE' : p.lvl === 'amber' ? 'PROCHE' : 'OK'}</span><button class="btn-g btn-sm" onclick="xOpenInsp('${i.id}')">Modifier</button><button class="btn-d" onclick="xDelInsp('${i.id}')">✕</button></div></div>`; }).join(''));
  } else {
    body += '<div style="height:12px"></div>' + (XD.squawks.length === 0 ? '<div class="empty">Aucune anomalie</div>' : [...XD.squawks].sort((a, b) => b.date.localeCompare(a.date)).map(s => `<div class="alert-li ${s.status === 'Ouvert' ? 'red' : s.status === 'Clos' ? 'navy' : 'amber'}" style="align-items:flex-start"><div><div style="font-weight:600;font-size:14px">${esc(aircraftName(s.aircraft_id))} · cat. ${esc(s.category)} ${xBadge(s.status, 'var(--bg)', s.status === 'Ouvert' ? 'var(--red)' : s.status === 'Clos' ? 'var(--green)' : 'var(--amber)')}</div><div style="font-size:13px;margin-top:3px">${esc(s.desc)}</div><div style="font-size:12px;color:var(--t3);margin-top:3px">${fmtDate(s.date)} · ${esc(s.reporter || '')}${s.mel_ref ? ' · MEL ' + esc(s.mel_ref) : ''}${s.deferral_expiry ? ' · report jusqu\'au ' + fmtDate(s.deferral_expiry) : ''}</div></div><div class="row"><button class="btn-g btn-sm" onclick="xOpenSq('${s.id}')">Modifier</button><button class="btn-d" onclick="xDelSq('${s.id}')">✕</button></div></div>`).join(''));
  }
  const act = tab === 'insp' ? '<button class="btn" onclick="xOpenInsp()">+ Inspection</button>' : tab === 'sq' ? '<button class="btn" onclick="xOpenSq()">+ Anomalie</button>' : '';
  xPage('Maintenance', 'Compteurs, échéances de navigabilité, anomalies et MEL', act, body);
}
function xOpenCnt(acId) { const b = XD.counters[acId] || { hours: '', cycles: '', asOf: todayStr() }; openModal('Compteurs de référence', `${xi('cn-h', 'Heures cellule', b.hours, 'number', 'step="any"')}${xi('cn-c', 'Cycles', b.cycles, 'number')}${xi('cn-d', 'Valeurs relevées au (les vols après cette date s\'ajoutent)', b.asOf, 'date')}<div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveCnt('${acId}')">Enregistrer</button></div>`); }
function xSaveCnt(acId) { XD.counters[acId] = { hours: xN(xv('cn-h')), cycles: parseInt(xv('cn-c')) || 0, asOf: xv('cn-d') || todayStr() }; xSave(); closeModal(); renderPage(); }
const xPlanes = () => S.aircraft.filter(a => a.type === 'aircraft').map(a => [a.id, a.name]);
function xOpenInsp(id) {
  const i = XD.insp.find(x => x.id === id) || { kind: 'Calendaire', due_hours: '' };
  openModal(id ? 'Modifier l\'inspection' : 'Nouvelle inspection', `${xs('in-ac', 'Appareil', xPlanes(), i.aircraft_id)}${xi('in-label', 'Intitulé *', i.label || '', 'text', 'placeholder="Visite 100 h, AD 2024-xx, révision moteur…"')}${xs('in-kind', 'Nature', ['Calendaire', 'Horaire', 'Visite phase', 'Consigne de navigabilité (AD)', 'Potentiel moteur'], i.kind)}<div class="g2">${xi('in-date', 'Échéance (date)', i.due_date || '', 'date')}${xi('in-hours', 'Échéance (heures cellule)', i.due_hours, 'number', 'step="any"')}</div><div class="g2">${xi('in-ls', 'Verrou planning — début', i.lock_start || '', 'date')}${xi('in-le', 'Verrou planning — fin', i.lock_end || '', 'date')}</div><div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveInsp('${id || ''}')">Enregistrer</button></div>`);
}
function xSaveInsp(id) { const d = { aircraft_id: xv('in-ac'), label: xv('in-label'), kind: xv('in-kind'), due_date: xv('in-date'), due_hours: xv('in-hours'), lock_start: xv('in-ls'), lock_end: xv('in-le') }; if (!d.label || !d.aircraft_id) return alert('Appareil et intitulé requis'); if (id) XD.insp = XD.insp.map(i => i.id === id ? { ...i, ...d } : i); else XD.insp.push({ id: xid(), ...d }); xSave(); closeModal(); renderPage(); }
function xDelInsp(id) { if (!confirm('Supprimer ?')) return; XD.insp = XD.insp.filter(i => i.id !== id); xSave(); renderPage(); }
function xOpenSq(id) {
  const s = XD.squawks.find(x => x.id === id) || { date: todayStr(), category: 'C', status: 'Ouvert' };
  openModal(id ? 'Modifier l\'anomalie' : 'Nouvelle anomalie', `${xs('sq-ac', 'Appareil', xPlanes(), s.aircraft_id)}<div class="g2">${xi('sq-date', 'Date', s.date, 'date')}${xi('sq-rep', 'Signalée par', s.reporter || '')}</div>${xta('sq-desc', 'Description *', s.desc || '')}<div class="g2">${xs('sq-cat', 'Catégorie MEL', ['A', 'B', 'C', 'D'], s.category)}${xs('sq-st', 'Statut', ['Ouvert', 'Différé (MEL)', 'Clos'], s.status)}</div><div class="g2">${xi('sq-mel', 'Réf. MEL', s.mel_ref || '')}${xi('sq-exp', 'Report valable jusqu\'au', s.deferral_expiry || '', 'date')}</div><div class="m-foot"><button class="btn-g" onclick="closeModal()">Annuler</button><button class="btn" onclick="xSaveSq('${id || ''}')">Enregistrer</button></div>`);
}
function xSaveSq(id) { const d = { aircraft_id: xv('sq-ac'), date: xv('sq-date'), reporter: xv('sq-rep'), desc: xv('sq-desc'), category: xv('sq-cat'), status: xv('sq-st'), mel_ref: xv('sq-mel'), deferral_expiry: xv('sq-exp') }; if (!d.desc || !d.aircraft_id) return alert('Appareil et description requis'); if (id) XD.squawks = XD.squawks.map(s => s.id === id ? { ...s, ...d } : s); else XD.squawks.push({ id: xid(), ...d }); xSave(); closeModal(); renderPage(); }
function xDelSq(id) { if (!confirm('Supprimer ?')) return; XD.squawks = XD.squawks.filter(s => s.id !== id); xSave(); renderPage(); }

/* ═══════════════════════════════════════════
   7. FACTURATION & RAPPORTS DE GESTION
═══════════════════════════════════════════ */
function xMonthTrips(c, m) { return XD.trips.filter(t => (!c || t.coprop_id === c.id) && t.status === 'Clôturé' && String(t.legs[0]?.dt || '').startsWith(m)); }
const xCosts = t => xN(t.c_fuel) + xN(t.c_cat) + xN(t.c_tax) + xN(t.c_other);
function xInvoice(c, m) {
  const trips = xMonthTrips(c, m), hours = trips.reduce((s, t) => s + xTripHours(t), 0), ground = trips.reduce((s, t) => s + xCosts(t), 0);
  const row = xCoHours(c).rows.find(r => r.year === parseInt(m.slice(0, 4))), over = row ? Math.min(hours, row.over) : 0;
  const rate = xN(c.hourly_rate), fixed = xN(c.monthly_fee), hourly = (hours - over) * rate, overAmt = over * rate * XD.cfg.overageMult;
  return { trips, hours, ground, over, rate, fixed, hourly, overAmt, total: fixed + hourly + overAmt + ground };
}
const xE = n => n.toFixed(2).replace('.', ',') + ' €';
function xRenderFactu() {
  const m = XS.month, tab = XS.fa; let body = `<div class="row" style="margin-bottom:16px"><label style="font-size:12px;font-weight:600;color:var(--t2)">MOIS</label><input type="month" value="${m}" onchange="XS.month=this.value;renderPage()" style="padding:8px;border-radius:8px;border:1px solid var(--border)"></div>` + xTabs(tab, [['inv', 'Factures mensuelles'], ['rep', 'Rapports d\'exploitation']], 'fa');
  if (tab === 'inv') {
    body += XD.coprops.length === 0 ? '<div class="empty">Aucun copropriétaire</div>' : XD.coprops.map(c => { const v = xInvoice(c, m); return `<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px"><div class="li-title">${esc(c.name)}</div><button class="btn btn-sm" onclick="xInvoicePdf('${c.id}')">PDF facture</button></div>
      <div class="ofp-result-box" style="margin-top:0"><div class="ofp-result-row"><span>1. Frais fixes de gestion mensuels</span><span class="ofp-result-val">${xE(v.fixed)}</span></div>
      <div class="ofp-result-row"><span>2. Frais horaires d'exploitation — ${xF(v.hours - v.over)} h × ${xE(v.rate)}</span><span class="ofp-result-val">${xE(v.hourly)}</span></div>
      ${v.over > 0 ? `<div class="ofp-result-row"><span>   Heures hors contrat — ${xF(v.over)} h × ${XD.cfg.overageMult} (majoré)</span><span class="ofp-result-val" style="color:var(--red)">${xE(v.overAmt)}</span></div>` : ''}
      <div class="ofp-result-row"><span>3. Frais d'escale réels (carburant, catering, taxes…)</span><span class="ofp-result-val">${xE(v.ground)}</span></div>
      <div class="ofp-result-row" style="border-top:2px solid var(--navy)"><span style="font-weight:700">TOTAL HT</span><span class="ofp-result-val" style="font-size:18px">${xE(v.total)}</span></div></div>
      <div style="font-size:12px;color:var(--t3);margin-top:6px">${v.trips.length} mission(s) clôturée(s) ce mois</div></div>`; }).join('');
  } else {
    body += xCfgCard(['overageMult', 'availPerDay']);
    const [Y, M] = m.split('-').map(Number), nd = new Date(Y, M, 0).getDate();
    const fl = S.flights.filter(f => f.departure_time?.startsWith(m) && f.arrival_time && !xNonFlight(f) && !xCancelled(f) && xT(f.arrival_time) < Date.now());
    const util = S.aircraft.filter(a => a.type === 'aircraft').map(a => { const h = fl.filter(f => f.aircraft_id === a.id).reduce((s, f) => s + xH(f.departure_time, f.arrival_time), 0), cap = nd * XD.cfg.availPerDay; return `<div class="ofp-result-row"><span>${esc(a.name)} — ${xF(h)} h / ${xF(cap)} h dispo.</span><span class="ofp-result-val">${cap ? xF(h / cap * 100) : 0} %</span></div>`; }).join('');
    const trips = XD.trips.filter(t => String(t.legs[0]?.dt || '').startsWith(m)), closed = trips.filter(t => t.status === 'Clôturé'), techCancel = trips.filter(t => t.status === 'Annulé' && t.cancel_reason === 'Technique');
    const dispatch = closed.length + techCancel.length ? closed.length / (closed.length + techCancel.length) * 100 : null;
    const legsAct = closed.flatMap(t => t.legs).filter(l => l.adt && l.dt), onTime = legsAct.filter(l => (xT(l.adt) - xT(l.dt)) / 60000 <= 15), punct = legsAct.length ? onTime.length / legsAct.length * 100 : null;
    const hClosed = closed.reduce((s, t) => s + xTripHours(t), 0), cost = closed.reduce((s, t) => s + xCosts(t), 0);
    const pairs = {}; fl.forEach(f => { const k = [f.departure, f.arrival].sort().join(' ↔ '); pairs[k] = (pairs[k] || 0) + 1; });
    const top = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const fb = closed.reduce((s, t) => s + xN(t.fuel_budget), 0), fa = closed.reduce((s, t) => s + xN(t.fuel_actual), 0);
    body += `<div class="card" style="margin-bottom:12px"><span class="sec-label">Taux d'utilisation de la flotte</span><div class="ofp-result-box" style="margin-top:0">${util || '—'}</div></div>
      <div class="card" style="margin-bottom:12px"><span class="sec-label">Performance</span><div class="ofp-result-box" style="margin-top:0">
      <div class="ofp-result-row"><span>Coût par heure de vol (frais réels / h)</span><span class="ofp-result-val">${hClosed ? xE(cost / hClosed) : '—'}</span></div>
      <div class="ofp-result-row"><span>Fiabilité des départs (dispatch rate)</span><span class="ofp-result-val">${dispatch == null ? '—' : xF(dispatch) + ' %'}</span></div>
      <div class="ofp-result-row"><span>Ponctualité (≤ 15 min, ${legsAct.length} tronçons mesurés)</span><span class="ofp-result-val">${punct == null ? '—' : xF(punct) + ' %'}</span></div></div></div>
      <div class="card" style="margin-bottom:12px"><span class="sec-label">Destinations les plus fréquentées (city-pairs)</span><div class="ofp-result-box" style="margin-top:0">${top.map(([k, n]) => `<div class="ofp-result-row"><span>${esc(k)}</span><span class="ofp-result-val">${n} vol(s)</span></div>`).join('') || '—'}</div></div>
      <div class="card"><span class="sec-label">Carburant — budget vs réel</span><div class="ofp-result-box" style="margin-top:0"><div class="ofp-result-row"><span>Budget</span><span class="ofp-result-val">${xF(fb)} L</span></div><div class="ofp-result-row"><span>Réel</span><span class="ofp-result-val">${xF(fa)} L</span></div><div class="ofp-result-row"><span>Écart</span><span class="ofp-result-val" style="color:${fa > fb ? 'var(--red)' : 'var(--green)'}">${fb ? (fa > fb ? '+' : '') + xF((fa - fb) / fb * 100) + ' %' : '—'}</span></div></div></div>`;
  }
  xPage('Facturation', 'Factures mensuelles et rapports de gestion', '', body);
}
function xInvoicePdf(id) {
  const c = XD.coprops.find(x => x.id === id), m = XS.month, v = xInvoice(c, m); if (!c) return;
  const o = xPDF('FACTURE MENSUELLE — ' + m, 'Client : ' + c.name);
  o.sec('Détail'); o.row('Frais fixes de gestion mensuels', xE(v.fixed)); o.row(`Frais horaires — ${xF(v.hours - v.over)} h x ${xE(v.rate)}`, xE(v.hourly));
  if (v.over > 0) o.row(`Heures hors contrat — ${xF(v.over)} h x ${v.rate} x ${XD.cfg.overageMult}`, xE(v.overAmt));
  o.row('Frais d\'escale réels', xE(v.ground)); o.row('TOTAL HT', xE(v.total));
  o.sec('Missions du mois'); v.trips.forEach(t => o.row(`${(t.legs[0]?.dt || '').slice(0, 10)} ${xRoute(t)}`, xF(xTripHours(t)) + ' h — ' + xE(xCosts(t))));
  o.doc.save(`Facture-${c.name.replace(/\W+/g, '_')}-${m}.pdf`);
}

/* ═══════════════════════════════════════════
   ENREGISTREMENT DES PAGES + NAV
═══════════════════════════════════════════ */
[{ id: 'coprop', label: 'Copropriétaires', icon: iconUsers() }, { id: 'dispatch', label: 'Dispatch', icon: iconOFP() }, { id: 'frat', label: 'Sécurité', icon: iconShield() }, { id: 'duty', label: 'Temps service', icon: iconCal() }, { id: 'maint', label: 'Maintenance', icon: iconPlane() }, { id: 'factu', label: 'Facturation', icon: iconDoc() }].forEach(p => PAGES.push(p));
const XP = { coprop: xRenderCoprop, dispatch: xRenderDispatch, frat: xRenderFrat, duty: xRenderDuty, maint: xRenderMaint, factu: xRenderFactu };
const _xRender = renderPage;
renderPage = function () { if (!S.loading && XP[S.page]) return XP[S.page](); return _xRender(); };
(function () { const st = document.createElement('style'); st.textContent = '#bnav{overflow-x:auto}.bnb{min-width:64px;flex:0 0 auto}#snav{overflow-y:auto}'; document.head.appendChild(st); })();
buildNav();
xLoad();
