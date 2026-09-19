'use strict';

/* ============================================
   StudiuMeu – BIBLIOTECĂ
   Mutat din aplicația "Studiu Personal": Publicații
   (linkuri/PDF-uri de pe jw.org) + Materiale Video.

   Notă privind confidențialitatea: fișierele video NU sunt
   niciodată încărcate nicăieri și NU sunt stocate ca atare —
   sunt citite direct din calculator. Doar titlul, starea
   "vizionat", poziția de redare și — acolo unde browserul
   permite — o "legătură" către locația fișierului (nu
   conținutul lui!) sunt salvate local (state / IndexedDB).
   ============================================ */

// ── Tab-uri mari: Publicații / Materiale Video ──
function switchLibTab(target) {
  document.querySelectorAll('.lib-big-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${target}`)?.classList.add('active');

  const panels = { pub: 'lib-pub', video: 'lib-video', music: 'lib-music' };
  Object.entries(panels).forEach(([key, panelId]) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.classList.toggle('active', key === target);
    panel.classList.toggle('hidden', key !== target);
  });

  if (target === 'music' && !musicInitialized) {
    musicInitialized = true;
    restoreSavedSongs().then(renderMusicPanel);
  }
}

// ── Randare generală a paginii Bibliotecă (apelată la navigare) ──
let libraryInitialized = false;
let musicInitialized = false;

function renderLibraryPage() {
  if (!Array.isArray(state.publications)) state.publications = [];
  if (!state.videoMeta || typeof state.videoMeta !== 'object') state.videoMeta = {};
  ensureVideoSeries();
  if (!Array.isArray(state.songs)) state.songs = [];
  if (!Array.isArray(state.songsIntl)) state.songsIntl = [];

  if (!libraryInitialized) {
    initLibraryOnce();
    initMusicOnce();
    libraryInitialized = true;
  }
  renderPubs();
  renderVideoSlots();
  if (musicInitialized) renderMusicPanel();
}

function initLibraryOnce() {
  // Închidere modale la click pe overlay / Escape
  document.getElementById('pub-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('pub-modal')) closePubModal();
  });
  document.getElementById('series-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('series-modal')) closeSeriesModal();
  });
  document.getElementById('new-series-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewSeries();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePubModal();
      closeSeriesModal();
      if (typeof closeVideoPlayer === 'function') closeVideoPlayer();
    }
  });

  document.getElementById('vplayer-close')?.addEventListener('click', closeVideoPlayer);
  document.getElementById('vplayer-exit')?.addEventListener('click', closeVideoPlayer);
  document.getElementById('video-player-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('video-player-modal')) closeVideoPlayer();
  });

  const list = document.getElementById('video-series-list');
  list?.addEventListener('change', e => {
    if (!e.target.classList.contains('vslot-file')) return;
    const file = e.target.files[0];
    if (!file) return;
    applyLoadedVideo(e.target.dataset.slot, file);
    e.target.value = '';
  });
  list?.addEventListener('input', e => {
    if (e.target.classList.contains('vslot-title-input')) {
      const ep = findEpisode(e.target.dataset.series, e.target.dataset.slot);
      if (ep) ep.title = e.target.value;
    } else if (e.target.classList.contains('series-title-input')) {
      const s = findSeries(e.target.dataset.series);
      if (s) s.name = e.target.value;
    }
  });
  list?.addEventListener('blur', e => {
    if (!e.target.classList) return;
    if (e.target.classList.contains('vslot-title-input')) {
      const ep = findEpisode(e.target.dataset.series, e.target.dataset.slot);
      if (ep && !e.target.value.trim()) { e.target.value = ep.title = 'Episod fără titlu'; }
      saveState();
    } else if (e.target.classList.contains('series-title-input')) {
      const s = findSeries(e.target.dataset.series);
      if (s && !e.target.value.trim()) { e.target.value = s.name = 'Serial nou'; }
      saveState();
    }
  }, true); // capture — blur nu urcă (bubble)
  list?.addEventListener('click', e => {
    const watchedBtn = e.target.closest('.vslot-watched-btn');
    if (watchedBtn) { toggleWatched(watchedBtn.dataset.series, watchedBtn.dataset.slot); return; }

    const playBtn = e.target.closest('.vslot-play');
    if (playBtn) {
      const id = playBtn.dataset.slot;
      const titleInput = document.querySelector(`.vslot-title-input[data-slot="${id}"]`);
      openVideoPlayer(id, titleInput ? titleInput.value : 'Video');
      return;
    }

    const delBtn = e.target.closest('.vslot-delete');
    if (delBtn) { deleteVideoEpisode(delBtn.dataset.series, delBtn.dataset.slot); return; }

    const pickLabel = e.target.closest('.vslot-pick');
    if (pickLabel && supportsFileHandles) {
      e.preventDefault();
      pickVideoForSlot(pickLabel.dataset.slot);
      return;
    }

    const addEpBtn = e.target.closest('.add-episode-btn');
    if (addEpBtn) { addEpisode(addEpBtn.dataset.series); return; }

    const delSeriesBtn = e.target.closest('.series-delete-btn');
    if (delSeriesBtn) { deleteSeries(delSeriesBtn.dataset.series); return; }
  });

  restoreSavedVideos();
}

/* ============================================
   PUBLICAȚII
   ============================================ */
function openPubModal() {
  document.getElementById('pub-modal')?.classList.remove('hidden');
  document.getElementById('pub-title-input')?.focus();
}
function closePubModal() {
  document.getElementById('pub-modal')?.classList.add('hidden');
  document.getElementById('pub-title-input').value = '';
  document.getElementById('pub-url-input').value = '';
}
function savePub() {
  const titleIn = document.getElementById('pub-title-input');
  const urlIn = document.getElementById('pub-url-input');
  const title = titleIn.value.trim();
  if (!title) { showToast('Introdu un titlu!', 'error'); return; }
  state.publications.push({ title, url: urlIn.value.trim() });
  saveState();
  titleIn.value = ''; urlIn.value = '';
  closePubModal();
  renderPubs();
  showToast('Publicație adăugată! 📚', 'success');
}
function deletePub(index) {
  if (!confirm('Ștergi această publicație?')) return;
  state.publications.splice(index, 1);
  saveState();
  renderPubs();
  showToast('Publicație ștearsă.', 'success');
}

function renderPubs() {
  const pubList = document.getElementById('pub-list');
  if (!pubList) return;
  pubList.querySelectorAll('.pub-card, .pub-card-wrap').forEach(el => el.remove());
  const empty = pubList.querySelector('.pub-empty');
  if (state.publications.length === 0) {
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  state.publications.forEach((pub, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'pub-card-wrap';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';

    const a = document.createElement('a');
    a.className = 'pub-card';
    a.style.flex = '1';
    a.href = pub.url || '#';
    if (pub.url) a.target = '_blank';
    a.innerHTML = `
      <div class="pub-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      </div>
      <div>
        <div class="pub-card-title">${escHtml(pub.title)}</div>
        ${pub.url ? `<div class="pub-card-url">${escHtml(pub.url)}</div>` : ''}
      </div>
    `;

    const delBtn = document.createElement('button');
    delBtn.className = 'vslot-delete';
    delBtn.style.display = 'flex';
    delBtn.title = 'Șterge publicația';
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    delBtn.addEventListener('click', () => deletePub(i));

    wrap.appendChild(a);
    wrap.appendChild(delBtn);
    pubList.appendChild(wrap);
  });
}

/* ============================================
   MATERIALE VIDEO (seriale + episoade — extensibile de utilizator)
   state.videoSeries = [ { id, name, episodes: [ {id, title, watched, position} ] } ]
   Utilizatorul poate adăuga oricâte seriale noi și oricâte episoade
   în fiecare serial, din interfață ("Adaugă Serial Nou" / "Adaugă Episod").
   ============================================ */
const LEGACY_EPISODE_TITLES = {
  1: 'Episodul 1: Adevărata lumină a lumii',
  2: 'Episodul 2',
  3: 'Episodul 3',
  4: 'Episodul 4',
  5: 'Episodul 5',
  6: 'Episodul 6',
};

// Migrează modelul vechi (un singur set fix de 6 episoade) în noul model cu seriale,
// păstrând aceleași ID-uri de episod (compatibile cu fișierele deja reconectate).
function ensureVideoSeries() {
  if (!Array.isArray(state.videoSeries)) state.videoSeries = [];
  if (state.videoSeries.length === 0 && state.videoMeta && Object.keys(state.videoMeta).length) {
    const episodes = Object.keys(LEGACY_EPISODE_TITLES).map(Number).map(id => {
      const m = state.videoMeta[id] || {};
      return {
        id: String(id),
        title: m.title || LEGACY_EPISODE_TITLES[id],
        watched: !!m.watched,
        position: typeof m.position === 'number' ? m.position : 0,
      };
    });
    state.videoSeries.push({ id: 'serial-implicit', name: 'Viața lui Isus', category: 'isus', episodes });
  }
  if (state.videoSeries.length === 0) {
    state.videoSeries.push({ id: 'serial-implicit', name: 'Viața lui Isus', category: 'isus', episodes: [] });
  }
  // Compatibilitate: serialele mai vechi (create înainte de sub-tab-uri) nu au „category" —
  // le considerăm implicit „Viața lui Isus".
  let changed = false;
  state.videoSeries.forEach(s => {
    if (s.category !== 'isus' && s.category !== 'broadcasting') { s.category = 'isus'; changed = true; }
  });
  // Redenumește placeholder-ul vechi implicit, dacă nu a fost redenumit de utilizator.
  const implicit = state.videoSeries.find(s => s.id === 'serial-implicit' && s.name === 'Materiale Video');
  if (implicit) { implicit.name = 'Viața lui Isus'; changed = true; }
  // Serialul „JW Broadcasting” este creat automat, o singură dată — utilizatorul nu
  // trebuie să apese „Serial Nou” pentru el, doar „Adaugă Episod” în interiorul lui.
  if (!state.videoSeries.some(s => s.category === 'broadcasting')) {
    state.videoSeries.push({ id: 'serial-broadcasting', name: 'JW Broadcasting', category: 'broadcasting', episodes: [] });
    changed = true;
  }
  if (changed && typeof saveState === 'function') saveState();
}

// ── Sub-tab-uri Materiale Video: „Viața lui Isus” / „JW Broadcasting” ──
const VIDEO_CATEGORIES = ['isus', 'broadcasting'];
let currentVideoCategory = 'isus';

function switchVideoCategory(cat) {
  if (!VIDEO_CATEGORIES.includes(cat)) return;
  currentVideoCategory = cat;
  document.querySelectorAll('.lib-sub-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vidcat === cat);
  });
  VIDEO_CATEGORIES.forEach(c => {
    document.getElementById(`video-cat-${c}`)?.classList.toggle('hidden', c !== cat);
  });
}

function findSeries(seriesId) {
  return state.videoSeries.find(s => s.id === seriesId);
}
function findEpisode(seriesId, epId) {
  return findSeries(seriesId)?.episodes.find(e => e.id === epId);
}
function findEpisodeAnySeries(epId) {
  for (const s of state.videoSeries) {
    const ep = s.episodes.find(e => e.id === epId);
    if (ep) return ep;
  }
  return null;
}
function allEpisodeIds() {
  const ids = [];
  state.videoSeries.forEach(s => s.episodes.forEach(e => ids.push(e.id)));
  return ids;
}

// ── "Memoria" locației fișierelor (File System Access API + IndexedDB) ──
// Disponibilă doar în Chrome/Edge. Stochează doar o REFERINȚĂ către fișier
// (un "handle"), nu conținutul video. Firefox/Safari nu suportă acest API;
// acolo se revine automat la selectarea manuală a fișierului.
const supportsFileHandles = 'showOpenFilePicker' in window && 'indexedDB' in window;
const IDB_NAME = 'sp-video-db';
const IDB_STORE = 'handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveHandle(slot, handle) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, String(slot));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getHandle(slot) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(String(slot));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function deleteHandle(slot) {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(String(slot));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
/** Șterge toate legăturile către fișiere video salvate (folosit la resetarea completă a datelor). */
async function deleteAllVideoHandles() {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// videoBlobs[slot] = { name, url } — doar în memorie, niciodată persistat
const videoBlobs = {};

function createVideoSlotEl(ep, seriesId, index) {
  const loaded = !!videoBlobs[ep.id];
  const el = document.createElement('div');
  el.className = 'video-slot' + (ep.watched ? ' watched' : '') + (loaded ? ' loaded' : '');
  el.id = `vslot-${ep.id}`;
  el.dataset.slot = ep.id;
  el.dataset.series = seriesId;
  el.innerHTML = `
    <div class="vslot-num">${index + 1}</div>
    <div class="vslot-info">
      <input type="text" class="vslot-title-input" data-slot="${ep.id}" data-series="${seriesId}" maxlength="80"
             value="${escHtml(ep.title)}" placeholder="Titlu episod..." />
      <div class="vslot-meta-row">
        <span class="vslot-status ${loaded ? 'loaded-status' : 'empty-status'}">${loaded ? '✓ ' + escHtml(videoBlobs[ep.id].name) : 'Nicio înregistrare'}</span>
        <span class="vslot-watched-tag ${ep.watched ? '' : 'hidden'}">✅ Vizionat</span>
      </div>
    </div>
    <button class="vslot-watched-btn ${ep.watched ? 'active' : ''}" data-slot="${ep.id}" data-series="${seriesId}" title="Marchează ca vizionat">⭐</button>
    <button class="vslot-play ${loaded ? '' : 'hidden'}" data-slot="${ep.id}" title="Redă video">
      <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </button>
    <label class="vslot-pick" data-slot="${ep.id}" title="${loaded ? 'Schimbă videoclipul' : 'Selectează video'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <input type="file" accept="video/*" class="vslot-file" data-slot="${ep.id}" />
    </label>
    <button class="vslot-delete" data-slot="${ep.id}" data-series="${seriesId}" title="Șterge episodul din listă" style="display:flex">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
    </button>
  `;
  return el;
}

function createSeriesBlockEl(series) {
  const wrap = document.createElement('div');
  wrap.className = 'video-series';
  wrap.dataset.series = series.id;
  wrap.innerHTML = `
    <div class="series-header">
      <span class="series-badge">📂</span>
      <input type="text" class="series-title-input" data-series="${series.id}" maxlength="80"
             value="${escHtml(series.name)}" placeholder="Titlu serial..." />
      <span class="series-count">${series.episodes.length} episoade</span>
      <button class="series-delete-btn" data-series="${series.id}" title="Șterge serialul">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
    <div class="video-cards-list" id="vlist-${series.id}" data-series="${series.id}"></div>
    ${series.episodes.length === 0 ? '<p class="series-empty-hint">Niciun episod adăugat încă.</p>' : ''}
    <div class="video-toolbar">
      <button class="add-media-btn add-episode-btn" data-series="${series.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Adaugă Episod
      </button>
    </div>
  `;
  const list = wrap.querySelector('.video-cards-list');
  series.episodes.forEach((ep, i) => list.appendChild(createVideoSlotEl(ep, series.id, i)));
  return wrap;
}

function renderVideoSlots() {
  ensureVideoSeries();
  const containers = {
    isus: document.getElementById('video-cat-isus'),
    broadcasting: document.getElementById('video-cat-broadcasting'),
  };
  if (!containers.isus || !containers.broadcasting) return;
  Object.values(containers).forEach(c => { c.innerHTML = ''; });

  state.videoSeries.forEach(series => {
    const target = containers[series.category] || containers.isus;
    target.appendChild(createSeriesBlockEl(series));
    series.episodes.forEach(ep => {
      if (videoBlobs[ep.id]) applyLoadedVideo(ep.id, { name: videoBlobs[ep.id].name }, true, true);
    });
  });

  VIDEO_CATEGORIES.forEach(c => containers[c].classList.toggle('hidden', c !== currentVideoCategory));
}

// ── Adăugare / redenumire / ștergere seriale ──
function openSeriesModal() {
  const titleEl = document.querySelector('#series-modal .mini-modal-box h4');
  if (titleEl) {
    titleEl.textContent = currentVideoCategory === 'broadcasting'
      ? 'Serial nou — JW Broadcasting'
      : 'Serial nou — Viața lui Isus';
  }
  document.getElementById('series-modal')?.classList.remove('hidden');
  document.getElementById('new-series-input')?.focus();
}
function closeSeriesModal() {
  document.getElementById('series-modal')?.classList.add('hidden');
  const input = document.getElementById('new-series-input');
  if (input) input.value = '';
}
function saveNewSeries() {
  const input = document.getElementById('new-series-input');
  const name = input.value.trim();
  if (!name) { showToast('Introdu un titlu pentru serial!', 'error'); return; }
  ensureVideoSeries();
  const id = `vs${Date.now()}${Math.floor(Math.random() * 1000)}`;
  state.videoSeries.push({ id, name, category: currentVideoCategory, episodes: [] });
  saveState();
  input.value = '';
  closeSeriesModal();
  renderVideoSlots();
  showToast(`Serialul „${name}" a fost creat! 📂`, 'success');
}
function deleteSeries(seriesId) {
  const series = findSeries(seriesId);
  if (!series) return;
  if (!confirm(`Ștergi serialul „${series.name}" și toate episoadele din listă? (fișierele video de pe calculator nu sunt afectate)`)) return;
  series.episodes.forEach(ep => {
    if (videoBlobs[ep.id]) { URL.revokeObjectURL(videoBlobs[ep.id].url); delete videoBlobs[ep.id]; }
    if (supportsFileHandles) deleteHandle(ep.id).catch(() => {});
  });
  state.videoSeries = state.videoSeries.filter(s => s.id !== seriesId);
  ensureVideoSeries();
  saveState();
  renderVideoSlots();
  showToast('Serial șters 🗑️', 'success');
}

// ── Adăugare / ștergere episoade în cadrul unui serial ──
function addEpisode(seriesId) {
  const series = findSeries(seriesId);
  if (!series) return;
  const id = `e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  series.episodes.push({ id, title: `Episodul ${series.episodes.length + 1}`, watched: false, position: 0 });
  saveState();
  renderVideoSlots();
  const input = document.querySelector(`.vslot-title-input[data-slot="${id}"]`);
  if (input) { input.focus(); input.select(); }
  showToast('Episod nou adăugat ✚', 'success');
}
function deleteVideoEpisode(seriesId, epId) {
  if (!confirm('Ștergi acest episod din listă? (fișierul video de pe calculator nu este afectat)')) return;
  const series = findSeries(seriesId);
  if (!series) return;
  const idx = series.episodes.findIndex(e => e.id === epId);
  if (idx === -1) return;
  series.episodes.splice(idx, 1);
  if (videoBlobs[epId]) { URL.revokeObjectURL(videoBlobs[epId].url); delete videoBlobs[epId]; }
  saveState();
  if (supportsFileHandles) deleteHandle(epId).catch(() => {});
  renderVideoSlots();
  showToast('Episod șters 🗑️', 'success');
}

// ── Aplică vizual un video încărcat ──
// keepUrl=true înseamnă că videoBlobs[slot].url e deja setat (re-randare panou)
function applyLoadedVideo(slot, file, silent, keepUrl) {
  const slotEl = document.getElementById(`vslot-${slot}`);
  if (!slotEl) return;
  const statusEl = slotEl.querySelector('.vslot-status');

  if (!keepUrl) {
    if (videoBlobs[slot]) URL.revokeObjectURL(videoBlobs[slot].url);
    videoBlobs[slot] = { name: file.name, url: URL.createObjectURL(file) };
  }

  slotEl.classList.add('loaded');
  statusEl.className = 'vslot-status loaded-status';
  statusEl.textContent = `✓ ${file.name}`;
  slotEl.querySelector('.vslot-play').classList.remove('hidden');
  slotEl.querySelector('.vslot-delete').classList.remove('hidden');
  slotEl.querySelector('.vslot-pick').title = 'Schimbă videoclipul';
  delete slotEl.dataset.pendingHandle;

  if (!silent) showToast('Video încărcat! 🎬', 'success');
}

// ── Flow cu "memorie" a fișierului (Chrome/Edge — File System Access API) ──
async function loadFileFromHandle(slot, handle, silent) {
  try {
    const file = await handle.getFile();
    applyLoadedVideo(slot, file, silent);
  } catch {
    showToast('Fișierul nu a mai fost găsit (poate a fost mutat sau șters de pe disc).', 'error');
    markSlotNeedsPermission(slot);
  }
}

function markSlotNeedsPermission(slot) {
  const slotEl = document.getElementById(`vslot-${slot}`);
  if (!slotEl) return;
  const statusEl = slotEl.querySelector('.vslot-status');
  statusEl.className = 'vslot-status permission-status';
  statusEl.textContent = '🔒 Apasă pe pictograma folder pentru a reconecta fișierul';
  slotEl.querySelector('.vslot-pick').title = 'Reconectează fișierul salvat';
  slotEl.dataset.pendingHandle = '1';
}

async function pickVideoForSlot(slot) {
  const slotEl = document.getElementById(`vslot-${slot}`);

  // Dacă avem deja un handle salvat ce așteaptă permisiune, încercăm întâi să-l reconectăm
  if (supportsFileHandles && slotEl?.dataset.pendingHandle === '1') {
    const handle = await getHandle(slot).catch(() => null);
    if (handle) {
      try {
        const perm = await handle.requestPermission({ mode: 'read' });
        if (perm === 'granted') { await loadFileFromHandle(slot, handle); return; }
        showToast('Acces refuzat. Poți selecta din nou fișierul.', 'error');
      } catch { /* continuă mai jos la selectare nouă */ }
    }
  }

  if (supportsFileHandles) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'] } }],
        multiple: false,
      });
      await saveHandle(slot, handle);
      await loadFileFromHandle(slot, handle);
    } catch (err) {
      if (err?.name === 'AbortError') return; // utilizatorul a anulat selecția
      // Metoda modernă a eșuat (ex: context nesigur, restricții de browser).
      // Trecem automat la selectorul clasic de fișiere, care funcționează garantat.
      document.querySelector(`.vslot-file[data-slot="${slot}"]`)?.click();
    }
  } else {
    // Firefox / Safari — nu pot reține fișierul, doar selectare clasică
    document.querySelector(`.vslot-file[data-slot="${slot}"]`)?.click();
  }
}

// La deschiderea paginii Bibliotecă: reconectează automat videourile salvate anterior
async function restoreSavedVideos() {
  if (!supportsFileHandles) return;
  for (const id of allEpisodeIds()) {
    const handle = await getHandle(id).catch(() => null);
    if (!handle) continue;
    try {
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm === 'granted') {
        await loadFileFromHandle(id, handle, true);
      } else {
        markSlotNeedsPermission(id);
      }
    } catch {
      markSlotNeedsPermission(id);
    }
  }
}

function toggleWatched(seriesId, epId) {
  const ep = findEpisode(seriesId, epId);
  if (!ep) return;
  ep.watched = !ep.watched;
  saveState();
  const slotEl = document.getElementById(`vslot-${epId}`);
  if (slotEl) {
    slotEl.classList.toggle('watched', ep.watched);
    slotEl.querySelector('.vslot-watched-btn').classList.toggle('active', ep.watched);
    slotEl.querySelector('.vslot-watched-tag').classList.toggle('hidden', !ep.watched);
  }
  showToast(ep.watched ? '⭐ Marcat ca vizionat' : '↩️ Marcaj eliminat', 'success');
}

/* ============================================
   PLAYER VIDEO (redare, continuă de unde ai rămas, ieșire)
   ============================================ */
let currentPlayingSlot = null;
let positionSaveTimer = null;

function formatVideoTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function openVideoPlayer(slot, title) {
  if (!videoBlobs[slot]) return;
  const vPlayerModal = document.getElementById('video-player-modal');
  const vPlayerEl = document.getElementById('vplayer-el');
  const vPlayerTitle = document.getElementById('vplayer-title');

  currentPlayingSlot = slot;
  vPlayerEl.src = videoBlobs[slot].url;
  vPlayerTitle.textContent = title;
  vPlayerModal.classList.remove('hidden');

  const resumeAt = (findEpisodeAnySeries(slot) || {}).position || 0;
  const resumeOnce = () => {
    if (resumeAt > 2 && resumeAt < vPlayerEl.duration - 3) {
      vPlayerEl.currentTime = resumeAt;
      showToast(`▶️ Continuă de la ${formatVideoTime(resumeAt)}`, 'success');
    }
    vPlayerEl.removeEventListener('loadedmetadata', resumeOnce);
  };
  vPlayerEl.addEventListener('loadedmetadata', resumeOnce);

  vPlayerEl.play().catch(() => {});

  clearInterval(positionSaveTimer);
  positionSaveTimer = setInterval(savePlaybackPosition, 4000);
  vPlayerEl.addEventListener('pause', savePlaybackPosition);
}

function savePlaybackPosition() {
  if (currentPlayingSlot == null) return;
  const vPlayerEl = document.getElementById('vplayer-el');
  const t = vPlayerEl.currentTime;
  if (!isFinite(t)) return;
  const ep = findEpisodeAnySeries(currentPlayingSlot);
  if (ep) ep.position = t;
  saveState();
}

function closeVideoPlayer() {
  const vPlayerModal = document.getElementById('video-player-modal');
  const vPlayerEl = document.getElementById('vplayer-el');
  if (!vPlayerModal || !vPlayerEl) return;
  savePlaybackPosition();
  clearInterval(positionSaveTimer);
  vPlayerEl.pause();
  vPlayerEl.src = '';
  vPlayerModal.classList.add('hidden');
  currentPlayingSlot = null;
}

/* ============================================
   MUZICĂ — două categorii: "Melodiile Regatului" (kingdom)
   și "Melodii Internaționale" (intl). Ambele folosesc același
   cod, parametrizat prin `category`, dar au liste, contoare și
   „continuă ascultarea" separate. Modalul de adăugare și
   player-ul audio sunt comune (un singur modal/player pe ecran),
   dar știu mereu pentru ce categorie lucrează.
   ============================================ */
const MUSIC_CATEGORIES = {
  kingdom: {
    stateKey: 'songs',
    lastPlayedKey: 'lastPlayedSongId',
    listId: 'music-cards-list',
    countId: 'music-count',
    emptyId: 'music-empty',
    continueCardId: 'continue-listen-card',
    continueTitleId: 'continue-listen-title',
    continueTimeId: 'continue-listen-time',
    continueBtnId: 'continue-listen-btn',
    addedLabel: 'Melodie',
  },
  intl: {
    stateKey: 'songsIntl',
    lastPlayedKey: 'lastPlayedSongIntlId',
    listId: 'music-cards-list-intl',
    countId: 'music-count-intl',
    emptyId: 'music-empty-intl',
    continueCardId: 'continue-listen-card-intl',
    continueTitleId: 'continue-listen-title-intl',
    continueTimeId: 'continue-listen-time-intl',
    continueBtnId: 'continue-listen-btn-intl',
    addedLabel: 'Melodie internațională',
  },
};

const songBlobs = {}; // songBlobs[id] = { name, url } — doar în memorie
let currentPlayingSongId = null;
let currentPlayingCategory = null;
let pendingAddCategory = 'kingdom';
let songPositionSaveTimer = null;

function songsOf(category) {
  const key = MUSIC_CATEGORIES[category].stateKey;
  if (!Array.isArray(state[key])) state[key] = [];
  return state[key];
}

function categoryOfSongId(id) {
  if (state.songs?.some(s => s.id === id)) return 'kingdom';
  if (state.songsIntl?.some(s => s.id === id)) return 'intl';
  return null;
}

function initMusicOnce() {
  document.getElementById('song-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('song-modal')) closeAddSongModal();
  });
  document.getElementById('song-title-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewSong();
  });

  document.getElementById('aplayer-close')?.addEventListener('click', closeAudioPlayer);
  document.getElementById('aplayer-exit')?.addEventListener('click', closeAudioPlayer);
  document.getElementById('aplayer-next')?.addEventListener('click', () => playAdjacentSong(1));
  document.getElementById('aplayer-prev')?.addEventListener('click', () => playAdjacentSong(-1));
  document.getElementById('audio-player-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('audio-player-modal')) closeAudioPlayer();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAddSongModal(); closeAudioPlayer(); }
  });

  Object.entries(MUSIC_CATEGORIES).forEach(([category, cfg]) => {
    document.getElementById(cfg.continueBtnId)?.addEventListener('click', () => {
      const lastId = state[cfg.lastPlayedKey];
      if (lastId) openAudioPlayer(lastId, category);
    });

    const list = document.getElementById(cfg.listId);
    list?.addEventListener('input', e => {
      if (!e.target.classList.contains('vslot-title-input')) return;
      const song = songsOf(category).find(s => s.id === e.target.dataset.slot);
      if (song) song.title = e.target.value;
    });
    list?.addEventListener('blur', e => {
      if (!e.target.classList || !e.target.classList.contains('vslot-title-input')) return;
      const song = songsOf(category).find(s => s.id === e.target.dataset.slot);
      if (song && !e.target.value.trim()) e.target.value = song.title = 'Melodie fără titlu';
      saveState();
    }, true);
    list?.addEventListener('click', e => {
      const playBtn = e.target.closest('.vslot-play');
      if (playBtn) { openAudioPlayer(playBtn.dataset.slot, category); return; }

      const delBtn = e.target.closest('.vslot-delete');
      if (delBtn) { deleteSong(delBtn.dataset.slot, category); return; }

      const pickLabel = e.target.closest('.vslot-pick');
      if (pickLabel) { e.preventDefault(); reconnectSongFile(pickLabel.dataset.slot, category); return; }
    });
  });
}

// ── Adăugare melodie nouă (titlu + selectare fișier) ──
function openAddSongModal(category = 'kingdom') {
  pendingAddCategory = category;
  const titleEl = document.getElementById('song-modal-title');
  if (titleEl) titleEl.textContent = category === 'intl' ? 'Melodie internațională nouă' : 'Melodie nouă';
  document.getElementById('song-modal')?.classList.remove('hidden');
  document.getElementById('song-title-input')?.focus();
}
function closeAddSongModal() {
  document.getElementById('song-modal')?.classList.add('hidden');
  document.getElementById('song-title-input').value = '';
}

async function saveNewSong() {
  const titleIn = document.getElementById('song-title-input');
  const title = titleIn.value.trim();
  if (!title) { showToast('Introdu un titlu pentru melodie!', 'error'); return; }
  const category = pendingAddCategory;
  closeAddSongModal();
  await pickFileForNewSong(title, category);
}

async function pickFileForNewSong(title, category = 'kingdom') {
  const id = `s${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const cfg = MUSIC_CATEGORIES[category];

  const finish = async (file, handle) => {
    songBlobs[id] = { name: file.name, url: URL.createObjectURL(file) };
    songsOf(category).push({ id, title, position: 0 });
    if (handle && supportsFileHandles) await saveHandle(`song-${id}`, handle).catch(() => {});
    saveState();
    renderMusicPanel(category);
    showToast(`„${title}" a fost adăugată! 🎵`, 'success');
  };

  if (supportsFileHandles) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Audio', accept: { 'audio/*': ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      await finish(file, handle);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      pickWithClassicInput(finish);
    }
  } else {
    pickWithClassicInput(finish);
  }
  void cfg; // rezervat pentru eventuale etichete specifice categoriei
}

function pickWithClassicInput(onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (file) onFile(file, null);
  });
  document.body.appendChild(input);
  input.click();
}

// ── Reconectare fișier existent (Chrome/Edge — după ce permisiunea a expirat) ──
async function reconnectSongFile(id, category) {
  category = category || categoryOfSongId(id) || 'kingdom';
  if (supportsFileHandles) {
    const handle = await getHandle(`song-${id}`).catch(() => null);
    if (handle) {
      try {
        const perm = await handle.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
          const file = await handle.getFile();
          songBlobs[id] = { name: file.name, url: URL.createObjectURL(file) };
          renderMusicPanel(category);
          return;
        }
      } catch { /* trecem la selectare clasică mai jos */ }
    }
  }
  pickWithClassicInput((file) => {
    songBlobs[id] = { name: file.name, url: URL.createObjectURL(file) };
    renderMusicPanel(category);
  });
}

async function restoreSavedSongs() {
  if (!supportsFileHandles) return;
  for (const category of Object.keys(MUSIC_CATEGORIES)) {
    for (const song of songsOf(category)) {
      if (songBlobs[song.id]) continue;
      const handle = await getHandle(`song-${song.id}`).catch(() => null);
      if (!handle) continue;
      try {
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
          const file = await handle.getFile();
          songBlobs[song.id] = { name: file.name, url: URL.createObjectURL(file) };
        }
      } catch { /* rămâne needs-reconnect, afișat la randare */ }
    }
  }
}

function deleteSong(id, category) {
  category = category || categoryOfSongId(id) || 'kingdom';
  if (!confirm('Ștergi această melodie din listă? (fișierul de pe calculator nu este afectat)')) return;
  const list = songsOf(category);
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return;
  list.splice(idx, 1);
  if (songBlobs[id]) { URL.revokeObjectURL(songBlobs[id].url); delete songBlobs[id]; }
  const cfg = MUSIC_CATEGORIES[category];
  if (state[cfg.lastPlayedKey] === id) state[cfg.lastPlayedKey] = null;
  saveState();
  if (supportsFileHandles) deleteHandle(`song-${id}`).catch(() => {});
  renderMusicPanel(category);
  showToast('Melodie ștearsă 🗑️', 'success');
}

function formatSongTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function createSongSlotEl(song, index) {
  const el = document.createElement('div');
  const loaded = !!songBlobs[song.id];
  el.className = 'video-slot song-slot' + (loaded ? ' loaded' : '') + (song.id === currentPlayingSongId ? ' playing' : '');
  el.id = `sslot-${song.id}`;
  el.dataset.slot = song.id;
  el.innerHTML = `
    <div class="vslot-num">${index + 1}</div>
    <div class="vslot-info">
      <input type="text" class="vslot-title-input" data-slot="${song.id}" maxlength="120"
             value="${escHtml(song.title)}" placeholder="Titlu melodie..." />
      <div class="vslot-meta-row">
        <span class="vslot-status ${loaded ? 'loaded-status' : 'permission-status'}">
          ${loaded ? '✓ ' + escHtml(songBlobs[song.id].name) : '🔒 Apasă pe pictograma folder pentru a reconecta fișierul'}
        </span>
        ${song.position > 3 ? `<span class="vslot-watched-tag">⏱ ${formatSongTime(song.position)}</span>` : ''}
      </div>
    </div>
    <button class="vslot-play ${loaded ? '' : 'hidden'}" data-slot="${song.id}" title="Redă melodia">
      <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    </button>
    <button class="vslot-pick" data-slot="${song.id}" title="${loaded ? 'Reconectează fișierul' : 'Selectează fișierul'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    </button>
    <button class="vslot-delete" data-slot="${song.id}" title="Șterge melodia" style="display:flex">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
    </button>
  `;
  return el;
}

function renderMusicPanel(category) {
  if (category) {
    renderMusicCategoryPanel(category);
  } else {
    Object.keys(MUSIC_CATEGORIES).forEach(renderMusicCategoryPanel);
  }
}

function renderMusicCategoryPanel(category) {
  const cfg = MUSIC_CATEGORIES[category];
  const list = document.getElementById(cfg.listId);
  const countEl = document.getElementById(cfg.countId);
  const emptyEl = document.getElementById(cfg.emptyId);
  if (!list) return;

  const songs = songsOf(category);
  if (countEl) countEl.textContent = `${songs.length} melodii`;

  list.querySelectorAll('.song-slot').forEach(el => el.remove());
  if (songs.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    songs.forEach((song, i) => list.appendChild(createSongSlotEl(song, i)));
  }

  // Card "Continuă ascultarea"
  const continueCard = document.getElementById(cfg.continueCardId);
  const lastSong = songs.find(s => s.id === state[cfg.lastPlayedKey]);
  if (continueCard) {
    if (lastSong && lastSong.position > 3) {
      continueCard.classList.remove('hidden');
      document.getElementById(cfg.continueTitleId).textContent = lastSong.title;
      document.getElementById(cfg.continueTimeId).textContent = `de la ${formatSongTime(lastSong.position)}`;
    } else {
      continueCard.classList.add('hidden');
    }
  }
}

/* ── Player audio (comun ambelor categorii) ── */
function openAudioPlayer(id, category) {
  category = category || categoryOfSongId(id) || 'kingdom';
  if (!songBlobs[id]) { reconnectSongFile(id, category); return; }
  const song = songsOf(category).find(s => s.id === id);
  if (!song) return;

  const modal = document.getElementById('audio-player-modal');
  const audioEl = document.getElementById('aplayer-el');
  const titleEl = document.getElementById('aplayer-title');

  currentPlayingSongId = id;
  currentPlayingCategory = category;
  state[MUSIC_CATEGORIES[category].lastPlayedKey] = id;
  audioEl.src = songBlobs[id].url;
  titleEl.textContent = song.title;
  modal.classList.remove('hidden');

  const resumeAt = song.position || 0;
  const resumeOnce = () => {
    if (resumeAt > 2 && resumeAt < audioEl.duration - 2) {
      audioEl.currentTime = resumeAt;
      showToast(`▶️ Continuă de la ${formatSongTime(resumeAt)}`, 'success');
    }
    audioEl.removeEventListener('loadedmetadata', resumeOnce);
  };
  audioEl.addEventListener('loadedmetadata', resumeOnce);
  audioEl.play().catch(() => {});

  clearInterval(songPositionSaveTimer);
  songPositionSaveTimer = setInterval(saveSongPosition, 4000);
  audioEl.onpause = saveSongPosition;
  audioEl.onended = () => playAdjacentSong(1);

  renderMusicPanel(category);
}

function saveSongPosition() {
  if (currentPlayingSongId == null || !currentPlayingCategory) return;
  const audioEl = document.getElementById('aplayer-el');
  const song = songsOf(currentPlayingCategory).find(s => s.id === currentPlayingSongId);
  if (!song || !isFinite(audioEl.currentTime)) return;
  song.position = audioEl.currentTime;
  saveState();
}

function closeAudioPlayer() {
  const modal = document.getElementById('audio-player-modal');
  const audioEl = document.getElementById('aplayer-el');
  if (!modal || !audioEl) return;
  saveSongPosition();
  clearInterval(songPositionSaveTimer);
  audioEl.pause();
  audioEl.src = '';
  modal.classList.add('hidden');
  const playedCategory = currentPlayingCategory;
  currentPlayingSongId = null;
  currentPlayingCategory = null;
  saveState();
  renderMusicPanel(playedCategory);
}

function playAdjacentSong(dir) {
  if (!currentPlayingCategory) return;
  const songs = songsOf(currentPlayingCategory);
  const idx = songs.findIndex(s => s.id === currentPlayingSongId);
  if (idx === -1) return;
  let next = idx + dir;
  while (next >= 0 && next < songs.length && !songBlobs[songs[next].id]) next += dir;
  if (next < 0 || next >= songs.length) { closeAudioPlayer(); return; }
  openAudioPlayer(songs[next].id, currentPlayingCategory);
}
