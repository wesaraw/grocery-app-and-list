import { getImageSrc } from "../imageUtils.js";
import { parsePriceNumber, parseUnitPrice, UNIT_ALIASES } from "../priceUtils.js";
import {
  UNIT_FACTORS,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  COUNT_UNITS,
  getPackCount
} from "./common.js";
export function scrapeHannaford() {

  const products = [];
  const tiles = document.querySelectorAll('div.catalog-product');
  tiles.forEach(tile => {
    const linkRel = tile.getAttribute('href') || tile.getAttribute('data-url');
    const link = linkRel
      ? new URL(linkRel, 'https://www.hannaford.com').href
      : '';
    const name = tile.querySelector('.productName .real-product-name')?.innerText?.trim();
    const packMatch = name?.match(/(\d+)\s*(?:pk|pack|ct|count)/i);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;
    const priceText = tile.querySelector('.priceCell .item-unit-price')?.innerText?.trim();
    const priceHidden = tile.querySelector('.priceCell .item-price')?.value;
    const sizeText = tile.querySelector('.overline.text-truncate')?.innerText?.trim();
    const unitText = tile.querySelector('.unitPriceDisplay')?.innerText?.trim();
    const image = getImageSrc(tile.querySelector('img'));

    let priceNumber = null;
    if (priceHidden) {
      const p = parseFloat(priceHidden);
      if (!isNaN(p)) priceNumber = p;
    } else if (priceText) {
      const m = priceText.match(/\$?([0-9.]+)/);
      if (m) priceNumber = parseFloat(m[1]);
    }

    let unitQty = null;
    let unitType = null;
    if (unitText) {
      const clean = unitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d./]+)\/([a-zA-Z]+)/);
      if (match) {
        unitQty = parseNumber(match[1]);
        unitType = match[2];
      }
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d./]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseNumber(m[1]);
        sizeUnit = m[2];
      }
    }

    let convertedQty = null;
    let pricePerUnit = null;
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null) {
          pricePerUnit = priceNumber / convertedQty;
        }
      }
    }

    if (name && (priceText || priceNumber != null)) {
      products.push({
        name,
        price: priceText || (priceNumber != null ? `$${priceNumber.toFixed(2)}` : ''),
        priceNumber,
        size: sizeText || '',
        sizeQty,
        sizeUnit,
        unit: unitText || '',
        unitQty,
        unitType,
        convertedQty,
        pricePerUnit,
        packCount,
        image,
        link
      });
    }
  });
  return products;
}

function parseNumber(str) {
  if (typeof str !== "string") return NaN;
  let s = str.trim();
  if (!s) return NaN;
  const FRACTIONS = {"½":0.5,"¼":0.25,"¾":0.75,"⅓":1/3,"⅔":2/3,"⅛":1/8,"⅜":3/8,"⅝":5/8,"⅞":7/8};
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  for (const [u,v] of Object.entries(FRACTIONS)) {
    if (s.includes(u)) s = s.replace(new RegExp(u,"g"), ` ${v} `);
  }
  s = s.trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1],10) + parseInt(m[2],10)/parseInt(m[3],10);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1],10) / parseInt(m[2],10);
  m = s.match(/^(\d+)-(?:(\d+)\/(\d+))$/);
  if (m) return parseInt(m[1],10) + parseInt(m[2],10)/parseInt(m[3],10);
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
