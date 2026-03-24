# Village Connecte

Application Node.js + MySQL avec dashboard web admin.

## Structure

- `backend/`: API Node.js (Express), scripts de test, Dockerfile, dependances
- `frontend/`: interface web (dashboard admin)
	- `index.html`: structure de page
	- `app.js`: logique frontend (aucun script inline)
- `database_complete.sql`: schema + donnees initiales MySQL
- `docker-compose.yml`: orchestration db + phpMyAdmin + backend

## Stack

- Backend: Express (API + fichiers statiques)
- Base de donnees: MySQL 8
- Visualisation DB: phpMyAdmin
- Frontend: index.html (dashboard admin)

## Lancement rapide (Docker)

1. Demarrer les services:

```bash
docker compose up --build
```

2. Ouvrir l'application:

- Dashboard/API: http://localhost:3000
- phpMyAdmin: http://localhost:8080

3. Connexion dashboard admin:

- Email: admin@villageconnecte.ci
- Mot de passe: Admin@2025

4. Connexion phpMyAdmin:

- Serveur: db (si vous etes dans le conteneur phpMyAdmin) ou localhost
- Utilisateur: root
- Mot de passe: root
- Base: village_connecte

## Notes importantes

- Le script SQL est importe automatiquement au premier demarrage de MySQL via `database_complete.sql`.
- Les handlers inline (`onclick`/`oninput`) ont ete supprimes; les evenements sont geres dans `frontend/app.js`.
- La CSP est stricte pour les scripts (`script-src 'self'`, sans `unsafe-inline`).
- Si vous devez reinitialiser totalement les donnees:

```bash
docker compose down -v
docker compose up --build
```

## Lancement local sans Docker

1. Installer les dependances:

```bash
cd backend
npm install
```

2. Copier `backend/.env.example` en `backend/.env` puis adapter les valeurs.

3. Importer la base MySQL avec `database_complete.sql`.

4. Demarrer:

```bash
cd backend
npm start
```
