# 🧤 Mitaines v2

PWA pour arrêter de se ronger les ongles. Self-hosted, FastAPI + React, push notifications VAPID.

## Setup rapide

### 1. Générer les clés VAPID

```bash
# Option A — npx
npx web-push generate-vapid-keys

# Option B — Python
pip install py-vapid
python -c "
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
print('PUBLIC:', v.public_key.public_bytes_raw().hex())
print('PRIVATE:', v.private_pem().decode())
"
```

### 2. Créer le PIN hash

```bash
# Remplace 1234 par ton vrai PIN
echo -n "1234" | sha256sum | cut -d' ' -f1

# Ou en Python
python -c "import hashlib; print(hashlib.sha256(b'1234').hexdigest())"
```

### 3. Configurer l'environnement

```bash
cp .env.example .env
# Édite .env et remplis PIN_HASH, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
```

### 4. Lancer

```bash
docker compose up -d --build
```

L'app est disponible sur **http://localhost:3000**

---

## Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `PIN_HASH` | SHA-256 du PIN 4 chiffres | — |
| `VAPID_PUBLIC_KEY` | Clé publique VAPID (base64url) | — |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID (PEM) | — |
| `VAPID_EMAIL` | Email pour VAPID | `mailto:admin@example.com` |
| `PINGS_PER_DAY` | Nombre de pings quotidiens | `5` |
| `LAPTOP_GOAL_DAYS` | Objectif streak (jours) | `90` |

---

## Architecture

```
backend/   FastAPI + SQLite (aiosqlite) + APScheduler
frontend/  React + Vite + Recharts, servi par nginx
```

- Nginx proxie `/api/*` vers le backend (réseau Docker interne)
- Données persistées dans le volume Docker `mitaines-data`
- Export JSON via `GET /api/v1/export`

## Endpoints API

```
POST /api/v1/auth/verify
POST /api/v1/checkins
GET  /api/v1/stats/summary
GET  /api/v1/stats/daily
GET  /api/v1/stats/heatmap
GET  /api/v1/stats/hourly
GET  /api/v1/stats/context
GET  /api/v1/insights
GET  /api/v1/days/{date}
GET  /api/v1/milestones
GET  /api/v1/push/vapid-public-key
POST /api/v1/push/subscribe
GET  /api/v1/export
```
