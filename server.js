require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const https   = require('https');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const BASE = process.env.IPTV_URL  || 'http://samlg.top';
const USER = process.env.IPTV_USER || 'testtest1';
const PASS = process.env.IPTV_PASS || 'LTRZm6SJSJDRYB';

// Agent HTTPS sans vérification de certificat (pour logos avec certs invalides)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── Fichiers statiques ──────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper API Xtream Codes ─────────────────────────────────────────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
};

async function xtream(action, extra = {}) {
  const params = new URLSearchParams({ username: USER, password: PASS, ...extra });
  if (action) params.set('action', action);
  const url = `${BASE}/player_api.php?${params.toString()}`;
  const { data } = await axios.get(url, {
    timeout: 20000,
    headers: HEADERS,
    maxRedirects: 5,
  });
  return data;
}

// ── Infos du compte ─────────────────────────────────────────────────────────
app.get('/api/info', async (req, res) => {
  try {
    res.json(await xtream(''));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Catégories Live ─────────────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    res.json(await xtream('get_live_categories'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chaînes Live (toutes ou par catégorie) ──────────────────────────────────
app.get('/api/channels', async (req, res) => {
  try {
    const extra = req.query.category_id ? { category_id: req.query.category_id } : {};
    res.json(await xtream('get_live_streams', extra));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── EPG (programme TV) ──────────────────────────────────────────────────────
app.get('/api/epg', async (req, res) => {
  try {
    const { stream_id, limit = 6 } = req.query;
    if (!stream_id) return res.status(400).json({ error: 'stream_id requis' });
    res.json(await xtream('get_short_epg', { stream_id, limit }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Catégories VOD ──────────────────────────────────────────────────────────
app.get('/api/vod/categories', async (req, res) => {
  try {
    res.json(await xtream('get_vod_categories'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Films VOD (tous ou par catégorie) ───────────────────────────────────────
app.get('/api/vod', async (req, res) => {
  try {
    const extra = req.query.category_id ? { category_id: req.query.category_id } : {};
    res.json(await xtream('get_vod_streams', extra));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Catégories Séries ───────────────────────────────────────────────────────
app.get('/api/series/categories', async (req, res) => {
  try {
    res.json(await xtream('get_series_categories'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Séries (toutes ou par catégorie) ───────────────────────────────────────
app.get('/api/series', async (req, res) => {
  try {
    const extra = req.query.category_id ? { category_id: req.query.category_id } : {};
    res.json(await xtream('get_series', extra));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── URL de flux Live → proxy HLS avec réécriture d'URLs ─────────────────────
app.get('/api/stream-url/:stream_id', (req, res) => {
  res.json({ url: `/proxy/hls/${req.params.stream_id}/playlist.m3u8`, type: 'hls' });
});

// ── URL de flux VOD ─────────────────────────────────────────────────────────
app.get('/api/vod-url/:stream_id', (req, res) => {
  const ext = req.query.ext || 'mp4';
  const url = `/proxy/seg?url=${encodeURIComponent(`${BASE}/movie/${USER}/${PASS}/${req.params.stream_id}.${ext}`)}`;
  res.json({ url, type: 'vod' });
});

// ════════════════════════════════════════════════════════════════════════════
// PROXY HLS COMPLET
// Résout : mixed-content HTTPS→HTTP, CORS, certificats invalides
// ════════════════════════════════════════════════════════════════════════════

// Fetch interne en mode stream — retourne { stream, headers, finalUrl }
async function fetchStream(url) {
  const isHttps = url.startsWith('https');
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: 20000,
    headers: { 'User-Agent': HEADERS['User-Agent'] },
    httpsAgent: isHttps ? httpsAgent : undefined,
    maxRedirects: 10,
  });
  const finalUrl = response.request?.res?.responseUrl
                || response.request?.responseURL
                || url;
  return { stream: response.data, headers: response.headers, finalUrl };
}

// Lit un stream M3U8 et retourne son contenu texte.
// Si le premier octet est 0x47 (sync TS), résout immédiatement avec null.
function readM3U8Stream(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let decided = false;

    readable.on('data', chunk => {
      if (!decided) {
        decided = true;
        if (chunk[0] === 0x47) {
          // Flux TS brut — résoudre avec null pour signaler au caller
          readable.destroy();
          resolve(null);
          return;
        }
      }
      chunks.push(chunk);
    });
    readable.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
    readable.on('error', reject);
  });
}

// Réécriture d'un manifest M3U8 : remplace toutes les URLs par des URLs proxy.
// baseUrl doit être l'URL FINALE après redirections (CDN réel, pas samlg.top).
function rewriteManifest(content, baseUrl) {
  const parsed   = new URL(baseUrl);
  const hostBase = `${parsed.protocol}//${parsed.host}`; // ex: http://2.58.193.142:8000
  const dirBase  = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;

    // Construire l'URL absolue selon le type de chemin
    let abs;
    if (trimmed.startsWith('http')) {
      abs = trimmed;               // déjà absolu
    } else if (trimmed.startsWith('/')) {
      abs = hostBase + trimmed;    // chemin absolu → host du CDN
    } else {
      abs = dirBase + trimmed;     // chemin relatif → dossier du CDN
    }

    if (abs.includes('.m3u8')) {
      return `/proxy/m3u8?url=${encodeURIComponent(abs)}`;
    }
    return `/proxy/seg?url=${encodeURIComponent(abs)}`;
  }).join('\n');
}

// ── Proxy flux live brut (MPEG-TS) ──────────────────────────────────────────
// Suit la redirection 302 de samlg.top et pipe le TS directement au navigateur
app.get('/proxy/stream/:stream_id', async (req, res) => {
  try {
    const targetUrl = `${BASE}/live/${USER}/${PASS}/${req.params.stream_id}.m3u8`;
    const { stream, headers } = await fetchStream(targetUrl);

    res.set('Content-Type', headers['content-type'] || 'video/mp2t');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');

    stream.pipe(res);
    req.on('close', () => stream.destroy());
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: e.message });
  }
});

// Helper partagé : fetch manifest, détecte TS vs M3U8, envoie la réponse
async function serveManifest(sourceUrl, res) {
  const { stream, finalUrl } = await fetchStream(sourceUrl);
  const content = await readM3U8Stream(stream);

  if (content === null) {
    // Le serveur a redirigé vers un flux TS brut — on le pipe directement
    // (nécessite un nouveau fetch car le stream précédent est détruit)
    const { stream: tsStream } = await fetchStream(sourceUrl);
    res.set('Content-Type', 'video/mp2t');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    tsStream.pipe(res);
    return;
  }

  res.set('Content-Type', 'application/vnd.apple.mpegurl');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-cache');
  res.send(rewriteManifest(content, finalUrl));
}

// ── Proxy manifest — playlist principale d'un flux live ─────────────────────
app.get('/proxy/hls/:stream_id/playlist.m3u8', async (req, res) => {
  const sourceUrl = `${BASE}/live/${USER}/${PASS}/${req.params.stream_id}.m3u8`;
  try {
    await serveManifest(sourceUrl, res);
  } catch (e) {
    if (!res.headersSent) res.status(502).send(e.message);
  }
});

// ── Proxy manifest générique (sous-playlists qualité) ───────────────────────
app.get('/proxy/m3u8', async (req, res) => {
  const sourceUrl = decodeURIComponent(req.query.url || '');
  if (!sourceUrl) return res.status(400).end();
  try {
    await serveManifest(sourceUrl, res);
  } catch (e) {
    if (!res.headersSent) res.status(502).send(e.message);
  }
});

// ── Proxy segment vidéo (.ts / .aac / .mp4) ─────────────────────────────────
app.get('/proxy/seg', async (req, res) => {
  const targetUrl = decodeURIComponent(req.query.url || '');
  if (!targetUrl) return res.status(400).end();
  try {
    const { stream, headers } = await fetchStream(targetUrl);
    res.set('Content-Type', headers['content-type'] || 'video/mp2t');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');
    stream.pipe(res);
  } catch (e) {
    res.status(502).end();
  }
});

// ── Proxy image (logos avec certs invalides ou HTTP depuis page HTTPS) ───────
app.get('/proxy/img', async (req, res) => {
  const imgUrl = decodeURIComponent(req.query.url || '');
  if (!imgUrl) return res.status(400).end();
  try {
    const { stream, headers } = await fetchStream(imgUrl);
    res.set('Content-Type', headers['content-type'] || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400'); // cache 24h
    res.set('Access-Control-Allow-Origin', '*');
    stream.pipe(res);
  } catch (e) {
    res.status(404).end(); // image introuvable → placeholder CSS prend le relais
  }
});

// ── Démarrage (local uniquement — Vercel/Koyeb gèrent l'écoute) ─────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🎬 IPTV Player démarré → http://localhost:${PORT}\n`);
  });
}

module.exports = app;
