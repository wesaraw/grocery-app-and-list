#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const STORE_SELECTION_KEY = 'storeSelections';

async function stripStoreSelections(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(contents);
  if (!Object.prototype.hasOwnProperty.call(data, STORE_SELECTION_KEY)) {
    return false;
  }
  delete data[STORE_SELECTION_KEY];
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/removeStoreSelections.js <backup-file> [...]');
    process.exit(1);
  }

  for (const arg of args) {
    const filePath = path.resolve(process.cwd(), arg);
    try {
      const changed = await stripStoreSelections(filePath);
      if (changed) {
        console.log(`${arg}: removed legacy storeSelections data.`);
      } else {
        console.log(`${arg}: no storeSelections key found.`);
      }
    } catch (err) {
      console.error(`${arg}: failed to process file.`, err);
      process.exitCode = 1;
    }
  }
}

main();
