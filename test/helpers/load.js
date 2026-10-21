// The extension's scripts are plain browser scripts (no modules) that talk
// through globals, so tests run them the way Chrome does: read the file and
// evaluate it in the page.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

export const loadScripts = (...paths) => {
  for (const p of paths) {
    // sourceURL makes stack traces point at the real file.
    new Function(`${readFileSync(resolve(ROOT, p), 'utf8')}\n//# sourceURL=${p}`)();
  }
};

export const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
