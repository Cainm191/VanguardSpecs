/* app.js — Vanguard Specs application logic */

const SHOPIFY_FEED_URL = 'https://www.unlimitedairsoftshop.co.nz/products.json?limit=250';

const state = {
  products: [],
  filtered: [],
  search: '',
  filters: { manufacturer: null, type: null, fpsRange: null },
  compareIds: new Set(),
  currentDetailId: null,
};

const FPS_RANGES = [
  { id: 'lt300', label: '<300 FPS', test: (f) => f != null && f < 300 },
  { id: '300-400', label: '300–400', test: (f) => f != null && f >= 300 && f <= 400 },
  { id: 'gt400', label: '400+', test: (f) => f != null && f > 400 },
];

/* ---------- DOM refs ---------- */
const $ = (sel) => document.querySelector(sel);
const els = {
  searchInput: $('#searchInput'),
  filterChips: $('#filterChips'),
  resultCount: $('#resultCount'),
  productGrid: $('#productGrid'),
  emptyState: $('#emptyState'),
  syncBtn: $('#syncBtn'),
  syncStatus: $('#syncStatus'),
  themeBtn: $('#themeBtn'),
  viewHome: $('#view-home'),
  viewDetail: $('#view-detail'),
  viewCompare: $('#view-compare'),
  detailContent: $('#detailContent'),
  compareContent: $('#compareContent'),
  compareFab: $('#compareFab'),
  compareFabCount: $('#compareFabCount'),
  backFromDetail: $('#backFromDetail'),
  backFromCompare: $('#backFromCompare'),
  lightbox: $('#lightbox'),
  lightboxImg: $('#lightboxImg'),
  lightboxClose: $('#lightboxClose'),
};

/* ---------- INIT ---------- */
init();

async function init() {
  initTheme();
  bindGlobalEvents();
  registerServiceWorker();

  const cached = await VSStorage.getProducts();
  if (cached && cached.length) {
    state.products = cached;
    applyFilters();
    renderFilterChips();
  } else {
    renderEmpty('No catalog cached yet — tap sync to load products.');
  }

  // Always attempt a background sync on load (network-first for data),
  // silently falling back to cache if offline.
  syncData({ silent: true });
}

/* ---------- THEME ---------- */
function initTheme() {
  const saved = localStorage.getItem('vs_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'dark'); // default dark per brief
  document.body.dataset.theme = theme;
}

els.themeBtn.addEventListener('click', () => {
  const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = next;
  localStorage.setItem('vs_theme', next);
});

/* ---------- SERVICE WORKER ---------- */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker registration failed', err);
      });
    });
  }
}

/* ---------- SYNC ---------- */
async function syncData({ silent = false } = {}) {
  setSyncing(true);
  if (!silent) showSyncStatus('Syncing catalog…');

  try {
    const res = await fetch(SHOPIFY_FEED_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rawProducts = json.products || [];
    const parsed = VSParser.parseProducts(rawProducts);

    await VSStorage.saveProducts(parsed);
    await VSStorage.setMeta('lastSync', new Date().toISOString());

    state.products = parsed;
    applyFilters();
    renderFilterChips();

    showSyncStatus(`Synced ${parsed.length} products`, false);
  } catch (err) {
    console.warn('Sync failed, using cached data', err);
    if (state.products.length) {
      showSyncStatus('Offline — showing cached catalog', true);
    } else {
      showSyncStatus('Sync failed and no cache available', true);
    }
  } finally {
    setSyncing(false);
  }
}

els.syncBtn.addEventListener('click', () => syncData({ silent: false }));

function setSyncing(isSyncing) {
  els.syncBtn.querySelector('.sync-icon').classList.toggle('spinning', isSyncing);
  els.syncBtn.disabled = isSyncing;
}

let syncStatusTimer = null;
function showSyncStatus(message, isError = false) {
  els.syncStatus.textContent = message;
  els.syncStatus.hidden = false;
  els.syncStatus.classList.toggle('error', !!isError);
  clearTimeout(syncStatusTimer);
  syncStatusTimer = setTimeout(() => { els.syncStatus.hidden = true; }, 3200);
}

/* ---------- SEARCH + FILTERS ---------- */
let searchDebounce = null;
els.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const val = e.target.value;
  searchDebounce = setTimeout(() => {
    state.search = val.trim().toLowerCase();
    applyFilters();
  }, 60); // near-instant; debounce only smooths fast typing
});

function renderFilterChips() {
  const manufacturers = uniqueSorted(state.products.map((p) => p.manufacturer).filter((m) => m && m !== 'Unknown'));
  const types = uniqueSorted(state.products.map((p) => p.type).filter((t) => t && t !== 'Unknown'));

  let html = '';

  if (types.length) {
    html += `<span class="chip-group-label">Type</span>`;
    types.forEach((t) => {
      html += chipHtml('type', t, t);
    });
  }

  html += `<span class="chip-group-label">FPS</span>`;
  FPS_RANGES.forEach((r) => {
    html += chipHtml('fpsRange', r.id, r.label);
  });

  if (manufacturers.length) {
    html += `<span class="chip-group-label">Brand</span>`;
    manufacturers.forEach((m) => {
      html += chipHtml('manufacturer', m, m);
    });
  }

  els.filterChips.innerHTML = html;

  els.filterChips.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.group;
      const value = chip.dataset.value;
      state.filters[group] = state.filters[group] === value ? null : value;
      applyFilters();
      renderFilterChips();
    });
  });
}

function chipHtml(group, value, label) {
  const active = state.filters[group] === value;
  return `<button class="chip${active ? ' active' : ''}" data-group="${group}" data-value="${escAttr(value)}">${escHtml(label)}</button>`;
}

function applyFilters() {
  const { manufacturer, type, fpsRange } = state.filters;
  const rangeDef = FPS_RANGES.find((r) => r.id === fpsRange);

  state.filtered = state.products.filter((p) => {
    if (state.search) {
      const hay = `${p.title} ${p.manufacturer} ${p.type} ${p.fps || ''} ${p.gasType}`.toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    if (manufacturer && p.manufacturer !== manufacturer) return false;
    if (type && p.type !== type) return false;
    if (rangeDef && !rangeDef.test(p.fps)) return false;
    return true;
  });

  renderGrid();
}

/* ---------- GRID RENDER ---------- */
function renderGrid() {
  els.resultCount.textContent = `${state.filtered.length} of ${state.products.length} guns`;

  if (!state.filtered.length) {
    els.productGrid.innerHTML = '';
    renderEmpty(state.products.length ? 'No matches — try a different search or filter.' : 'No catalog cached yet — tap sync to load products.');
    return;
  }
  els.emptyState.hidden = true;

  const frag = document.createDocumentFragment();
  state.filtered.forEach((p) => frag.appendChild(productCard(p)));
  els.productGrid.innerHTML = '';
  els.productGrid.appendChild(frag);
}

function renderEmpty(message) {
  els.emptyState.hidden = false;
  els.emptyState.querySelector('span').textContent = message;
}

function productCard(p) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.id = p.id;

  const inCompare = state.compareIds.has(p.id);

  card.innerHTML = `
    <div class="card-img-wrap">
      ${p.image ? `<img loading="lazy" src="${escAttr(p.image)}" alt="${escAttr(p.title)}">` : `<span class="ph">No image</span>`}
    </div>
    <button class="compare-toggle${inCompare ? ' active' : ''}" aria-label="Add to compare" title="Add to compare">${inCompare ? '✓' : '+'}</button>
    <div class="card-body">
      <span class="card-mfr">${escHtml(p.manufacturer)}</span>
      <span class="card-title">${escHtml(p.title)}</span>
      <div class="card-specs">
        ${p.fps ? `<span class="spec-pill">${p.fps} FPS</span>` : ''}
        ${p.type && p.type !== 'Unknown' ? `<span class="spec-pill">${escHtml(p.type)}</span>` : ''}
        ${p.gasType && p.gasType !== 'Unknown' ? `<span class="spec-pill">${escHtml(p.gasType)}</span>` : ''}
      </div>
    </div>
  `;

  card.querySelector('.compare-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCompare(p.id);
  });

  card.addEventListener('click', () => openDetail(p.id));

  return card;
}

/* ---------- COMPARE ---------- */
function toggleCompare(id) {
  if (state.compareIds.has(id)) {
    state.compareIds.delete(id);
  } else {
    if (state.compareIds.size >= 4) {
      showSyncStatus('You can compare up to 4 guns at a time', true);
      return;
    }
    state.compareIds.add(id);
  }
  updateCompareFab();
  renderGrid();
  if (!els.viewDetail.hidden) renderDetail(state.currentDetailId); // refresh add button state
}

function updateCompareFab() {
  const count = state.compareIds.size;
  els.compareFabCount.textContent = count;
  els.compareFab.hidden = count === 0;
}

els.compareFab.addEventListener('click', openCompare);

function openCompare() {
  showView('compare');
  renderCompare();
}

function renderCompare() {
  const items = state.products.filter((p) => state.compareIds.has(p.id));

  if (!items.length) {
    els.compareContent.innerHTML = `<div class="compare-empty">No guns selected yet. Add up to 4 from the catalog to compare specs side by side.</div>`;
    return;
  }

  const rows = [
    { key: 'fps', label: 'FPS', fmt: (v) => v != null ? `${v} fps` : '—' },
    { key: 'joules', label: 'Joules', fmt: (v) => v != null ? `${v} J` : '—' },
    { key: 'gasType', label: 'Gas Type', fmt: (v) => v || '—' },
    { key: 'magCapacity', label: 'Mag Capacity', fmt: (v) => v || '—' },
    { key: 'length', label: 'Length', fmt: (v) => v || '—' },
    { key: 'weight', label: 'Weight', fmt: (v) => v || '—' },
    { key: 'category', label: 'Category', fmt: (v) => v || '—' },
    { key: 'type', label: 'Type', fmt: (v) => v || '—' },
  ];

  let html = `<div class="compare-scroll"><table class="compare-table"><thead><tr><th></th>`;
  items.forEach((p) => {
    html += `<th class="compare-col-head">
      ${p.image ? `<img src="${escAttr(p.image)}" alt="">` : ''}
      <div class="name">${escHtml(p.title)}</div>
      <button class="compare-remove" data-id="${p.id}">Remove</button>
    </th>`;
  });
  html += `</tr></thead><tbody>`;

  rows.forEach((row) => {
    const values = items.map((p) => p[row.key]);
    const allSame = values.every((v) => (v ?? null) === (values[0] ?? null));
    html += `<tr><td class="compare-row-label">${row.label}</td>`;
    items.forEach((p) => {
      html += `<td class="${allSame ? '' : 'diff-cell'}">${escHtml(row.fmt(p[row.key]))}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;
  els.compareContent.innerHTML = html;

  els.compareContent.querySelectorAll('.compare-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleCompare(Number(btn.dataset.id));
      renderCompare();
    });
  });
}

/* ---------- DETAIL VIEW ---------- */
function openDetail(id) {
  state.currentDetailId = id;
  renderDetail(id);
  showView('detail');
}

function renderDetail(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return;

  const images = p.images && p.images.length ? p.images : (p.image ? [p.image] : []);
  const inCompare = state.compareIds.has(p.id);

  const galleryHtml = images.length
    ? images.map((src) => `<img src="${escAttr(src)}" alt="${escAttr(p.title)}" data-fullsrc="${escAttr(src)}">`).join('')
    : `<span class="ph">No images available</span>`;

  els.detailContent.innerHTML = `
    <div class="detail-gallery">${galleryHtml}</div>
    <div class="detail-eyebrow">${escHtml(p.manufacturer)}${p.category ? ' · ' + escHtml(p.category) : ''}</div>
    <h1 class="detail-title">${escHtml(p.title)}</h1>
    <div class="detail-meta">${p.price ? `$${escHtml(p.price)} NZD` : ''}</div>

    <div class="spec-grid">
      ${specBox('FPS', p.fps ? `${p.fps}` : null)}
      ${specBox('Joules', p.joules ? `${p.joules} J` : null)}
      ${specBox('Gas Type', p.gasType !== 'Unknown' ? p.gasType : null)}
      ${specBox('Mag Capacity', p.magCapacity)}
      ${specBox('Length', p.length)}
      ${specBox('Weight', p.weight)}
    </div>

    <h2 class="detail-section-title">Description</h2>
    <div class="detail-description">${sanitizeHtml(p.bodyHtml) || '<p>No description available.</p>'}</div>

    <button class="detail-add-compare${inCompare ? ' added' : ''}" id="detailCompareBtn">
      ${inCompare ? '✓ Added to comparison' : '+ Add to compare'}
    </button>
  `;

  els.detailContent.querySelector('#detailCompareBtn').addEventListener('click', () => toggleCompare(p.id));

  els.detailContent.querySelectorAll('.detail-gallery img').forEach((img) => {
    img.addEventListener('click', () => openLightbox(img.dataset.fullsrc));
  });
}

function specBox(label, value) {
  return `<div class="spec-box"><div class="label">${label}</div><div class="value${value ? '' : ' muted'}">${value ? escHtml(value) : 'Not listed'}</div></div>`;
}

/* ---------- LIGHTBOX ---------- */
function openLightbox(src) {
  els.lightboxImg.src = src;
  els.lightbox.hidden = false;
}
els.lightboxClose.addEventListener('click', () => { els.lightbox.hidden = true; });
els.lightbox.addEventListener('click', (e) => { if (e.target === els.lightbox) els.lightbox.hidden = true; });

/* swipe support on detail gallery is native via horizontal scroll + snap (CSS) */

/* ---------- VIEW ROUTING ---------- */
function showView(name) {
  els.viewHome.hidden = name !== 'home';
  els.viewDetail.hidden = name !== 'detail';
  els.viewCompare.hidden = name !== 'compare';
  window.scrollTo(0, 0);
}

els.backFromDetail.addEventListener('click', () => showView('home'));
els.backFromCompare.addEventListener('click', () => showView('home'));

function bindGlobalEvents() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.lightbox.hidden) { els.lightbox.hidden = true; return; }
      if (!els.viewDetail.hidden || !els.viewCompare.hidden) showView('home');
    }
  });
}

/* ---------- UTIL ---------- */
function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(str) {
  return escHtml(str).replace(/"/g, '&quot;');
}

/**
 * Minimal allow-list HTML sanitizer for Shopify product descriptions.
 * Strips scripts, event handlers, and disallowed tags/attributes
 * before rendering into the DOM.
 */
function sanitizeHtml(html) {
  if (!html) return '';
  const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'SPAN', 'DIV', 'H3', 'H4', 'A', 'IMG', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD']);
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 1) {
        if (!allowedTags.has(child.tagName)) {
          // unwrap disallowed tag, keep its text/children
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        [...child.attributes].forEach((attr) => {
          const n = attr.name.toLowerCase();
          if (n.startsWith('on') || (n === 'href' && /^javascript:/i.test(attr.value))) {
            child.removeAttribute(attr.name);
          }
          if (!['href', 'src', 'alt', 'title', 'target'].includes(n)) {
            child.removeAttribute(attr.name);
          }
        });
        if (child.tagName === 'A') child.setAttribute('target', '_blank');
        walk(child);
      } else if (child.nodeType === 8) {
        node.removeChild(child); // comments
      }
    });
  };
  walk(tmp);
  return tmp.innerHTML;
}
