#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { applyPackCountRepair } from '../utils/packCountRepair.js';

function isFinalProductEntry(key, value) {
  return key.startsWith('final_product_') && value && typeof value === 'object';
}

function summarizeChange(key, original, updated) {
  return {
    key,
    name: original.name,
    sizeBefore: original.size,
    sizeAfter: updated.size
  };
}

async function repairFile(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(contents);
  const changes = [];

  for (const [key, value] of Object.entries(data)) {
    if (!isFinalProductEntry(key, value)) continue;

    const { changed, product } = applyPackCountRepair(value);
    if (changed) {
      data[key] = product;
      changes.push(summarizeChange(key, value, product));
    }
  }

  if (changes.length > 0) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  return changes;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/repairPackCountWeights.js <backup-file> [...]');
    process.exit(1);
  }

  for (const arg of args) {
    const filePath = path.resolve(process.cwd(), arg);
    try {
      const changes = await repairFile(filePath);
      if (changes.length === 0) {
        console.log(`${arg}: no updates needed.`);
      } else {
        console.log(`${arg}: updated ${changes.length} entr${changes.length === 1 ? 'y' : 'ies'}.`);
        for (const change of changes) {
          console.log(`  - ${change.name || change.key}: ${change.sizeBefore || 'unknown'} -> ${change.sizeAfter || 'unknown'}`);
        }
      }
    } catch (err) {
      console.error(`${arg}: failed to repair file.`, err);
      process.exitCode = 1;
    }
  }
}

main();
