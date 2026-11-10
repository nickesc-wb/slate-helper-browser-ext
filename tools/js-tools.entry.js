// Entry for src/vendor/js-tools.js (built by tools/build-vendor.mjs): the
// TypeScript language service, used for JavaScript suggestions and hover docs
// in <script>, with the browser (DOM), ES2023 and jQuery type definitions it
// reads them from. Those definitions are where the docs and MDN links come from.
// Injected into the page's MAIN world on demand (SHP.load('js-tools')).
import ts from 'typescript';
import declarations from 'slate-helper:js-declarations';

const FILE = '/slate.js';

/**
 * One language service over a single JavaScript file. Every <script> on the
 * page shares one global scope, so the page code passes all of them in one
 * text (src/page/cm-utils.js, SHP.cm.js). setText(text) before each query.
 */
const createService = () => {
  let text = '';
  let version = 0;
  const host = {
    getScriptFileNames: () => [FILE, ...Object.keys(declarations).filter((f) => !f.startsWith('/lib/'))],
    getScriptVersion: (file) => (file === FILE ? String(version) : '1'),
    getScriptSnapshot: (file) => {
      const content = file === FILE ? text : declarations[file];
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => ({
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ES2023,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: [],
    }),
    getDefaultLibFileName: () => '/lib/lib.es2023.full.d.ts',
    fileExists: (file) => file === FILE || file in declarations,
    readFile: (file) => (file === FILE ? text : declarations[file]),
    directoryExists: () => true,
    getDirectories: () => [],
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return {
    file: FILE,
    service,
    setText(next) {
      if (next === text) return;
      text = next;
      version++;
    },
  };
};

window.SlateHelperPage.provide('js-tools', { ts, createService });
