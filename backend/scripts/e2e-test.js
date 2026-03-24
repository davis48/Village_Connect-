const base = 'http://localhost:3000/api';

async function req(path, options = {}) {
  const res = await fetch(base + path, options);
  let body;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const report = [];

  const login = await req('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@villageconnecte.ci', password: 'Admin@2025' }),
  });
  report.push({ step: 'login', ...login });
  if (!login.ok || !login.body?.token) {
    throw new Error('Login admin impossible');
  }

  const authHeaders = {
    Authorization: `Bearer ${login.body.token}`,
    'Content-Type': 'application/json',
  };

  const health = await req('/health');
  report.push({ step: 'health', ...health });

  const dashboard = await req('/admin/dashboard', { headers: authHeaders });
  report.push({ step: 'dashboard', ...dashboard });

  const rnd = Math.floor(Math.random() * 100000);

  const createAgentPayload = {
    nom: `Agent Test ${rnd}`,
    email: `agent${rnd}@vc.ci`,
    telephone: `+2250700${String(rnd).slice(-4)}`,
    zone: 'Zone Test',
    password: 'Test12345!',
  };
  const createAgent = await req('/admin/agents', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(createAgentPayload),
  });
  report.push({ step: 'create_agent', ...createAgent });
  if (!createAgent.ok) throw new Error('Creation agent impossible');

  const bornesBefore = await req('/admin/bornes', { headers: authHeaders });
  const usedNums = new Set((bornesBefore.body || []).map((b) => Number(b.numero)));
  let borneNumero = null;
  for (let n = 100; n <= 250; n += 1) {
    if (!usedNums.has(n)) {
      borneNumero = n;
      break;
    }
  }
  if (!borneNumero) {
    throw new Error('Aucun numero de borne libre pour le test');
  }

  const createBornePayload = {
    site_id: 1,
    numero: borneNumero,
    nom: `Borne Test ${rnd}`,
    zone: 'Zone Test',
    latitude: 7.790001,
    longitude: -7.880001,
    type_noeud: 'Repeteur',
    puissance_w: 20,
    hauteur_mat_m: 4,
    ip_locale: `192.168.99.${Math.floor(Math.random() * 200) + 10}`,
  };
  const createBorne = await req('/admin/bornes', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(createBornePayload),
  });
  report.push({ step: 'create_borne', ...createBorne });
  if (!createBorne.ok) throw new Error('Creation borne impossible');

  const listAgents = await req('/admin/agents', { headers: authHeaders });
  report.push({ step: 'list_agents', status: listAgents.status, ok: listAgents.ok, count: listAgents.body?.length || 0 });
  const targetAgent = (listAgents.body || []).find((a) => a.email === createAgentPayload.email);
  if (!targetAgent?.agent_id) throw new Error('Agent cree introuvable');

  const setStatut = await req(`/admin/bornes/${createBorne.body.id}/statut`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ statut: 'panne' }),
  });
  report.push({ step: 'set_borne_statut', ...setStatut });

  const bulkCodes = await req('/admin/codes/bulk', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ formule: 'journalier', quantite: 3, montant: 200, agent_id: targetAgent.agent_id }),
  });
  report.push({ step: 'bulk_codes', status: bulkCodes.status, ok: bulkCodes.ok, quantite: bulkCodes.body?.quantite || 0 });
  if (!bulkCodes.ok || !bulkCodes.body?.quantite) throw new Error('Generation codes impossible');

  const ventes = await req('/admin/ventes', { headers: authHeaders });
  report.push({ step: 'ventes', status: ventes.status, ok: ventes.ok, count: ventes.body?.length || 0 });

  const alertes = await req('/admin/alertes', { headers: authHeaders });
  report.push({
    step: 'alertes_before_mark_read',
    status: alertes.status,
    ok: alertes.ok,
    count: alertes.body?.length || 0,
    unread: (alertes.body || []).filter((a) => !a.lu).length,
  });

  const markRead = await req('/admin/alertes/tout-lu', { method: 'PUT', headers: authHeaders });
  report.push({ step: 'mark_alertes_lu', ...markRead });

  const users = await req('/admin/utilisateurs', { headers: authHeaders });
  report.push({ step: 'utilisateurs', status: users.status, ok: users.ok, count: users.body?.length || 0 });

  const result = {
    success: true,
    created: {
      agentEmail: createAgentPayload.email,
      borneName: createBornePayload.nom,
      borneId: createBorne.body.id,
      voucherCount: bulkCodes.body.quantite,
    },
    report,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
  process.exit(1);
});
