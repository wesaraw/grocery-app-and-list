#!/usr/bin/env node
import process from 'node:process';
import { importMealimeRecipe } from './importer.js';

function printUsage() {
  console.log('Usage: mealime-import [options] <url-or-id>');
  console.log('');
  console.log('Options:');
  console.log('  --pretty         Pretty-print the resulting JSON');
  console.log('  --no-augment     Skip scanning steps for missing quantities');
  console.log('  --help           Show this message');
}

function parseArgs(argv) {
  const options = {
    pretty: false,
    augmentFromSteps: true,
  };

  const positional = [];

  for (const arg of argv) {
    if (arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '--no-augment') {
      options.augmentFromSteps = false;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length === 0 && !options.help) {
    throw new Error('Missing required <url-or-id> argument');
  }

  options.target = positional[0];
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    printUsage();
    process.exit(1);
    return;
  }

  if (options.help) {
    printUsage();
    process.exit(0);
    return;
  }

  try {
    const recipe = await importMealimeRecipe(options.target, {
      augmentFromSteps: options.augmentFromSteps,
    });

    const output = options.pretty ? JSON.stringify(recipe, null, 2) : JSON.stringify(recipe);
    console.log(output);
  } catch (err) {
    console.error(`Failed to import Mealime recipe: ${err.message || err}`);
    process.exit(1);
  }
}

main();
