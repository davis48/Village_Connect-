/**
 * Village Connecté — Backend API
 * Node.js + Express + MySQL
 */

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const dbErrorMessage = (err) => err?.message || err?.sqlMessage || 'connexion impossible';

// ─── Middlewares ────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ─── Connexion MySQL ─────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'village_connecte',
  waitForConnections: true,
  connectionLimit: 10,
});

// Test connexion au démarrage
pool.getConnection()
  .then(conn => { console.log('✓ MySQL connecté'); conn.release(); })
  .catch(err  => console.error('✕ MySQL erreur:', dbErrorMessage(err)));

// ─── Middleware auth JWT ─────────────────────────────────────────
const authMiddleware = (roles = []) => async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    if (roles.length && !roles.includes(decoded.role))
      return res.status(403).json({ error: 'Accès interdit' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign(
      { id: user.id, role: user.role, nom: user.nom },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '8h' }
    );
    res.json({ token, role: user.role, nom: user.nom });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — Dashboard KPIs
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/dashboard', authMiddleware(['admin']), async (req, res) => {
  try {
    const [[{ total_users }]]   = await pool.query('SELECT COUNT(*) AS total_users FROM users WHERE role = "utilisateur"');
    const [[{ bornes_actives }]]= await pool.query('SELECT COUNT(*) AS bornes_actives FROM bornes WHERE statut = "actif"');
    const [[{ pannes }]]        = await pool.query('SELECT COUNT(*) AS pannes FROM bornes WHERE statut = "panne"');
    const [[{ revenus_mois }]]  = await pool.query(
      'SELECT COALESCE(SUM(montant),0) AS revenus_mois FROM ventes WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())'
    );
    const [[{ vouchers_mois }]] = await pool.query(
      'SELECT COUNT(*) AS vouchers_mois FROM codes_acces WHERE MONTH(created_at) = MONTH(NOW())'
    );
    res.json({ total_users, bornes_actives, pannes, revenus_mois, vouchers_mois });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — Bornes
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/bornes', authMiddleware(['admin']), async (req, res) => {
  try {
    const [bornes] = await pool.query(`
      SELECT b.*,
        (SELECT COUNT(*) FROM connexions c WHERE c.borne_id = b.id AND c.actif = 1) AS connexions_actives
      FROM bornes b ORDER BY b.numero
    `);
    res.json(bornes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/bornes/:id/statut', authMiddleware(['admin']), async (req, res) => {
  try {
    const { statut } = req.body;
    await pool.query('UPDATE bornes SET statut = ?, updated_at = NOW() WHERE id = ?', [statut, req.params.id]);
    res.json({ success: true, statut });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/bornes', authMiddleware(['admin']), async (req, res) => {
  try {
    const { site_id=1, numero, nom, zone, latitude, longitude, type_noeud='Repeteur', puissance_w=20, hauteur_mat_m=4, ip_locale } = req.body;
    const [r] = await pool.query(
      'INSERT INTO bornes (site_id,numero,nom,zone,latitude,longitude,type_noeud,puissance_w,hauteur_mat_m,ip_locale) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [site_id, numero, nom, zone, latitude, longitude, type_noeud, puissance_w, hauteur_mat_m, ip_locale]
    );
    res.status(201).json({ id: r.insertId, message: 'Borne ajoutée' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — Agents
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/agents', authMiddleware(['admin']), async (req, res) => {
  try {
    const [agents] = await pool.query(`
      SELECT u.id, u.nom, u.email, u.telephone, u.statut,
             a.zone, a.codes_vendus, a.revenus_total, a.id AS agent_id
      FROM users u
      JOIN agents a ON a.user_id = u.id
      ORDER BY a.codes_vendus DESC
    `);
    res.json(agents);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/agents', authMiddleware(['admin']), async (req, res) => {
  try {
    const { nom, email, telephone, zone, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO users (nom, email, telephone, password_hash, role, statut) VALUES (?,?,?,?,"agent","actif")',
      [nom, email, telephone, hash]
    );
    await pool.query('INSERT INTO agents (user_id, zone) VALUES (?,?)', [r.insertId, zone]);
    res.status(201).json({ id: r.insertId, message: 'Agent créé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/agents/:id', authMiddleware(['admin']), async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — Utilisateurs finaux
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/utilisateurs', authMiddleware(['admin']), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, usr.nom, usr.telephone,
             u.formule_active, u.statut_connexion, u.derniere_connexion,
             b.nom AS borne_nom
      FROM utilisateurs u
      JOIN users usr ON usr.id = u.user_id
      LEFT JOIN bornes b ON b.id = u.borne_id
      ORDER BY u.derniere_connexion DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — Revenus
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/revenus', authMiddleware(['admin']), async (req, res) => {
  try {
    const { periode = 'mois' } = req.query;
    const groupBy = periode === 'jour'    ? 'DATE(created_at)'
                  : periode === 'semaine' ? 'YEARWEEK(created_at)'
                  :                        'DATE_FORMAT(created_at, "%Y-%m")';
    const [rows] = await pool.query(`
      SELECT ${groupBy} AS periode,
             SUM(montant) AS total,
             COUNT(*) AS transactions
      FROM ventes
      GROUP BY ${groupBy}
      ORDER BY periode DESC
      LIMIT 12
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/ventes', authMiddleware(['admin']), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.id, v.formule, v.montant, v.created_at,
             ca.code,
             u.nom AS agent_nom
      FROM ventes v
      JOIN codes_acces ca ON ca.id = v.code_id
      JOIN agents a ON a.id = v.agent_id
      JOIN users u ON u.id = a.user_id
      ORDER BY v.created_at DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — Alertes
// ═══════════════════════════════════════════════════════════════

app.get('/api/admin/alertes', authMiddleware(['admin']), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, b.nom AS borne_nom, b.zone AS borne_zone
      FROM alertes a
      JOIN bornes b ON b.id = a.borne_id
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/alertes/:id/lu', authMiddleware(['admin']), async (req, res) => {
  try {
    await pool.query('UPDATE alertes SET lu = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/alertes/tout-lu', authMiddleware(['admin']), async (req, res) => {
  try {
    await pool.query('UPDATE alertes SET lu = 1');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// AGENT — Vouchers / Codes
// ═══════════════════════════════════════════════════════════════

app.post('/api/agent/codes', authMiddleware(['agent','admin']), async (req, res) => {
  try {
    const { formule, montant } = req.body;
    const durees = { journalier: 24, hebdomadaire: 168, mensuel: 720 };
    const duree_h = durees[formule] || 24;
    const code = Math.random().toString(36).substring(2,10).toUpperCase();
    const expiration = new Date(Date.now() + duree_h * 3600 * 1000);

    // Récupérer agent_id depuis user_id
    const [ag] = await pool.query('SELECT id FROM agents WHERE user_id = ?', [req.user.id]);
    const agent_id = ag[0]?.id;

    const [r] = await pool.query(
      'INSERT INTO codes_acces (code, formule, montant, duree_h, agent_id, expiration) VALUES (?,?,?,?,?,?)',
      [code, formule, montant, duree_h, agent_id, expiration]
    );

    // Enregistrer la vente
    if (agent_id) {
      await pool.query(
        'INSERT INTO ventes (code_id, agent_id, formule, montant, commission) VALUES (?,?,?,?,?)',
        [r.insertId, agent_id, formule, montant, Math.round(montant * 0.12)]
      );
      await pool.query(
        'UPDATE agents SET codes_vendus = codes_vendus + 1, revenus_total = revenus_total + ? WHERE id = ?',
        [montant, agent_id]
      );
    }
    res.status(201).json({ code, formule, montant, expiration, duree_h });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/codes/bulk', authMiddleware(['admin']), async (req, res) => {
  try {
    const { formule, quantite = 1, montant, agent_id = null } = req.body;
    const qte = Math.min(Math.max(parseInt(quantite, 10) || 1, 1), 50);
    const durees = { journalier: 24, hebdomadaire: 168, mensuel: 720 };
    const tarifs = { journalier: 200, hebdomadaire: 1000, mensuel: 3000 };
    const duree_h = durees[formule];
    if (!duree_h) return res.status(400).json({ error: 'Formule invalide' });

    const agentId = agent_id ? parseInt(agent_id, 10) : null;
    if (agentId) {
      const [agRows] = await pool.query('SELECT id FROM agents WHERE id = ?', [agentId]);
      if (!agRows[0]) return res.status(400).json({ error: 'Agent introuvable' });
    }

    const prix = Number.isFinite(Number(montant)) ? Number(montant) : tarifs[formule];
    const created = [];

    const makeCode = () => Math.random().toString(36).substring(2, 10).toUpperCase();

    for (let i = 0; i < qte; i += 1) {
      const expiration = new Date(Date.now() + duree_h * 3600 * 1000);
      let inserted = false;
      let attempts = 0;

      while (!inserted && attempts < 5) {
        attempts += 1;
        const code = makeCode();
        try {
          const [r] = await pool.query(
            'INSERT INTO codes_acces (code, formule, montant, duree_h, agent_id, expiration) VALUES (?,?,?,?,?,?)',
            [code, formule, prix, duree_h, agentId, expiration]
          );

          if (agentId) {
            await pool.query(
              'INSERT INTO ventes (code_id, agent_id, formule, montant, commission) VALUES (?,?,?,?,?)',
              [r.insertId, agentId, formule, prix, Math.round(prix * 0.12)]
            );
            await pool.query(
              'UPDATE agents SET codes_vendus = codes_vendus + 1, revenus_total = revenus_total + ? WHERE id = ?',
              [prix, agentId]
            );
          }

          created.push({ code, formule, montant: prix, expiration, duree_h });
          inserted = true;
        } catch (err) {
          if (err.code !== 'ER_DUP_ENTRY') throw err;
        }
      }
    }

    res.status(201).json({ quantite: created.length, codes: created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agent/ventes', authMiddleware(['agent','admin']), async (req, res) => {
  try {
    const [ag] = await pool.query('SELECT id FROM agents WHERE user_id = ?', [req.user.id]);
    const agent_id = ag[0]?.id;
    if (!agent_id) return res.json([]);
    const [rows] = await pool.query(
      `SELECT v.*, ca.code FROM ventes v
       JOIN codes_acces ca ON ca.id = v.code_id
       WHERE v.agent_id = ? ORDER BY v.created_at DESC LIMIT 50`,
      [agent_id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/agent/pannes', authMiddleware(['agent','admin']), async (req, res) => {
  try {
    const { borne_id, description, photo_url } = req.body;
    const [ag] = await pool.query('SELECT id FROM agents WHERE user_id = ?', [req.user.id]);
    await pool.query(
      'INSERT INTO incidents (borne_id, agent_id, description, photo_url) VALUES (?,?,?,?)',
      [borne_id, ag[0]?.id, description, photo_url || null]
    );
    await pool.query('UPDATE bornes SET statut = "panne", updated_at = NOW() WHERE id = ?', [borne_id]);
    await pool.query(
      'INSERT INTO alertes (borne_id, type, message) VALUES (?,?,?)',
      [borne_id, 'panne', `Panne signalée : ${description?.substring(0,100)}`]
    );
    res.status(201).json({ message: 'Incident signalé' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// UTILISATEUR — Connexion par code
// ═══════════════════════════════════════════════════════════════

app.post('/api/user/connexion', async (req, res) => {
  try {
    const { code, mac_address } = req.body;
    const [rows] = await pool.query(
      'SELECT * FROM codes_acces WHERE code = ? AND utilise = 0 AND expiration > NOW()',
      [code]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Code invalide ou expiré' });

    await pool.query(
      'UPDATE codes_acces SET utilise = 1, mac_address = ? WHERE code = ?',
      [mac_address, code]
    );
    res.json({ message: 'Connexion autorisée', formule: rows[0].formule, expiration: rows[0].expiration });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/feedback', async (req, res) => {
  try {
    const { note, commentaire, borne_id } = req.body;
    await pool.query(
      'INSERT INTO feedbacks (note, commentaire, borne_id) VALUES (?,?,?)',
      [Math.min(5, Math.max(1, parseInt(note))), commentaire, borne_id]
    );
    res.json({ message: 'Merci pour votre retour' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// IoT — Heartbeat bornes
// ═══════════════════════════════════════════════════════════════

app.post('/api/monitor/heartbeat', async (req, res) => {
  try {
    const { borne_id, batterie_pct, signal_dbm, users_connectes, tension_v, temp_c } = req.body;
    await pool.query(
      'INSERT INTO telemetrie (borne_id, batterie_pct, signal_dbm, users_connectes, tension_v, temp_c) VALUES (?,?,?,?,?,?)',
      [borne_id, batterie_pct, signal_dbm, users_connectes || 0, tension_v || null, temp_c || null]
    );
    await pool.query(
      'UPDATE bornes SET batterie_pct = ?, users_connectes = ?, updated_at = NOW() WHERE id = ?',
      [batterie_pct, users_connectes || 0, borne_id]
    );
    if (batterie_pct < 15) {
      await pool.query(
        'INSERT INTO alertes (borne_id, type, message) VALUES (?,?,?)',
        [borne_id, 'batterie', `Batterie critique : ${batterie_pct}%`]
      );
    }
    res.json({ ack: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fichiers statiques (dashboard + test) ────────────────────
const path = require("path");
app.use(express.static(path.join(__dirname)));

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connectée', ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', db: dbErrorMessage(e) });
  }
});

// ─── Démarrage ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Village Connecté API — port ${PORT}`));
