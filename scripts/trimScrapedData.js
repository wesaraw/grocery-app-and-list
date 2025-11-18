#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const SCRAPED_PREFIX = 'scraped_';

async function trimScrapedData(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(contents);
  let removed = 0;
  Object.keys(data || {}).forEach(key => {
    if (key.startsWith(SCRAPED_PREFIX)) {
      delete data[key];
      removed += 1;
    }
  });
  if (removed === 0) {
    return 0;
  }
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return removed;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/trimScrapedData.js <backup-file> [...]');
    process.exit(1);
  }

  for (const arg of args) {
    const filePath = path.resolve(process.cwd(), arg);
    try {
      const removed = await trimScrapedData(filePath);
      if (removed > 0) {
        console.log(`${arg}: removed ${removed} scraped_* entr${removed === 1 ? 'y' : 'ies'}.`);
      } else {
        console.log(`${arg}: no scraped_* entries found.`);
      }
    } catch (err) {
      console.error(`${arg}: failed to process file.`, err);
      process.exitCode = 1;
    }
  }
}

main();
