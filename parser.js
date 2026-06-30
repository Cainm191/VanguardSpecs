/* parser.js
 * Smart Parser Engine for Vanguard Specs.
 * Extracts structured gun specs from raw Shopify product titles/descriptions.
 */

const MANUFACTURER_KEYWORDS = [
  'WE', 'WE-Tech', 'Tokyo Marui', 'TM', 'G&G', 'VFC', 'CYMA', 'KWA', 'KSC',
  'ASG', 'Krytac', 'Elite Force', 'ICS', 'Classic Army', 'Ares', 'Lancer Tactical',
  'Umarex', 'Specna Arms', 'APS', 'APS-X', 'EMG', 'Action Army', 'King Arms',
  'Maxx Model', 'Bell', 'Army Armament', 'WELL', 'Double Bell', 'JAG Arms',
  'Secutor', 'Novritsch', 'Glock', 'SIG', 'Cybergun', 'Echo1', 'Valken',
  // Added from Unlimited Airsoft Shop's own brand/category navigation:
  'SRC', 'A&K', 'GHK', 'LCT', 'NorthEast', 'AceTech', 'KJ Works', 'WinGun',
  'WG', 'KWC', 'Bolt Airsoft',
];

// Short, ambiguous codes that double as common English words/abbreviations.
// Only trusted as a manufacturer match when found in the (short, deliberate) title —
// never in free-form body text, where they cause false positives (e.g. "We begin with...").
const AMBIGUOUS_CODES = new Set(['WE', 'TM']);

// Vendors in this feed that are never airsoft guns (watches, apparel, footwear, etc.)
// — used to exclude clearly-unrelated stock that shares the same Shopify catalog.
const EXCLUDED_VENDORS = new Set([
  'casio / g shock', 'casio', 'g-shock', 'g shock', 'swanndri', 'hi-tec', 'hitec',
]);

// Title/description phrases that flag an item as a non-gun accessory, archery
// product, apparel, or general store item rather than an airsoft gun itself.
const EXCLUDE_PATTERNS = [
  /\bbow\b|\barchery\b|\barrow(s)?\b/i,
  /\bcleaning\s?rod\b/i,
  /\bkill\s?rag\b/i,
  /\brepair\s?mat\b/i,
  /\bback\s?pack\b|\bbackpack\b/i,
  /\bplate\s?carrier\b/i,
  /\bbushshirt\b|\bwool\b|\bzip\sfront\b/i,
  /\bhiking\s?boot\b|\bwaterproof\s?shoe\b/i,
  /\bwristwatch\b|\bstopwatch\b|\bwater\s?resistance\b/i,
];

// Checked against the TITLE only (not body text), since these are standalone
// accessory product titles in the store's own nav (Battery & Charger / GBB
// & AEG Magazine / Gas & Lube) — checking body text would wrongly exclude
// real guns, whose descriptions almost always mention battery/magazine use.
const EXCLUDE_TITLE_PATTERNS = [
  /\bmagazine\b/i,
  /\bbattery\b|\bcharger\b/i,
  /\bgas\s?&\s?lube\b|\bsilicone\s?lube\b|\blube\b/i,
];

const GAS_TYPES = [
  { label: 'Green Gas', test: /\bgreen\s?gas\b/i },
  { label: 'CO2', test: /\bco2\b|\bco₂\b/i },
  { label: 'HPA', test: /\bhpa\b|\bhigh\s?pressure\s?air\b/i },
  { label: 'Electric / AEG', test: /\baeg\w*\b|\belectric\b/i },
  { label: 'Spring', test: /\bspring\b(?!\s?steel)/i },
];

function extractManufacturer(title, bodyText) {
  if (!title) return 'Unknown';

  // First pass: title only, all keywords allowed (titles are short and deliberate).
  for (const brand of MANUFACTURER_KEYWORDS) {
    const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(title)) {
      return brand === 'TM' ? 'Tokyo Marui' : brand;
    }
  }

  // Second pass: body text, excluding ambiguous codes that double as common words.
  if (bodyText) {
    for (const brand of MANUFACTURER_KEYWORDS) {
      if (AMBIGUOUS_CODES.has(brand)) continue;
      const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(bodyText)) return brand;
    }
  }

  return 'Unknown';
}

/**
 * Returns true if a listing should be treated as an airsoft gun.
 *
 * This feed has no reliable product_type/category field (it's blank on
 * almost everything) and vendor is inconsistent, so rather than requiring
 * proof a listing IS a gun (which misses plain-title guns with no spec
 * text, e.g. "VFC M4 GBBR"), this excludes listings that are clearly NOT
 * guns (watches, apparel, footwear, archery gear, cleaning accessories)
 * and includes everything else by default.
 */
function isAirsoftGun(title, vendor, text) {
  const v = (vendor || '').trim().toLowerCase();
  if (EXCLUDED_VENDORS.has(v)) return false;

  if (EXCLUDE_TITLE_PATTERNS.some((re) => re.test(title || ''))) return false;

  const hay = `${title || ''} ${text || ''}`;
  if (EXCLUDE_PATTERNS.some((re) => re.test(hay))) return false;

  return true;
}

function extractFPS(text) {
  if (!text) return null;
  const match = text.match(/(\d{2,4})\s?\+?\s?fps/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractJoules(text) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s?j(?:oules?)?\b/i);
  if (match) return parseFloat(match[1]);
  return null;
}

function extractGasType(text) {
  if (!text) return 'Unknown';
  for (const gas of GAS_TYPES) {
    if (gas.test.test(text)) return gas.label;
  }
  return 'Unknown';
}

function extractMagCapacity(text) {
  if (!text) return null;
  // patterns like "30 rounds", "24+1", "300rd hi-cap"
  let match = text.match(/(\d{1,3}\s?\+\s?1)\b/i);
  if (match) return match[1].replace(/\s/g, '');
  match = text.match(/(\d{1,4})\s?(?:rd|round|rounds)\b/i);
  if (match) return `${match[1]} rounds`;
  return null;
}

function extractLength(text) {
  if (!text) return null;
  const match = text.match(/(\d{2,3}(?:\.\d+)?)\s?(mm|cm|in|inch(?:es)?)\b/i);
  if (match) return `${match[1]}${match[2].toLowerCase()}`;
  return null;
}

function extractWeight(text) {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s?(kg|g|lbs?|oz)\b/i);
  if (match) return `${match[1]}${match[2].toLowerCase()}`;
  return null;
}

function extractType(text) {
  if (!text) return 'Unknown';
  if (/\bgbb\w*\b|gas\s?blow\s?back/i.test(text)) return 'GBB';
  if (/\baeg\w*\b/i.test(text)) return 'AEG';
  if (/\bhpa\b/i.test(text)) return 'HPA';
  if (/\bgas\b/i.test(text)) return 'GBB';
  if (/\bspring\b/i.test(text)) return 'Spring';
  return 'Unknown';
}

/**
 * Strips HTML tags to plain text for regex scanning (does NOT sanitize for rendering).
 */
function stripHTML(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Parses a raw Shopify product object into a normalized spec record.
 */
function parseProduct(raw) {
  const title = raw.title || '';
  const bodyText = stripHTML(raw.body_html || '');
  const combined = `${title} ${bodyText}`;

  const variant = (raw.variants && raw.variants[0]) || {};
  const image = (raw.images && raw.images[0] && raw.images[0].src)
    || raw.image && raw.image.src
    || null;

  return {
    id: raw.id,
    handle: raw.handle,
    title,
    manufacturer: extractManufacturer(title, bodyText),
    category: raw.product_type || 'Uncategorized',
    type: extractType(combined),
    fps: extractFPS(combined),
    joules: extractJoules(combined),
    gasType: extractGasType(combined),
    magCapacity: extractMagCapacity(combined),
    length: extractLength(combined),
    weight: extractWeight(combined),
    price: variant.price || null,
    bodyHtml: raw.body_html || '',
    images: (raw.images || []).map((img) => img.src),
    image,
    vendor: raw.vendor || null,
    tags: raw.tags || '',
    updatedAt: raw.updated_at || null,
    isGun: isAirsoftGun(title, raw.vendor, bodyText),
  };
}

function parseProducts(rawProducts) {
  return (rawProducts || [])
    .map(parseProduct)
    .filter((p) => p.isGun);
}

window.VSParser = {
  parseProduct,
  parseProducts,
  extractManufacturer,
  extractFPS,
  extractJoules,
  extractGasType,
  extractMagCapacity,
  extractLength,
  extractWeight,
  extractType,
  isAirsoftGun,
  stripHTML,
};
