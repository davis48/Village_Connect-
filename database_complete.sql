-- ╔══════════════════════════════════════════════════════════════════╗
-- ║   VILLAGE CONNECTÉ — BASE DE DONNÉES COMPLÈTE                   ║
-- ║   Alignée sur dashboard-admin.html                              ║
-- ║   MySQL 8.0+ · Hostinger · utf8mb4                              ║
-- ╚══════════════════════════════════════════════════════════════════╝

CREATE DATABASE IF NOT EXISTS village_connecte
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE village_connecte;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS
  agent_bornes, feedbacks, telemetrie, alertes,
  connexions, codes_acces, ventes,
  incidents, utilisateurs, agents, users, bornes, sites;
SET FOREIGN_KEY_CHECKS = 1;


-- ════════════════════════════════════════════════════════════════════
-- 1. SITES  (villages pilotes — extensible au-delà de Dioradougou)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE sites (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(100)    NOT NULL,                  -- "Dioradougou"
  commune     VARCHAR(100),                              -- commune / sous-préfecture
  region      VARCHAR(100),                              -- région administrative
  latitude    DECIMAL(10,7),
  longitude   DECIMAL(10,7),
  actif       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT NOW(),
  updated_at  DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW()
);


-- ════════════════════════════════════════════════════════════════════
-- 2. BORNES  (page "Bornes & points d'accès" + carte + modal détail)
--    Champs : num, nom, zone, lat/lon, bat, users, type, statut, ip
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE bornes (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  site_id         INT UNSIGNED        NOT NULL,
  numero          TINYINT UNSIGNED    NOT NULL,          -- 1..13  (colonne "N°")
  nom             VARCHAR(100)        NOT NULL,          -- "Borne-01", "Borne-08 HUB"
  zone            VARCHAR(100)        NOT NULL,          -- "Est", "Ouest", …
  latitude        DECIMAL(10,7)       NOT NULL,          -- GPS terrain
  longitude       DECIMAL(10,7)       NOT NULL,
  type_noeud      ENUM(
                    'Repeteur',
                    'Noeud central',
                    'HUB principal',
                    'Borne principale'
                  )                   NOT NULL DEFAULT 'Repeteur',
  puissance_w     TINYINT UNSIGNED    NOT NULL DEFAULT 20, -- panneau solaire (W)
  hauteur_mat_m   TINYINT UNSIGNED    NOT NULL DEFAULT 4,  -- hauteur mât (m)
  ip_locale       VARCHAR(20),                           -- "192.168.1.X"
  mac_adresse     VARCHAR(17),                           -- "AA:BB:CC:DD:EE:FF"
  statut          ENUM('actif','panne','maintenance')
                                      NOT NULL DEFAULT 'actif',
  batterie_pct    TINYINT UNSIGNED    NOT NULL DEFAULT 100, -- colonne "Batterie"
  users_connectes SMALLINT UNSIGNED   NOT NULL DEFAULT 0,   -- colonne "Connectés"
  created_at      DATETIME            NOT NULL DEFAULT NOW(),
  updated_at      DATETIME            NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  UNIQUE KEY uq_site_numero (site_id, numero),
  CONSTRAINT fk_bornes_site FOREIGN KEY (site_id) REFERENCES sites(id)
);


-- ════════════════════════════════════════════════════════════════════
-- 3. USERS  (table centrale auth — admin + agents + utilisateurs)
--    Écrans : login, sidebar (nom/rôle), page agents, page utilisateurs
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom             VARCHAR(150)    NOT NULL,              -- "Kouamé Brou"
  email           VARCHAR(191)    UNIQUE,                -- login admin/agent
  telephone       VARCHAR(25),                           -- "+225 07 12 34 56"
  password_hash   VARCHAR(255),                          -- bcrypt (null = utilisateur sans compte)
  role            ENUM('admin','agent','utilisateur')
                                  NOT NULL DEFAULT 'utilisateur',
  statut          ENUM('actif','inactif','formation','suspendu')
                                  NOT NULL DEFAULT 'actif',
  created_at      DATETIME        NOT NULL DEFAULT NOW(),
  updated_at      DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW()
);


-- ════════════════════════════════════════════════════════════════════
-- 4. AGENTS  (page "Agents locaux" — vue enrichie de users WHERE role='agent')
--    Champs : zone, codes (compteur), revenus (calculé), bornes assignées
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE agents (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED    NOT NULL UNIQUE,
  zone            VARCHAR(100)    NOT NULL,              -- "Centre", "Nord", …
  codes_vendus    INT UNSIGNED    NOT NULL DEFAULT 0,    -- colonne "Codes vendus"
  revenus_total   DECIMAL(12,0)   NOT NULL DEFAULT 0,    -- colonne "Revenus" (FCFA)
  created_at      DATETIME        NOT NULL DEFAULT NOW(),
  updated_at      DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  CONSTRAINT fk_agents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bornes assignées à un agent (multi-sélection dans le modal)
CREATE TABLE agent_bornes (
  agent_id    INT UNSIGNED NOT NULL,
  borne_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (agent_id, borne_id),
  CONSTRAINT fk_ab_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  CONSTRAINT fk_ab_borne FOREIGN KEY (borne_id) REFERENCES bornes(id) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════════════
-- 5. UTILISATEURS  (page "Utilisateurs finaux")
--    Champs : nom, tel, last_connexion, borne courante, formule active, statut
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE utilisateurs (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED    NOT NULL UNIQUE,
  borne_id            INT UNSIGNED,                      -- borne courante
  formule_active      ENUM('journalier','hebdomadaire','mensuel'),
  statut_connexion    ENUM('connecte','inactif','expire')
                                      NOT NULL DEFAULT 'inactif',
  derniere_connexion  DATETIME,                          -- colonne "Dernière connexion"
  mac_address         VARCHAR(17),                       -- identifiant appareil
  created_at          DATETIME        NOT NULL DEFAULT NOW(),
  updated_at          DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  CONSTRAINT fk_util_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_util_borne FOREIGN KEY (borne_id) REFERENCES bornes(id) ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════
-- 6. CODES D'ACCÈS / VOUCHERS
--    Écran "Vouchers Wi-Fi" : formule, quantité, agent, code affiché, export CSV
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE codes_acces (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)     NOT NULL UNIQUE,           -- ex. "A3F9KZ2B"
  formule     ENUM('journalier','hebdomadaire','mensuel')
                              NOT NULL,
  montant     DECIMAL(10,0)   NOT NULL,                  -- 200 / 1000 / 3000 FCFA
  duree_h     SMALLINT UNSIGNED NOT NULL,                -- 24 / 168 / 720
  agent_id    INT UNSIGNED,                              -- agent qui l'a généré
  utilise     TINYINT(1)      NOT NULL DEFAULT 0,
  utilisateur_id INT UNSIGNED,                           -- qui l'a utilisé
  borne_id    INT UNSIGNED,                              -- borne d'entrée
  mac_address VARCHAR(17),
  expiration  DATETIME        NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_code_agent  FOREIGN KEY (agent_id)       REFERENCES agents(id)       ON DELETE SET NULL,
  CONSTRAINT fk_code_util   FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL,
  CONSTRAINT fk_code_borne  FOREIGN KEY (borne_id)       REFERENCES bornes(id)       ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════
-- 7. VENTES  (page "Revenus" — tableau historique transactions)
--    Colonnes affichées : date/heure, agent, formule, code, montant
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE ventes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code_id     INT UNSIGNED    NOT NULL,                  -- lien vers codes_acces
  agent_id    INT UNSIGNED    NOT NULL,
  formule     ENUM('journalier','hebdomadaire','mensuel') NOT NULL,
  montant     DECIMAL(10,0)   NOT NULL,
  commission  DECIMAL(10,0)   NOT NULL DEFAULT 0,        -- part agent (10-15%)
  created_at  DATETIME        NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_vente_code  FOREIGN KEY (code_id)  REFERENCES codes_acces(id),
  CONSTRAINT fk_vente_agent FOREIGN KEY (agent_id) REFERENCES agents(id)
);


-- ════════════════════════════════════════════════════════════════════
-- 8. CONNEXIONS  (sessions Wi-Fi actives — utilisées pour le KPI
--    "users_connectes" affiché sur chaque borne)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE connexions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id  INT UNSIGNED    NOT NULL,
  borne_id        INT UNSIGNED    NOT NULL,
  code_id         INT UNSIGNED    NOT NULL,
  mac_address     VARCHAR(17),
  debut           DATETIME        NOT NULL DEFAULT NOW(),
  fin             DATETIME,                              -- NULL = session ouverte
  octets_down     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  octets_up       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  actif           TINYINT(1)      NOT NULL DEFAULT 1,

  CONSTRAINT fk_cx_util  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id),
  CONSTRAINT fk_cx_borne FOREIGN KEY (borne_id)       REFERENCES bornes(id),
  CONSTRAINT fk_cx_code  FOREIGN KEY (code_id)        REFERENCES codes_acces(id)
);


-- ════════════════════════════════════════════════════════════════════
-- 9. TÉLÉMÉTRIE  (heartbeat IoT → données en temps réel affichées
--    dans le modal "Détail borne" : batterie %, signal dBm, connectés)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE telemetrie (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  borne_id        INT UNSIGNED    NOT NULL,
  batterie_pct    TINYINT UNSIGNED,                      -- 0-100
  signal_dbm      SMALLINT,                              -- ex. -72 dBm
  users_connectes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tension_v       DECIMAL(5,2),                          -- tension batterie (V)
  temp_c          DECIMAL(4,1),                          -- température boîtier
  created_at      DATETIME        NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_tele_borne FOREIGN KEY (borne_id) REFERENCES bornes(id) ON DELETE CASCADE,
  INDEX idx_tele_borne_time (borne_id, created_at DESC)
);


-- ════════════════════════════════════════════════════════════════════
-- 10. ALERTES  (page "Alertes système")
--     Colonnes : heure, borne, type, message, statut lu/non-lu
--     Types : batterie | panne | signal | fraude  (+ badge couleur)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE alertes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  borne_id    INT UNSIGNED    NOT NULL,
  type        ENUM('batterie','panne','signal','fraude','autre')
                              NOT NULL,
  message     TEXT            NOT NULL,                  -- colonne "Message"
  lu          TINYINT(1)      NOT NULL DEFAULT 0,        -- badge "Non lu" / "Lu"
  acquittee   TINYINT(1)      NOT NULL DEFAULT 0,        -- traitée par admin
  created_at  DATETIME        NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_alerte_borne FOREIGN KEY (borne_id) REFERENCES bornes(id) ON DELETE CASCADE,
  INDEX idx_alertes_lu (lu),
  INDEX idx_alertes_borne (borne_id)
);


-- ════════════════════════════════════════════════════════════════════
-- 11. INCIDENTS  (bouton "Signaler panne" dans modal détail borne)
--     Signalés par les agents, suivis par l'admin
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE incidents (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  borne_id    INT UNSIGNED    NOT NULL,
  agent_id    INT UNSIGNED,
  description TEXT,
  photo_url   VARCHAR(500),
  statut      ENUM('ouvert','en_cours','resolu')
                              NOT NULL DEFAULT 'ouvert',
  created_at  DATETIME        NOT NULL DEFAULT NOW(),
  resolu_at   DATETIME,

  CONSTRAINT fk_inc_borne FOREIGN KEY (borne_id) REFERENCES bornes(id),
  CONSTRAINT fk_inc_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════
-- 12. FEEDBACKS  (bouton "Feedback" dans l'interface utilisateur)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE feedbacks (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED,
  borne_id    INT UNSIGNED,
  note        TINYINT UNSIGNED NOT NULL DEFAULT 1,       -- 1 à 5 (validé côté app)
  commentaire TEXT,
  created_at  DATETIME        NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_fb_util  FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL,
  CONSTRAINT fk_fb_borne FOREIGN KEY (borne_id)       REFERENCES bornes(id)       ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════
-- VUES UTILES  (alimentent directement les KPIs du dashboard)
-- ════════════════════════════════════════════════════════════════════

-- KPI "Bornes actives / en panne"
CREATE OR REPLACE VIEW v_kpi_bornes AS
SELECT
  COUNT(*)                                   AS total,
  SUM(statut = 'actif')                      AS actives,
  SUM(statut = 'panne')                      AS en_panne,
  SUM(statut = 'maintenance')                AS maintenance
FROM bornes;

-- KPI "Revenus ce mois / trimestre / total"
CREATE OR REPLACE VIEW v_kpi_revenus AS
SELECT
  SUM(montant)                                                   AS total,
  SUM(IF(created_at >= DATE_FORMAT(NOW(),'%Y-%m-01'), montant, 0)) AS ce_mois,
  SUM(IF(created_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH), montant, 0)) AS trimestre
FROM ventes;

-- KPI "Vouchers : total / utilisés / disponibles"
CREATE OR REPLACE VIEW v_kpi_vouchers AS
SELECT
  COUNT(*)                    AS total_generes,
  SUM(utilise = 1)            AS utilises,
  SUM(utilise = 0 AND expiration > NOW()) AS disponibles,
  SUM(utilise = 0 AND expiration <= NOW()) AS expires
FROM codes_acces;

-- Tableau "Agents" enrichi (page agents)
CREATE OR REPLACE VIEW v_agents_dashboard AS
SELECT
  a.id,
  u.nom, u.email, u.telephone, u.statut,
  a.zone, a.codes_vendus, a.revenus_total,
  COUNT(ab.borne_id) AS nb_bornes_assignees
FROM agents a
JOIN users u  ON u.id = a.user_id
LEFT JOIN agent_bornes ab ON ab.agent_id = a.id
GROUP BY a.id, u.nom, u.email, u.telephone, u.statut, a.zone, a.codes_vendus, a.revenus_total;

-- Tableau "Bornes" complet (page bornes)
CREATE OR REPLACE VIEW v_bornes_dashboard AS
SELECT
  b.*,
  s.nom AS site_nom,
  (SELECT COUNT(*) FROM connexions c WHERE c.borne_id = b.id AND c.actif = 1) AS connexions_actives,
  (SELECT batterie_pct FROM telemetrie t WHERE t.borne_id = b.id ORDER BY t.created_at DESC LIMIT 1) AS bat_live,
  (SELECT signal_dbm   FROM telemetrie t WHERE t.borne_id = b.id ORDER BY t.created_at DESC LIMIT 1) AS signal_live
FROM bornes b
JOIN sites s ON s.id = b.site_id;

-- Tableau "Utilisateurs finaux"
CREATE OR REPLACE VIEW v_utilisateurs_dashboard AS
SELECT
  u.id, usr.nom, usr.telephone,
  u.formule_active, u.statut_connexion,
  u.derniere_connexion,
  b.nom AS borne_nom
FROM utilisateurs u
JOIN users usr ON usr.id = u.user_id
LEFT JOIN bornes b ON b.id = u.borne_id;

-- Tableau "Alertes" (page alertes + widget dashboard)
CREATE OR REPLACE VIEW v_alertes_dashboard AS
SELECT
  a.id, a.type, a.message, a.lu, a.acquittee,
  a.created_at,
  b.nom  AS borne_nom,
  b.zone AS borne_zone
FROM alertes a
JOIN bornes b ON b.id = a.borne_id
ORDER BY a.created_at DESC;

-- Historique transactions (page revenus)
CREATE OR REPLACE VIEW v_ventes_dashboard AS
SELECT
  v.id, v.formule, v.montant, v.commission,
  v.created_at,
  ca.code,
  u.nom  AS agent_nom,
  u.email AS agent_email
FROM ventes v
JOIN codes_acces ca ON ca.id = v.code_id
JOIN agents ag      ON ag.id = v.agent_id
JOIN users u        ON u.id  = ag.user_id
ORDER BY v.created_at DESC;


-- ════════════════════════════════════════════════════════════════════
-- DONNÉES INITIALES
-- ════════════════════════════════════════════════════════════════════

-- Site pilote
INSERT INTO sites (nom, commune, region, latitude, longitude) VALUES
('Dioradougou', 'Man', 'Tonkpi', 7.7842113, -7.8816685);

-- Compte admin  (mot de passe : Admin@2025 — À changer)
INSERT INTO users (nom, email, telephone, password_hash, role, statut) VALUES
('Administrateur', 'admin@villageconnecte.ci', NULL,
 '$2a$10$yY19iBlR6eZBVOeDBIdN4OnITKLH6t9UWWjzBq5XjEvF8b.IFGVaG',
 'admin', 'actif');

-- 13 bornes (GPS relevés terrain — image WhatsApp du 19/03/2026)
INSERT INTO bornes
  (site_id, numero, nom, zone, latitude, longitude, type_noeud, puissance_w, hauteur_mat_m, ip_locale, statut, batterie_pct, users_connectes)
VALUES
  (1,  1, 'Borne-01',     'Est',           7.78421, -7.87200, 'Borne principale', 20, 4, '192.168.1.1',  'actif',  78,  12),
  (1,  2, 'Borne-02',     'Centre-Est',    7.78350, -7.87500, 'Repeteur',         20, 4, '192.168.1.2',  'actif',  91,   8),
  (1,  3, 'Borne-03',     'Sud',           7.78100, -7.87800, 'Repeteur',         20, 4, '192.168.1.3',  'panne',   0,   0),
  (1,  4, 'Borne-04',     'Centre-Sud',    7.78150, -7.88167, 'Noeud central',     30, 6, '192.168.1.4',  'actif',  65,  19),
  (1,  5, 'Borne-05',     'Centre',        7.78300, -7.88300, 'Repeteur',         20, 4, '192.168.1.5',  'actif',  82,  31),
  (1,  6, 'Borne-06',     'Centre-Ouest',  7.78280, -7.88500, 'Noeud central',     30, 6, '192.168.1.6',  'actif',  74,  15),
  (1,  7, 'Borne-07',     'Nord-Ouest',    7.78700, -7.88600, 'Repeteur',         20, 4, '192.168.1.7',  'actif',  43,   7),
  (1,  8, 'Borne-08 HUB', 'Ouest',         7.78421, -7.88700, 'HUB principal',    50, 8, '192.168.1.8',  'actif',  95,  45),
  (1,  9, 'Borne-09',     'Sud-Ouest',     7.78050, -7.88750, 'Repeteur',         20, 4, '192.168.1.9',  'panne',  12,   0),
  (1, 10, 'Borne-10',     'Sud-Est',       7.78150, -7.87700, 'Repeteur',         20, 4, '192.168.1.10', 'actif',  88,  22),
  (1, 11, 'Borne-11',     'Nord-Centre',   7.78550, -7.88100, 'Repeteur',         20, 4, '192.168.1.11', 'actif',  67,  14),
  (1, 12, 'Borne-12',     'Nord',          7.78750, -7.88100, 'Repeteur',         20, 4, '192.168.1.12', 'actif',  55,   9),
  (1, 13, 'Borne-13',     'Extrême-Nord',  7.78950, -7.88167, 'Repeteur',         20, 4, '192.168.1.13', 'actif',  70,   5);

-- Agents (users + agents + agent_bornes)
INSERT INTO users (nom, email, telephone, password_hash, role, statut) VALUES
  ('Kouamé Brou',  'k.brou@vc.ci',   '+225 07 12 34 56', '$2b$10$placeholder_hash', 'agent', 'actif'),
  ('Fatou Diallo', 'f.diallo@vc.ci', '+225 05 98 76 54', '$2b$10$placeholder_hash', 'agent', 'actif'),
  ('Ibrahim Koné', 'i.kone@vc.ci',   '+225 01 23 45 67', '$2b$10$placeholder_hash', 'agent', 'actif'),
  ('Mariam Touré', 'm.toure@vc.ci',  '+225 07 65 43 21', '$2b$10$placeholder_hash', 'agent', 'formation');

INSERT INTO agents (user_id, zone, codes_vendus, revenus_total) VALUES
  (2, 'Centre',    312, 124800),
  (3, 'Nord',      287,  98600),
  (4, 'Sud-Ouest', 195,  71200),
  (5, 'Est',       100,  37400);

INSERT INTO agent_bornes (agent_id, borne_id) VALUES
  (1, 5),(1, 6),(1, 8),   -- Kouamé : Centre + Ouest
  (2,11),(2,12),(2,13),   -- Fatou  : Nord
  (3, 9),(3, 3),(3, 4),   -- Ibrahim: Sud-Ouest + Sud
  (4, 1),(4, 2),(4,10);   -- Mariam : Est

-- Utilisateurs finaux (users + utilisateurs)
INSERT INTO users (nom, email, telephone, role, statut) VALUES
  ('Bamba Coulibaly', NULL, '+225 07 11 22 33', 'utilisateur', 'actif'),
  ('Aminata Sanogo',  NULL, '+225 05 44 55 66', 'utilisateur', 'actif'),
  ('Youssouf Traoré', NULL, '+225 01 77 88 99', 'utilisateur', 'inactif'),
  ('Nadia Koffi',     NULL, '+225 07 00 11 22', 'utilisateur', 'actif'),
  ('Sékou Ouattara',  NULL, '+225 05 33 44 55', 'utilisateur', 'actif'),
  ('Ramatou Barry',   NULL, '+225 01 55 66 77', 'utilisateur', 'actif'),
  ('Daouda Konaté',   NULL, '+225 07 22 33 44', 'utilisateur', 'inactif'),
  ('Marième Cissé',   NULL, '+225 05 66 77 88', 'utilisateur', 'actif');

INSERT INTO utilisateurs
  (user_id, borne_id, formule_active, statut_connexion, derniere_connexion)
VALUES
  (6,  5, 'journalier',   'connecte',  NOW() - INTERVAL 2 HOUR),
  (7,  8, 'mensuel',      'connecte',  NOW() - INTERVAL 3 HOUR),
  (8,  1, 'hebdomadaire', 'inactif',   NOW() - INTERVAL 1 DAY),
  (9,  4, 'journalier',   'connecte',  NOW() - INTERVAL 4 HOUR),
  (10, 2, 'journalier',   'expire',    NOW() - INTERVAL 2 DAY),
  (11,10, 'mensuel',      'connecte',  NOW() - INTERVAL 5 HOUR),
  (12, 6, 'hebdomadaire', 'inactif',   NOW() - INTERVAL 3 DAY),
  (13,11, 'journalier',   'connecte',  NOW() - INTERVAL 1 HOUR);

-- Alertes actives (page alertes + widget dashboard)
INSERT INTO alertes (borne_id, type, message, lu) VALUES
  (9,  'batterie', 'Batterie critique : 12% — intervention urgente', 0),
  (3,  'panne',    'Borne hors ligne — aucun heartbeat depuis 2h14', 0),
  (7,  'signal',   'RSSI -82 dBm — signal dégradé', 1);


-- ════════════════════════════════════════════════════════════════════
-- INDEX SUPPLÉMENTAIRES  (performances requêtes dashboard)
-- ════════════════════════════════════════════════════════════════════
CREATE INDEX idx_bornes_statut      ON bornes(statut);
CREATE INDEX idx_codes_agent        ON codes_acces(agent_id);
CREATE INDEX idx_codes_utilise      ON codes_acces(utilise, expiration);
CREATE INDEX idx_ventes_agent_date  ON ventes(agent_id, created_at);
CREATE INDEX idx_ventes_created     ON ventes(created_at);
CREATE INDEX idx_connexions_borne   ON connexions(borne_id, actif);
CREATE INDEX idx_connexions_util    ON connexions(utilisateur_id);
CREATE INDEX idx_util_statut        ON utilisateurs(statut_connexion);
CREATE INDEX idx_users_role         ON users(role);
