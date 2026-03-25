# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Village Connecté — plateforme de gestion de bornes Wi-Fi solaires pour villages ruraux (Côte d'Ivoire). Dashboard admin + API REST + système de vouchers Wi-Fi.

## Commandes

```bash
# Lancement Docker (méthode principale)
docker compose up --build          # démarre MySQL + phpMyAdmin + backend
docker compose down -v             # arrêt + suppression des volumes (reset DB)

# Lancement local sans Docker
cd backend && npm install
cp .env.example .env               # adapter les valeurs
npm start                          # production (node server.js)
npm run dev                        # développement (nodemon)

# Tests E2E (nécessitent le backend + DB actifs)
node backend/scripts/e2e-test.js
node backend/scripts/e2e-user-monitor.js
```

Accès : dashboard http://localhost:3000, phpMyAdmin http://localhost:8080

## Architecture

Le projet est un **monolithe Express** avec frontend vanilla JS servi en statique.

- **`backend/server.js`** — Fichier unique contenant toute l'API : routes, middlewares (helmet, CORS, rate-limit), pool MySQL, auth JWT. C'est le point d'entrée principal.
- **`server.js` (racine)** — Copie légèrement différente du serveur (sans CSP strict, sert les fichiers statiques depuis `__dirname` au lieu de `../frontend`). Le Docker utilise `backend/server.js`.
- **`frontend/`** — SPA vanilla : `index.html` (structure) + `app.js` (toute la logique). Pas de bundler, pas de framework.
- **`database_complete.sql`** — Schéma complet MySQL + données de seed. Importé automatiquement au premier `docker compose up`.

## Modèle de données (tables principales)

`sites` → `bornes` → `connexions` / `telemetrie` / `alertes`
`users` (auth commune admin/agent/utilisateur) → `agents` / `utilisateurs`
`agents` → `codes_acces` (vouchers) → `ventes`
`feedbacks`, `incidents`

## API — Groupes de routes

Toutes les routes sont préfixées `/api/`. Auth via JWT Bearer token.

| Préfixe | Auth | Rôle |
|---------|------|------|
| `/api/auth/login` | Non | — |
| `/api/admin/*` | Oui | admin |
| `/api/agent/*` | Oui | agent ou admin |
| `/api/user/*` | Non | — |
| `/api/monitor/heartbeat` | Non | IoT bornes |
| `/api/health` | Non | — |

## Points d'attention

- **Deux `server.js`** existent (racine et `backend/`). Le fichier dans `backend/` est la version de référence avec CSP strict. Le fichier racine est une variante legacy.
- La CSP interdit `unsafe-inline` pour les scripts — tout JS doit être dans des fichiers séparés, pas d'attributs `onclick`/`oninput` dans le HTML.
- Les variables d'environnement sont dans `backend/.env` (copier `.env.example`). `JWT_SECRET` et credentials DB sont requis.
- La commission agent est calculée à 12% du montant (`Math.round(montant * 0.12)`).
- Formules voucher : journalier (24h/200 FCFA), hebdomadaire (168h/1000 FCFA), mensuel (720h/3000 FCFA).
