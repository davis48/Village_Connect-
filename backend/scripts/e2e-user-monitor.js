const base = 'http://localhost:3000/api';

async function main() {
  const loginRes = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@villageconnecte.ci', password: 'Admin@2025' }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Login admin KO: ${JSON.stringify(loginBody)}`);
  }

  const authHeaders = {
    Authorization: `Bearer ${loginBody.token}`,
    'Content-Type': 'application/json',
  };

  const createCodeRes = await fetch(base + '/admin/codes/bulk', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ formule: 'journalier', quantite: 1, montant: 200 }),
  });
  const createCodeBody = await createCodeRes.json();
  if (!createCodeRes.ok || !createCodeBody?.codes?.[0]?.code) {
    throw new Error(`Creation code KO: ${JSON.stringify(createCodeBody)}`);
  }

  const code = createCodeBody.codes[0].code;

  const userConnexionRes = await fetch(base + '/user/connexion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, mac_address: 'AA:BB:CC:DD:EE:99' }),
  });
  const userConnexionBody = await userConnexionRes.json();

  const heartbeatRes = await fetch(base + '/monitor/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      borne_id: 14,
      batterie_pct: 9,
      signal_dbm: -85,
      users_connectes: 2,
      tension_v: 11.7,
      temp_c: 48.2,
    }),
  });
  const heartbeatBody = await heartbeatRes.json();

  const feedbackRes = await fetch(base + '/user/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 4, commentaire: 'Test automatique', borne_id: 14 }),
  });
  const feedbackBody = await feedbackRes.json();

  console.log(JSON.stringify({
    success: true,
    code,
    steps: [
      { step: 'user_connexion', ok: userConnexionRes.ok, status: userConnexionRes.status, body: userConnexionBody },
      { step: 'heartbeat', ok: heartbeatRes.ok, status: heartbeatRes.status, body: heartbeatBody },
      { step: 'feedback', ok: feedbackRes.ok, status: feedbackRes.status, body: feedbackBody },
    ],
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
  process.exit(1);
});
