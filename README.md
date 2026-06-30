# Vanguard Specs

Offline-first PWA for searching and comparing airsoft gun specs pulled from the
Unlimited Airsoft Shop Shopify catalog.

## Files

```
index.html    app shell + all three views (catalog, detail, compare)
styles.css    design system, dark/light themes, responsive layout
app.js        routing, search/filter, compare logic, sync, rendering
parser.js     regex-based spec extraction (FPS, joules, gas type, mag, etc.)
storage.js    IndexedDB wrapper with localStorage fallback
sw.js         service worker — cache-first shell, network-first product data
manifest.json PWA manifest (name, icons, standalone display)
icons/        app icons generated from the Vanguard Specs shield mark
```

## Installing on iPhone / iPad

1. Host the folder over HTTPS (see Deploying below) — PWAs require a secure
   origin (or `localhost` during local testing).
2. Open the URL in **Safari** on the iPhone/iPad (it must be Safari, not
   Chrome — only Safari exposes "Add to Home Screen" on iOS).
3. Tap the **Share** icon (square with an arrow) in the toolbar.
4. Tap **Add to Home Screen**, confirm the name "Vanguard", and tap **Add**.
5. Launch the app from the home screen icon. It opens full-screen with no
   address bar, using the `display: standalone` setting in `manifest.json`
   and the `apple-mobile-web-app-capable` meta tag in `index.html`.

The same flow works on Mac (Safari → File → Add to Dock, or Chrome's "Install
app" button) and on desktop Chrome/Edge via the install icon in the address
bar.

## How offline mode works

On first visit, the service worker (`sw.js`) pre-caches the entire app shell
(HTML/CSS/JS/icons) during its `install` event. After that:

- **App shell** (`index.html`, `styles.css`, `app.js`, `parser.js`,
  `storage.js`, icons) is served **cache-first**: the cached copy is returned
  instantly, and the cache is refreshed in the background if the file changed.
  This is what makes load times near-instant and lets the app work with zero
  network connection.
- **Product data** (`unlimitedairsoftshop.co.nz/products.json`) is served
  **network-first**: the app always tries to fetch the latest catalog, and
  only falls back to the last cached response if the network call fails
  (e.g. no signal in a back room of the shop).
- **Product images** (Shopify CDN) use a stale-while-revalidate strategy —
  the cached image is shown immediately if present, while a fresh copy is
  fetched in the background for next time.
- Parsed product records also live in **IndexedDB** (via `storage.js`), so
  search/filter/compare all run against local data with no network round
  trip, even right after a fresh install. If IndexedDB isn't available, the
  app automatically falls back to `localStorage`.

Tapping the sync icon in the top bar re-fetches `products.json`, re-parses it
with the smart parser engine, and overwrites the IndexedDB store — the UI
updates immediately afterward.

## Deploying

**Option A — GitHub Pages**
1. Create a new repo and push these files to the root (or to `/docs`).
2. In repo Settings → Pages, set the source to the branch/folder containing
   `index.html`.
3. GitHub Pages serves over HTTPS automatically, which is required for
   service workers and "Add to Home Screen."

**Option B — Local server (for testing)**
```bash
cd vanguard-specs
python3 -m http.server 8080
# visit http://localhost:8080
```
Service workers are allowed on `localhost` without HTTPS, so this is fine for
development, but use HTTPS (GitHub Pages, Netlify, Vercel, your own host)
for the real iPhone install.

## Notes

- The Shopify feed is fetched client-side with no API key — only public
  `products.json` data is read.
- Product descriptions from Shopify are passed through a small allow-list
  sanitizer in `app.js` before being inserted into the page, stripping
  scripts and event-handler attributes.
- The comparison view highlights any spec row where the selected guns differ.
