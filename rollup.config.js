import { globSync } from 'glob';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const commonPlugins = [nodeResolve(), commonjs(), json(), typescript()];

const generalFiles = globSync('src/**/*.{js,ts}', { ignore: 'src/scrapers/**' });
const scraperFiles = globSync('src/scrapers/**/*.ts');

export default [
  {
    input: generalFiles,
    external: ['ajv', '@xmldom/xmldom'],
    output: {
      dir: 'extension',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src'
    },
    plugins: commonPlugins
  },
  {
    input: scraperFiles,
    external: ['ajv', '@xmldom/xmldom'],
    output: {
      dir: 'extension/scrapers/generated',
      format: 'esm',
      sourcemap: true,
      preserveModules: true,
      preserveModulesRoot: 'src/scrapers'
    },
    plugins: commonPlugins
  }
];
