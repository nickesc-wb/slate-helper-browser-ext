// Checks that manifest.json and the feature files agree, so a missing or
// misordered script shows up here instead of as a silent no-op in Chrome.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, loadScripts, readJson } from './helpers/load.js';

const manifest = readJson('manifest.json');
const [pageWorld, isolated] = manifest.content_scripts;

const pageFeatureMetadataIds = () => {
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/page-features.js');
  return globalThis.SlateHelper.features.map((f) => f.id);
};

describe('manifest.json', () => {
  it('has a Chrome-style version (1 to 4 dot-separated integers)', () => {
    expect(manifest.version).toMatch(/^\d+(\.\d+){0,3}$/);
  });

  it('only points at files that exist', () => {
    const files = [
      manifest.background.service_worker,
      manifest.action.default_popup,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
      ...manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
    ];
    for (const f of files) expect(existsSync(resolve(ROOT, f)), f).toBe(true);
  });

  it('loads the page-world scripts in MAIN, runtime first and boot last', () => {
    expect(pageWorld.world).toBe('MAIN');
    expect(pageWorld.js.indexOf('src/page/runtime.js')).toBeLessThan(pageWorld.js.indexOf('src/page/cm-utils.js'));
    expect(pageWorld.js.at(-1)).toBe('src/page/boot.js');
  });

  it('loads core.js first and main.js last in the isolated world', () => {
    expect(isolated.world).toBeUndefined();
    expect(isolated.js[0]).toBe('src/content/core.js');
    expect(isolated.js.at(-1)).toBe('src/content/main.js');
  });

  it('lists every feature file', () => {
    const listed = new Set(manifest.content_scripts.flatMap((cs) => cs.js));
    for (const dir of ['src/page/features', 'src/content/features']) {
      for (const f of readdirSync(resolve(ROOT, dir))) {
        expect(listed.has(`${dir}/${f}`), `${dir}/${f} is not in manifest.json`).toBe(true);
      }
    }
  });

  it('every page feature has popup metadata, and every metadata entry has code', () => {
    const codeIds = pageWorld.js
      .filter((f) => f.startsWith('src/page/features/'))
      .map((f) => readFileSync(resolve(ROOT, f), 'utf8').match(/registerFeature\('([^']+)'/)[1]);
    expect(pageFeatureMetadataIds().sort()).toEqual(codeIds.sort());
  });
});
