import { readFile } from 'fs/promises';
import assert from 'assert/strict';

const rootText = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');
const assetText = await readFile(new URL('../android/app/src/main/assets/db.js', import.meta.url), 'utf8');

function extractListKeys(text) {
  const match = text.match(/const listKeys = \[(.*?)\];/s);
  if (!match) throw new Error('listKeys not found');
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/['"`]/g, ''))
    .filter(Boolean);
}

const rootKeys = extractListKeys(rootText);
const assetKeys = extractListKeys(assetText);
assert.deepEqual(assetKeys, rootKeys, 'Android listKeys do not match root listKeys');

if (!/for\s*\(\s*const\s+key\s+of\s+listKeys\s*\)/.test(assetText)) {
  throw new Error('Android db.js missing listKeys migration loop');
}

console.log('android asset DB parity test passed');

