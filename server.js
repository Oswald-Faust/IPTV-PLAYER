require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const BASE = process.env.IPTV_URL  || 'http://samlg.top';
const USER = process.env.IPTV_USER || 'testtest1';
const PASS = process.env.IPTV_PASS || 'LTRZm6SJSJDRYB';

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

// ── URL de flux Live ────────────────────────────────────────────────────────
app.get('/api/stream-url/:stream_id', (req, res) => {
  const url = `${BASE}/live/${USER}/${PASS}/${req.params.stream_id}.m3u8`;
  res.json({ url, type: 'hls' });
});

// ── URL de flux VOD ─────────────────────────────────────────────────────────
app.get('/api/vod-url/:stream_id', (req, res) => {
  const ext = req.query.ext || 'mp4';
  const url = `${BASE}/movie/${USER}/${PASS}/${req.params.stream_id}.${ext}`;
  res.json({ url, type: 'vod' });
});

// ── Proxy de flux (fallback si CORS bloqué) ─────────────────────────────────
app.get('/proxy/live/:stream_id', async (req, res) => {
  try {
    const target = `${BASE}/live/${USER}/${PASS}/${req.params.stream_id}.m3u8`;
    const upstream = await axios.get(target, {
      responseType: 'stream',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.set('Access-Control-Allow-Origin', '*');
    upstream.data.pipe(res);
  } catch (e) {
    res.status(502).json({ error: 'Flux inaccessible', detail: e.message });
  }
});

// ── Démarrage ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎬 IPTV Player démarré → http://localhost:${PORT}\n`);
});
