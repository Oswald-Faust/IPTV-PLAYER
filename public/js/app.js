/* ══════════════════════════════════════════════════════════
   État global
══════════════════════════════════════════════════════════ */
let allItems        = [];      // chaînes / films / séries chargés
let currentSection  = 'live'; // 'live' | 'vod' | 'series'
let currentChannel  = null;   // objet du flux en cours de lecture
let hlsInstance     = null;   // instance hls.js
let mpegtsInstance  = null;   // instance mpegts.js

/* ══════════════════════════════════════════════════════════
   Démarrage
══════════════════════════════════════════════════════════ */
(async function init() {
  loadAccountInfo();
  await loadCategories();
  await loadContent();
})();

/* ══════════════════════════════════════════════════════════
   Infos du compte
══════════════════════════════════════════════════════════ */
async function loadAccountInfo() {
  try {
    const data = await api('/api/info');
    const ui   = data.user_info;
    if (!ui) return;

    const expiry = ui.exp_date
      ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString('fr-FR')
      : '—';
    const active = ui.status === 'Active';

    document.getElementById('account-info').innerHTML = `
      <div class="username">${ui.username || '—'}</div>
      <div class="status">
        <span class="dot ${active ? 'green' : 'red'}"></span>
        ${active ? 'Actif' : ui.status || 'Inconnu'}
      </div>
      <div class="expiry">Expire le ${expiry}</div>
    `;
  } catch (e) {
    document.getElementById('account-info').innerHTML =
      '<span class="account-loading">Infos indisponibles</span>';
  }
}

/* ══════════════════════════════════════════════════════════
   Navigation entre sections
══════════════════════════════════════════════════════════ */
async function switchSection(section, btn) {
  if (currentSection === section) return;
  currentSection = section;

  // Bouton actif
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Titre
  const titles = { live: 'Live TV', vod: 'Films', series: 'Séries' };
  document.getElementById('section-title').textContent = titles[section];

  // Reset recherche
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.add('hidden');

  await loadCategories();
  await loadContent();
}

/* ══════════════════════════════════════════════════════════
   Catégories
══════════════════════════════════════════════════════════ */
async function loadCategories() {
  const endpoints = {
    live:   '/api/categories',
    vod:    '/api/vod/categories',
    series: '/api/series/categories',
  };
  try {
    const cats = await api(endpoints[currentSection]);
    const list = document.getElementById('categories-list');
    list.innerHTML = '';

    addCatButton(list, 'all', 'Toutes', true);

    if (Array.isArray(cats)) {
      cats.forEach(c => addCatButton(list, c.category_id, c.category_name));
    }
  } catch (e) {
    console.warn('Catégories non disponibles:', e.message);
  }
}

function addCatButton(container, id, label, active = false) {
  const btn = document.createElement('button');
  btn.className = 'cat-btn' + (active ? ' active' : '');
  btn.dataset.id = id;
  btn.textContent = label;
  btn.onclick = () => selectCategory(id, btn);
  container.appendChild(btn);
}

function selectCategory(id, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadContent(id === 'all' ? null : id);
}

/* ══════════════════════════════════════════════════════════
   Chargement du contenu (chaînes / films / séries)
══════════════════════════════════════════════════════════ */
async function loadContent(categoryId = null) {
  showLoader(true);
  document.getElementById('grid').innerHTML = '';
  showEmpty(false);

  const endpoints = {
    live:   '/api/channels',
    vod:    '/api/vod',
    series: '/api/series',
  };

  let url = endpoints[currentSection];
  if (categoryId) url += `?category_id=${categoryId}`;

  try {
    const data = await api(url);
    allItems = Array.isArray(data) ? data : [];
    showLoader(false);
    renderGrid(allItems);
    updateBadge(currentSection, allItems.length);
  } catch (e) {
    showLoader(false);
    showEmpty(true, `Erreur : ${e.message}`);
  }
}

/* ══════════════════════════════════════════════════════════
   Rendu de la grille
══════════════════════════════════════════════════════════ */
function renderGrid(items) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  if (!items.length) {
    showEmpty(true);
    return;
  }
  showEmpty(false);

  const frag = document.createDocumentFragment();
  items.forEach(item => frag.appendChild(makeCard(item)));
  grid.appendChild(frag);

  document.getElementById('items-count').textContent =
    `${items.length} ${currentSection === 'live' ? 'chaîne' : 'titre'}${items.length > 1 ? 's' : ''}`;
}

function makeCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const logoUrl = item.stream_icon || item.cover || '';
  const proxied = logoUrl ? `/proxy/img?url=${encodeURIComponent(logoUrl)}` : '';
  const logoHtml = proxied
    ? `<img class="card-logo" src="${proxied}" alt="" loading="lazy" onerror="this.replaceWith(makePlaceholder())">`
    : makePlaceholder().outerHTML;

  const badge = currentSection === 'live'
    ? '<span class="card-live-badge">LIVE</span>'
    : '';

  card.innerHTML = `
    <div class="card-logo-wrap">${logoHtml}</div>
    <div class="card-name">${item.name || '—'}</div>
    ${badge}
  `;

  card.addEventListener('click', () => startPlayback(item));
  return card;
}

function makePlaceholder() {
  const d = document.createElement('div');
  d.className = 'card-logo-placeholder';
  d.textContent = currentSection === 'live' ? '📺' : '🎬';
  return d;
}

/* ══════════════════════════════════════════════════════════
   Recherche
══════════════════════════════════════════════════════════ */
function filterContent() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  document.getElementById('search-clear').classList.toggle('hidden', !q);

  const filtered = q
    ? allItems.filter(i => (i.name || '').toLowerCase().includes(q))
    : allItems;

  renderGrid(filtered);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  renderGrid(allItems);
}

/* ══════════════════════════════════════════════════════════
   Lecture
══════════════════════════════════════════════════════════ */
async function startPlayback(item) {
  currentChannel = item;

  // Afficher le modal
  const modal = document.getElementById('player-modal');
  modal.classList.remove('hidden');

  // Infos chaîne
  document.getElementById('pl-name').textContent    = item.name || '—';
  document.getElementById('pl-program').textContent = '⏳ Chargement…';

  const logo = document.getElementById('pl-logo');
  const logoSrc = item.stream_icon || item.cover || '';
  if (logoSrc) {
    logo.src = `/proxy/img?url=${encodeURIComponent(logoSrc)}`;
    logo.style.display = 'block';
    logo.onerror = () => { logo.style.display = 'none'; };
  } else {
    logo.style.display = 'none';
  }

  // Réinitialiser l'erreur
  document.getElementById('video-error').classList.add('hidden');
  document.getElementById('video').style.display = 'block';
  document.getElementById('epg-scroll').innerHTML = '';

  // Obtenir l'URL du flux
  try {
    let streamUrl, streamType;

    if (currentSection === 'live') {
      const r = await api(`/api/stream-url/${item.stream_id}`);
      streamUrl  = r.url;
      streamType = 'hls';
    } else {
      const ext = item.container_extension || 'mp4';
      const r   = await api(`/api/vod-url/${item.stream_id}?ext=${ext}`);
      streamUrl  = r.url;
      streamType = 'vod';
    }

    loadStream(streamUrl, streamType);

    if (currentSection === 'live') {
      loadEPG(item.stream_id);
    } else {
      document.getElementById('pl-program').textContent = item.rating ? `⭐ ${item.rating}` : '';
      document.getElementById('epg-bar').style.display  = 'none';
    }

    if (currentSection === 'live') {
      document.getElementById('epg-bar').style.display = 'flex';
    }

  } catch (e) {
    showVideoError();
  }
}

function destroyPlayers() {
  if (hlsInstance)    { hlsInstance.destroy();    hlsInstance    = null; }
  if (mpegtsInstance) { mpegtsInstance.destroy(); mpegtsInstance = null; }
}

function loadStream(url, type) {
  const video = document.getElementById('video');
  destroyPlayers();
  video.src = '';

  if (type === 'mpegts' && typeof mpegts !== 'undefined' && mpegts.getFeatureList().mseLivePlayback) {
    // Flux MPEG-TS brut (Live TV via proxy)
    mpegtsInstance = mpegts.createPlayer(
      { type: 'mpegts', url, isLive: true },
      {
        enableWorker: true,
        liveBufferLatencyChasing: true,
        liveSync: true,
        stashInitialSize: 128,
      }
    );
    mpegtsInstance.attachMediaElement(video);
    mpegtsInstance.load();
    mpegtsInstance.play().catch(() => {});
    mpegtsInstance.on(mpegts.Events.ERROR, () => showVideoError());

  } else if (type === 'hls' && Hls.isSupported()) {
    // Flux HLS (fallback ou VOD)
    hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    hlsInstance.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        data.type === Hls.ErrorTypes.NETWORK_ERROR ? hlsInstance.startLoad() : showVideoError();
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari — HLS natif
    video.src = url;
    video.play().catch(() => {});

  } else {
    // VOD direct
    video.src = url;
    video.play().catch(() => {});
  }

  video.onerror = () => showVideoError();
}

function showVideoError() {
  document.getElementById('video').style.display        = 'none';
  document.getElementById('video-error').classList.remove('hidden');
  document.getElementById('pl-program').textContent     = 'Erreur de lecture';
}

function retryStream() {
  if (currentChannel) startPlayback(currentChannel);
}

/* ══════════════════════════════════════════════════════════
   EPG (programme TV)
══════════════════════════════════════════════════════════ */
async function loadEPG(streamId) {
  try {
    const data  = await api(`/api/epg?stream_id=${streamId}&limit=8`);
    const items = data.epg_listings || [];

    if (!items.length) {
      document.getElementById('pl-program').textContent = 'Aucun programme';
      return;
    }

    // Programme actuel
    const current = items[0];
    const title   = safeDecode(current.title);
    document.getElementById('pl-program').textContent = title || 'En cours';

    // Barre EPG
    const scroll = document.getElementById('epg-scroll');
    scroll.innerHTML = '';

    const now = Date.now();
    items.forEach((prog, idx) => {
      const start    = new Date(prog.start);
      const progName = safeDecode(prog.title);
      const isNow    = idx === 0 || start.getTime() <= now;

      const el = document.createElement('div');
      el.className = 'epg-item' + (isNow && idx === 0 ? ' now' : '');
      el.innerHTML = `
        <div class="epg-time">${start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="epg-title">${progName || '—'}</div>
      `;
      scroll.appendChild(el);
    });

  } catch (e) {
    document.getElementById('pl-program').textContent = '';
  }
}

/* ══════════════════════════════════════════════════════════
   Fermeture du lecteur
══════════════════════════════════════════════════════════ */
function closePlayer() {
  const video = document.getElementById('video');
  video.pause();
  video.src = '';

  destroyPlayers();

  document.getElementById('player-modal').classList.add('hidden');
  document.getElementById('video').style.display = 'block';
  document.getElementById('video-error').classList.add('hidden');
  currentChannel = null;
}

function onModalBackdropClick(e) {
  if (e.target === document.getElementById('player-modal')) closePlayer();
}

/* ══════════════════════════════════════════════════════════
   Plein écran
══════════════════════════════════════════════════════════ */
function toggleFullscreen() {
  const box = document.getElementById('player-box');
  if (!document.fullscreenElement) {
    box.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

/* ══════════════════════════════════════════════════════════
   Raccourcis clavier
══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePlayer();
  if (e.key === 'f' || e.key === 'F') {
    if (!document.getElementById('player-modal').classList.contains('hidden')) toggleFullscreen();
  }
});

/* ══════════════════════════════════════════════════════════
   Utilitaires
══════════════════════════════════════════════════════════ */
async function api(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function showLoader(visible) {
  document.getElementById('loader').style.display = visible ? 'flex' : 'none';
}

function showEmpty(visible, msg = 'Aucun résultat trouvé') {
  const el = document.getElementById('empty-state');
  el.classList.toggle('hidden', !visible);
  if (visible) el.querySelector('p').textContent = msg;
}

function updateBadge(section, count) {
  const badge = document.getElementById(`${section}-count`);
  if (!badge) return;
  badge.textContent = count > 999 ? '999+' : count;
  badge.classList.toggle('hidden', count === 0);
}

function safeDecode(str) {
  if (!str) return '';
  try   { return atob(str); }
  catch { return str; }
}
