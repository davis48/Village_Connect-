const API_BASE = `${window.location.origin}/api`;
let token = localStorage.getItem('vc_token') || '';
let authUser = { nom: 'Administrateur', role: 'admin' };

let bornes = [];
let agents = [];
let utilisateurs = [];
let usersF = [];
let alertes = [];
let ventes = [];
let generatedVouchers = [];
let statsData = null;

const MAP_POS = [[85,45],[72,52],[68,68],[62,73],[50,65],[40,62],[33,42],[28,54],[26,70],[60,68],[54,40],[54,28],[54,14]];
const MAP_LINKS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[3,9],[4,10],[10,11],[11,12],[7,4]];

const titles = {
  dashboard:'Tableau de bord',
  bornes:'Bornes & points d\'accès',
  agents:'Agents locaux',
  utilisateurs:'Utilisateurs finaux',
  vouchers:'Vouchers Wi-Fi',
  revenus:'Revenus',
  alertes:'Alertes système'
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const message = data?.error || `Erreur API ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function formatNum(v) {
  return Number(v || 0).toLocaleString('fr-FR');
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-CI', { dateStyle: 'short', timeStyle: 'short' });
}

async function doLogin(){
  const e = document.getElementById('l-email').value.trim();
  const p = document.getElementById('l-pass').value;
  document.getElementById('l-err').style.display = 'none';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: e, password: p }) });
    token = data.token;
    authUser = { nom: data.nom || 'Admin', role: data.role || 'admin' };
    localStorage.setItem('vc_token', token);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('sb-uname').textContent = authUser.nom;
    document.getElementById('sb-ava').textContent = (authUser.nom || 'A').substring(0,1).toUpperCase();
    await initApp();
    toast(`Bienvenue, ${authUser.nom} !`, 'success');
  } catch (err) {
    document.getElementById('l-err').style.display = 'block';
    toast(err.message, 'error');
  }
}

function doLogout(){
  token = '';
  localStorage.removeItem('vc_token');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  toast('Déconnecté', 'info');
}

function goTo(p,el){
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`).classList.add('active');
  el.classList.add('active');
  document.getElementById('tb-title').textContent = titles[p] || p;
}

function renderBornes(){
  document.getElementById('cnt-bornes').textContent = bornes.length;
  document.getElementById('bornes-tb').innerHTML = bornes.map((b, i) => `
    <tr>
      <td><strong>${b.num}</strong></td><td>${b.nom}</td>
      <td><span class="badge b-gray">${b.zone || '—'}</span></td>
      <td style="font-size:11px;color:var(--text3)">${Number(b.lat || 0).toFixed(5)}, ${Number(b.lon || 0).toFixed(5)}</td>
      <td><div style="display:flex;align-items:center;gap:6px;min-width:80px"><div class="prog" style="flex:1"><div class="prog-fill" style="width:${b.bat}%;background:${b.bat>30?'var(--green)':b.bat>15?'var(--amber)':'var(--red)'}"></div></div><span style="font-size:11px">${b.bat}%</span></div></td>
      <td>${b.users}</td>
      <td><span class="badge b-blue" style="font-size:10px">${b.type}</span></td>
      <td><span class="badge ${b.statut==='actif'?'b-green':b.statut==='panne'?'b-red':'b-amber'}">${b.statut}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" data-action="detail-borne" data-index="${i}">Détail</button>
        <button class="btn btn-outline btn-sm" style="margin-left:4px" data-action="toggle-borne" data-index="${i}">${b.statut==='actif'?'Désactiver':'Activer'}</button>
      </td>
    </tr>`).join('');

  const sel = document.getElementById('a-bornes');
  sel.innerHTML = bornes.map(b => `<option value="${b.id}">${b.nom}</option>`).join('');
}

function renderAgents(){
  document.getElementById('cnt-agents').textContent = agents.length;
  const vs = document.getElementById('v-a');
  vs.innerHTML = '<option value="">— Aucun —</option>' + agents.map(a => `<option value="${a.agent_id}">${a.nom}</option>`).join('');

  document.getElementById('agents-tb').innerHTML = agents.map((a, i) => `
    <tr>
      <td><strong>${a.nom}</strong></td><td style="color:var(--text3)">${a.email || '—'}</td><td>${a.tel || '—'}</td>
      <td><span class="badge b-gray">${a.zone || '—'}</span></td><td>${a.codes}</td>
      <td style="color:var(--teal);font-weight:500">${formatNum(a.revenus)} FCFA</td>
      <td><span class="badge ${a.statut==='actif'?'b-green':a.statut==='formation'?'b-amber':'b-red'}">${a.statut}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-danger btn-sm" style="margin-left:4px" data-action="delete-agent" data-index="${i}">Suppr.</button>
      </td>
    </tr>`).join('');
}

function renderUsers(){
  document.getElementById('cnt-users').textContent = usersF.length;
  document.getElementById('users-tb').innerHTML = usersF.map(u => `
    <tr>
      <td><strong>${u.nom}</strong></td><td>${u.tel || '—'}</td>
      <td style="color:var(--text3);font-size:12px">${u.last}</td>
      <td><span class="badge b-blue" style="font-size:10px">${u.borne || '—'}</span></td>
      <td><span class="badge ${u.formule==='mensuel'?'b-purple':u.formule==='hebdomadaire'?'b-blue':'b-gray'}">${u.formule || '—'}</span></td>
      <td><span class="badge ${u.statut==='connecte'?'b-green':u.statut==='expire'?'b-red':'b-amber'}">${u.statut}</span></td>
      <td></td>
    </tr>`).join('');
}

function renderVentes(){
  document.getElementById('ventes-tb').innerHTML = ventes.map(v => `
    <tr>
      <td style="color:var(--text3);font-size:12px">${fmtDate(v.created_at)}</td>
      <td>${v.agent_nom || '—'}</td>
      <td><span class="badge ${v.formule==='mensuel'?'b-purple':v.formule==='hebdomadaire'?'b-blue':'b-gray'}">${v.formule}</span></td>
      <td style="font-family:monospace;font-size:12px;color:var(--text2)">${v.code}</td>
      <td style="font-weight:600;color:var(--teal)">${formatNum(v.montant)} FCFA</td>
    </tr>`).join('');
}

function renderAlertes(){
  const tc = { batterie:'b-red', panne:'b-red', signal:'b-amber', fraude:'b-purple', autre:'b-gray' };
  const unread = alertes.filter(a => !a.lu).length;
  document.getElementById('nb-alertes').textContent = unread;
  document.getElementById('badge-alertes-card').textContent = unread;

  document.getElementById('alertes-tb').innerHTML = alertes.map(a => `
    <tr>
      <td style="color:var(--text3);font-size:12px">${fmtDate(a.created_at)}</td>
      <td><strong>${a.borne}</strong></td>
      <td><span class="badge ${tc[a.type] || 'b-gray'}">${a.type}</span></td>
      <td>${a.msg}</td>
      <td>${a.lu ? '<span class="badge b-gray">Lu</span>' : '<span class="badge b-red">Non lu</span>'}</td>
    </tr>`).join('');

  document.getElementById('aw').innerHTML = alertes.slice(0,3).map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="width:30px;height:30px;border-radius:8px;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${a.type==='batterie'?'🔋':a.type==='panne'?'📡':'⚠️'}</div>
      <div style="flex:1;min-width:0"><div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.borne} - ${a.msg.substring(0,36)}...</div><div style="font-size:10px;color:var(--text3)">${fmtDate(a.created_at)}</div></div>
    </div>`).join('');
}

function renderBars(){
  const week = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const values = [0,0,0,0,0,0,0];
  ventes.forEach(v => {
    const d = new Date(v.created_at);
    if (Number.isNaN(d.getTime())) return;
    const jsDay = d.getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    values[idx] += Number(v.montant || 0);
  });
  const max = Math.max(...values, 1);
  document.getElementById('main-bars').innerHTML = values.map((x,i) => `<div class="bcol"><div class="bar" style="height:${Math.round(x/max*68)+8}px"></div><div class="blbl">${week[i]}</div></div>`).join('');
}

function renderFormulaDistribution() {
  const formules = statsData?.formules || { journalier: 0, hebdomadaire: 0, mensuel: 0 };
  const total = Object.values(formules).reduce((a, b) => a + Number(b || 0), 0);
  const pct = (v) => (total > 0 ? Math.round((Number(v || 0) / total) * 100) : 0);

  const rows = [
    { label: 'Journalier · 200 FCFA', value: formules.journalier, color: 'var(--teal)', cls: 'up' },
    { label: 'Hebdomadaire · 1 000 FCFA', value: formules.hebdomadaire, color: 'var(--blue)', cls: '' },
    { label: 'Mensuel · 3 000 FCFA', value: formules.mensuel, color: 'var(--purple)', cls: '' },
  ];

  document.getElementById('formula-dist').innerHTML = rows.map((r) => {
    const percent = pct(r.value);
    const valClass = r.cls ? `class="${r.cls}"` : `style="color:${r.color}"`;
    return `<div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${r.label}</span><span ${valClass}>${percent}%</span></div><div class="prog"><div class="prog-fill" style="width:${percent}%;background:${r.color}"></div></div></div>`;
  }).join('');
}

function renderStats() {
  if (!statsData) return;

  const bornesTotal = Number(statsData?.bornes?.total || 0);
  const bornesActives = Number(statsData?.bornes?.actives || 0);
  const bornesPannes = Number(statsData?.bornes?.pannes || 0);
  const bornesMaint = Number(statsData?.bornes?.maintenance || 0);

  const usersConnectes = Number(statsData?.utilisateurs?.connectes || 0);
  const usersTotal = Number(statsData?.utilisateurs?.total || 0);

  const revMois = Number(statsData?.revenus?.mois || 0);
  const revTrim = Number(statsData?.revenus?.trimestre || 0);
  const revTotal = Number(statsData?.revenus?.total || 0);
  const revObj = Number(statsData?.revenus?.objectif_mensuel || 0);
  const revObjPct = Number(statsData?.revenus?.objectif_pct || 0);

  const vTotal = Number(statsData?.vouchers?.total || 0);
  const vUsed = Number(statsData?.vouchers?.utilises || 0);
  const vAvailable = Number(statsData?.vouchers?.disponibles || 0);
  const vExpired = Number(statsData?.vouchers?.expires || 0);
  const vMois = Number(statsData?.vouchers?.mois || 0);

  document.getElementById('kpi-bornes').textContent = `${bornesActives} / ${bornesTotal}`;
  document.getElementById('kpi-bornes-sub').textContent = `⚠ ${bornesPannes} en panne`;
  document.getElementById('kpi-users').textContent = formatNum(usersConnectes);
  document.getElementById('kpi-users-sub').textContent = `${formatNum(usersTotal)} utilisateurs au total`;
  document.getElementById('kpi-revenus-mois').textContent = formatNum(revMois);
  document.getElementById('kpi-revenus-sub').textContent = 'ce mois';
  document.getElementById('kpi-vouchers').textContent = formatNum(vMois);

  document.getElementById('network-count').textContent = bornesTotal;
  document.getElementById('legend-actif').textContent = `● Actif (${bornesActives})`;
  document.getElementById('legend-panne').textContent = `● Panne (${bornesPannes})`;
  document.getElementById('legend-maint').textContent = `● Maintenance (${bornesMaint})`;

  document.getElementById('v-total').textContent = formatNum(vTotal);
  document.getElementById('v-used').textContent = formatNum(vUsed);
  document.getElementById('v-available').textContent = formatNum(vAvailable);
  document.getElementById('v-expired').textContent = formatNum(vExpired);
  document.getElementById('v-revenus-total').textContent = `${formatNum(revTotal)} FCFA`;

  document.getElementById('rev-mois').textContent = formatNum(revMois);
  document.getElementById('rev-trimestre').textContent = formatNum(revTrim);
  document.getElementById('rev-total').textContent = formatNum(revTotal);
  document.getElementById('rev-objective').textContent = `${revObjPct}%`;
  document.getElementById('rev-objective-sub').textContent = `${formatNum(revMois)} / ${formatNum(revObj)} FCFA`;

  renderFormulaDistribution();
}

function renderMap(cid){
  const c = document.getElementById(cid);
  if (!c) return;
  c.innerHTML = '';
  MAP_LINKS.forEach(([a,b]) => {
    const pa = MAP_POS[a], pb = MAP_POS[b];
    if (!pa || !pb) return;
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
    const len = Math.sqrt(dx*dx + dy*dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const l = document.createElement('div');
    l.className = 'mline';
    l.style.cssText = `left:${pa[0]}%;top:${pa[1]}%;width:${len}%;transform:rotate(${angle}deg)`;
    c.appendChild(l);
  });

  bornes.forEach((b,i) => {
    const pos = MAP_POS[i];
    if (!pos) return;
    const d = document.createElement('div');
    d.className = 'mdot';
    d.dataset.index = i;
    d.style.cssText = `left:${pos[0]}%;top:${pos[1]}%;background:${b.statut==='actif'?'var(--green)':b.statut==='panne'?'var(--red)':'var(--amber)'}`;
    d.title = `${b.nom} | ${b.statut} | ${b.bat}% | ${b.users} users`;
    c.appendChild(d);
    const lbl = document.createElement('div');
    lbl.className = 'mlbl';
    lbl.style.cssText = `left:${pos[0]+1.5}%;top:${pos[1]-3.5}%`;
    lbl.textContent = b.num;
    c.appendChild(lbl);
  });
}

function detailBorne(i){
  const b = bornes[i];
  document.getElementById('det-title').textContent = `${b.nom} - ${b.zone}`;
  document.getElementById('det-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">Statut</div><span class="badge ${b.statut==='actif'?'b-green':b.statut==='panne'?'b-red':'b-amber'}">${b.statut}</span></div>
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">Type</div><span class="badge b-blue">${b.type}</span></div>
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">Batterie</div><div class="prog" style="margin-top:6px"><div class="prog-fill" style="width:${b.bat}%;background:${b.bat>30?'var(--green)':'var(--red)'}"></div></div><div style="font-size:12px;margin-top:4px">${b.bat}%</div></div>
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">Connectés</div><div style="font-size:22px;font-weight:700;color:var(--blue)">${b.users}</div></div>
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">GPS</div><div style="font-size:12px">${Number(b.lat).toFixed(6)}, ${Number(b.lon).toFixed(6)}</div></div>
      <div><div style="font-size:11px;color:var(--text3);margin-bottom:4px">IP locale</div><div style="font-size:12px;font-family:monospace">${b.ip || '—'}</div></div>
    </div>`;
  openM('m-detail');
}

async function toggleBorne(i){
  try {
    const b = bornes[i];
    const next = b.statut === 'actif' ? 'panne' : 'actif';
    await api(`/admin/bornes/${b.id}/statut`, { method: 'PUT', body: JSON.stringify({ statut: next }) });
    await loadAllData();
    toast(`${b.nom} -> ${next}`, next === 'actif' ? 'success' : 'error');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveBorne(){
  try {
    const payload = {
      numero: parseInt(document.getElementById('b-num').value, 10),
      nom: document.getElementById('b-nom').value,
      zone: document.getElementById('b-zone').value,
      latitude: parseFloat(document.getElementById('b-lat').value),
      longitude: parseFloat(document.getElementById('b-lon').value),
      type_noeud: document.getElementById('b-t').value
        .replace('Répéteur', 'Repeteur')
        .replace('Nœud central', 'Noeud central'),
      puissance_w: parseInt((document.getElementById('b-w').value || '20').replace('W', ''), 10),
      hauteur_mat_m: parseInt((document.getElementById('b-h').value || '4').replace('m', ''), 10),
      ip_locale: document.getElementById('b-ip').value || null
    };

    if (!payload.numero || !payload.nom || !payload.zone || Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude)) {
      toast('Veuillez remplir les champs obligatoires', 'error');
      return;
    }

    await api('/admin/bornes', { method: 'POST', body: JSON.stringify(payload) });
    closeM('m-borne');
    await loadAllData();
    toast(`Borne "${payload.nom}" ajoutée`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function saveAgent(){
  try {
    const payload = {
      nom: document.getElementById('a-nom').value,
      email: document.getElementById('a-email').value,
      telephone: document.getElementById('a-tel').value,
      zone: document.getElementById('a-zone').value,
      password: document.getElementById('a-pass').value
    };
    if (!payload.nom || !payload.email || !payload.password) {
      toast('Nom, email et mot de passe requis', 'error');
      return;
    }
    await api('/admin/agents', { method: 'POST', body: JSON.stringify(payload) });
    closeM('m-agent');
    await loadAllData();
    toast(`Agent "${payload.nom}" créé`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delAgent(i){
  const a = agents[i];
  if (!a || !confirm(`Supprimer l'agent ${a.nom} ?`)) return;
  try {
    await api(`/admin/agents/${a.id}`, { method: 'DELETE' });
    await loadAllData();
    toast('Agent supprimé', 'info');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function filterUsers(q){
  const needle = (q || '').toLowerCase();
  usersF = needle
    ? utilisateurs.filter(u => u.nom.toLowerCase().includes(needle) || (u.tel || '').includes(needle))
    : [...utilisateurs];
  renderUsers();
}

async function genVouchers(){
  try {
    const formule = document.getElementById('v-f').value;
    const quantite = Math.min(parseInt(document.getElementById('v-q').value, 10) || 1, 50);
    const agentId = document.getElementById('v-a').value || null;
    const montants = { journalier: 200, hebdomadaire: 1000, mensuel: 3000 };

    const data = await api('/admin/codes/bulk', {
      method: 'POST',
      body: JSON.stringify({ formule, quantite, montant: montants[formule], agent_id: agentId })
    });

    generatedVouchers = data.codes || [];
    const grid = document.getElementById('vg');
    if (!generatedVouchers.length) {
      grid.innerHTML = '<div style="color:var(--text3);font-size:13px;grid-column:1/-1;padding:18px 0;text-align:center">Aucun voucher généré.</div>';
      return;
    }

    grid.innerHTML = generatedVouchers.map(v => `
      <div class="vcard">
        <div class="vinfo">${v.formule}</div>
        <div class="vcode">${v.code}</div>
        <div class="vinfo">${formatNum(v.montant)} FCFA</div>
      </div>
    `).join('');

    await loadAllData();
    toast(`${generatedVouchers.length} voucher(s) générés`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function exportCSV(){
  if (!generatedVouchers.length) {
    toast('Aucun voucher à exporter', 'error');
    return;
  }
  const csv = 'Code,Formule,Montant,Expiration\n' + generatedVouchers
    .map(v => `${v.code},${v.formule},${v.montant},${v.expiration}`)
    .join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'vouchers.csv';
  a.click();
  toast('Export CSV téléchargé', 'success');
}

async function markRead(){
  try {
    await api('/admin/alertes/tout-lu', { method: 'PUT' });
    await loadAllData();
    toast('Toutes alertes marquées lues', 'info');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openM(id){ document.getElementById(id).classList.add('open'); }
function closeM(id){ document.getElementById(id).classList.remove('open'); }

function bindUIEvents() {
  document.getElementById('btn-login')?.addEventListener('click', doLogin);
  document.getElementById('l-pass')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') await doLogin();
  });

  document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
    item.addEventListener('click', () => goTo(item.dataset.page, item));
  });

  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
  document.getElementById('btn-refresh')?.addEventListener('click', initApp);

  document.getElementById('btn-open-borne')?.addEventListener('click', () => openM('m-borne'));
  document.getElementById('btn-open-agent')?.addEventListener('click', () => openM('m-agent'));
  document.getElementById('btn-save-borne')?.addEventListener('click', saveBorne);
  document.getElementById('btn-save-agent')?.addEventListener('click', saveAgent);
  document.getElementById('btn-detail-report')?.addEventListener('click', () => {
    closeM('m-detail');
    toast('Incident signalé', 'info');
  });

  document.getElementById('user-search')?.addEventListener('input', (e) => filterUsers(e.target.value));
  document.getElementById('btn-gen-vouchers')?.addEventListener('click', genVouchers);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  document.getElementById('btn-mark-read')?.addEventListener('click', markRead);

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => closeM(el.dataset.closeModal));
  });

  document.querySelectorAll('.modal-bg').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('open');
    });
  });

  document.getElementById('bornes-tb')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (Number.isNaN(idx)) return;
    if (btn.dataset.action === 'detail-borne') detailBorne(idx);
    if (btn.dataset.action === 'toggle-borne') await toggleBorne(idx);
  });

  document.getElementById('agents-tb')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-agent"]');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    if (!Number.isNaN(idx)) await delAgent(idx);
  });

  document.getElementById('map-dash')?.addEventListener('click', (e) => {
    const dot = e.target.closest('.mdot');
    if (!dot) return;
    const idx = Number(dot.dataset.index);
    if (!Number.isNaN(idx)) detailBorne(idx);
  });
}

function toast(msg,type='info'){
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || 'ℹ'}</span>${msg}`;
  document.getElementById('toast').appendChild(t);
  setTimeout(() => t.remove(), 3400);
}

function tick(){
  const el = document.getElementById('live-t');
  if (el) el.textContent = new Date().toLocaleString('fr-CI', { dateStyle:'medium', timeStyle:'short' });
}
tick();
setInterval(tick, 30000);
bindUIEvents();

async function loadAllData() {
  const [statsRows, bornesRows, agentsRows, usersRows, alertRows, ventesRows] = await Promise.all([
    api('/admin/stats'),
    api('/admin/bornes'),
    api('/admin/agents'),
    api('/admin/utilisateurs'),
    api('/admin/alertes'),
    api('/admin/ventes')
  ]);

  statsData = statsRows || null;

  bornes = (bornesRows || []).map(b => ({
    id: b.id,
    num: b.numero,
    nom: b.nom,
    zone: b.zone,
    lat: Number(b.latitude || 0),
    lon: Number(b.longitude || 0),
    bat: Number(b.batterie_pct || 0),
    users: Number(b.connexions_actives || b.users_connectes || 0),
    type: (b.type_noeud || '').replace('Repeteur', 'Répéteur').replace('Noeud central', 'Nœud central'),
    statut: b.statut,
    ip: b.ip_locale || ''
  }));

  agents = (agentsRows || []).map(a => ({
    id: a.id,
    agent_id: a.agent_id,
    nom: a.nom,
    email: a.email,
    tel: a.telephone,
    zone: a.zone,
    codes: Number(a.codes_vendus || 0),
    revenus: Number(a.revenus_total || 0),
    statut: a.statut
  }));

  utilisateurs = (usersRows || []).map(u => ({
    nom: u.nom,
    tel: u.telephone,
    last: fmtDate(u.derniere_connexion),
    borne: u.borne_nom,
    formule: u.formule_active,
    statut: u.statut_connexion
  }));
  usersF = [...utilisateurs];

  alertes = (alertRows || []).map(a => ({
    type: a.type,
    msg: a.message,
    lu: !!a.lu,
    borne: a.borne_nom,
    created_at: a.created_at
  }));

  ventes = ventesRows || [];

  renderBornes();
  renderAgents();
  renderUsers();
  renderVentes();
  renderAlertes();
  renderBars();
  renderStats();
  setTimeout(() => renderMap('map-dash'), 50);
}

async function initApp(){
  try {
    await loadAllData();
  } catch (err) {
    if (String(err.message).toLowerCase().includes('token')) {
      doLogout();
      toast('Session expirée, reconnectez-vous', 'error');
      return;
    }
    toast(err.message, 'error');
  }
}

(async () => {
  if (!token) return;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  await initApp();
})();
