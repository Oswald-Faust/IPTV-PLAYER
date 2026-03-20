# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commandes

```bash
# Développement local (redémarrage automatique)
npm run dev

# Production locale
npm start
# → http://localhost:3000

# Déploiement Vercel
vercel --prod
```

Le port est configurable via la variable `PORT` (défaut : 3000).

## Variables d'environnement

Créer un `.env` à la racine (voir `.env.example`) :

```
IPTV_URL=http://<serveur-iptv>
IPTV_USER=<username>
IPTV_PASS=<password>
PORT=3000
```

Sur Vercel, ces variables sont à définir dans **Settings → Environment Variables** du projet.

## Architecture

### Vue d'ensemble

```
Navigateur (public/)
    ↕ fetch /api/*
Backend Express (server.js)  ← proxy
    ↕ HTTP player_api.php
Serveur IPTV Xtream Codes
```

Le backend ne fait **aucune mise en cache** : chaque appel `/api/*` déclenche une requête vers le serveur IPTV. Les chaînes live peuvent retourner plus de 10 000 entrées d'un coup.

### Backend — `server.js`

Point d'entrée unique. Toutes les routes sont des proxies vers `player_api.php` via la fonction `xtream(action, extra)`. Un `User-Agent` navigateur est obligatoire dans les headers — sans lui le serveur IPTV répond 401.

| Route | Action Xtream | Notes |
|---|---|---|
| `GET /api/info` | *(aucune)* | Infos compte + serveur |
| `GET /api/categories` | `get_live_categories` | |
| `GET /api/channels[?category_id]` | `get_live_streams` | |
| `GET /api/epg?stream_id&limit` | `get_short_epg` | Titres en base64 |
| `GET /api/vod/categories` | `get_vod_categories` | |
| `GET /api/vod[?category_id]` | `get_vod_streams` | |
| `GET /api/series[?category_id]` | `get_series` | |
| `GET /api/stream-url/:id` | — | Construit l'URL HLS `.m3u8` |
| `GET /api/vod-url/:id?ext` | — | Construit l'URL VOD (mp4/mkv…) |
| `GET /proxy/live/:id` | — | Proxy flux HLS (fallback CORS) |

URL des flux générées côté serveur (jamais exposées directement au client) :
- Live : `{BASE}/live/{USER}/{PASS}/{stream_id}.m3u8`
- VOD  : `{BASE}/movie/{USER}/{PASS}/{stream_id}.{ext}`

`server.js` exporte `app` sans appeler `.listen()` lorsqu'il est `require()`-é (nécessaire pour Vercel serverless). `.listen()` n'est appelé que si le fichier est exécuté directement.

### Frontend — `public/`

Vanilla JS, aucun framework, aucun bundler. Tout le JS est dans `public/js/app.js`.

**État global** (variables module-level dans `app.js`) :
- `allItems` — tableau courant de chaînes/films/séries affiché
- `currentSection` — `'live'` | `'vod'` | `'series'`
- `currentChannel` — item en cours de lecture
- `hlsInstance` — instance `hls.js` active (à détruire avant d'en créer une nouvelle)

**Flux de navigation** :
1. `init()` → `loadAccountInfo()` + `loadCategories()` + `loadContent()`
2. Clic section → `switchSection()` → recharge catégories + contenu
3. Clic catégorie → `selectCategory()` → `loadContent(categoryId)`
4. Clic carte → `startPlayback(item)` → `loadStream()` + `loadEPG()`

**Lecture vidéo** :
- Live : `hls.js` (ou HLS natif Safari) via URL `.m3u8`
- VOD : `<video src>` direct (mp4/mkv)
- En cas d'erreur HLS fatale réseau → `hlsInstance.startLoad()` (retry automatique)
- En cas d'autre erreur fatale → affiche `#video-error` avec bouton retry

**EPG** : les titres sont encodés en base64 côté Xtream Codes. `safeDecode()` fait `atob()` avec fallback sur la valeur brute.

### Déploiement Vercel

`vercel.json` route 100 % du trafic vers `server.js` (y compris les fichiers statiques, servis par `express.static`). Le proxy `/proxy/live/:id` (pipe de stream) peut expirer sur le plan Hobby (timeout 10 s) — ce n'est qu'un fallback CORS, la lecture directe ne passe pas par ce proxy.
