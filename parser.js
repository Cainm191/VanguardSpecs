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
];

const GAS_TYPES = [
  { label: 'Green Gas', test: /\bgreen\s?gas\b/i },
  { label: 'CO2', test: /\bco2\b|\bco₂\b/i },
  { label: 'HPA', test: /\bhpa\b|\bhigh\s?pressure\s?air\b/i },
  { label: 'Electric / AEG', test: /\baeg\b|\belectric\b/i },
  { label: 'Spring', test: /\bspring\b(?!\s?steel)/i },
];

function extractManufacturer(title) {
  if (!title) return 'Unknown';
  for (const brand of MANUFACTURER_KEYWORDS) {
    const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(title)) {
      return brand === 'TM' ? 'Tokyo Marui' : brand;
    }
  }
  return 'Unknown';
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
  if (/\bgbb\b|gas\s?blow\s?back/i.test(text)) return 'GBB';
  if (/\baeg\b/i.test(text)) return 'AEG';
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
    manufacturer: extractManufacturer(title) !== 'Unknown'
      ? extractManufacturer(title)
      : extractManufacturer(combined),
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
  };
}

function parseProducts(rawProducts) {
  return (rawProducts || []).map(parseProduct);
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
  stripHTML,
};
