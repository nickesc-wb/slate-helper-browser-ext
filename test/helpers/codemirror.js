// A CodeMirror 5 setup like Slate's source view: htmlmixed with {{ }} and
// {% %} multiplexed in as Liquid, plus the addons Slate loads.
import CodeMirror from 'codemirror';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/addon/mode/multiplex.js';
import 'codemirror/addon/fold/xml-fold.js';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/addon/hint/html-hint.js';
import { loadScripts } from './load.js';

// jsdom has no layout; CodeMirror only needs these to return something.
const rect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
Range.prototype.getBoundingClientRect = rect;
Range.prototype.getClientRects = () => ({ length: 0, item: () => null });

window.CodeMirror = CodeMirror;

const liquidInner = { token: (stream) => { stream.next(); return null; } };
CodeMirror.defineMode('liquid', (config) => CodeMirror.multiplexingMode(
  CodeMirror.getMode(config, 'htmlmixed'),
  { open: '{{', close: '}}', mode: liquidInner, delimStyle: 'liquid' },
  { open: '{%', close: '%}', mode: liquidInner, delimStyle: 'liquid' },
));

// Cursor marker in test strings. Not "|": that's Liquid's filter pipe.
const CARET = '‸';

/** Put text in the editor. "‸" marks the cursor; "‸...‸" marks a selection. */
export const setValue = (cm, value) => {
  const marks = [...value.matchAll(new RegExp(CARET, 'g'))].map((m) => m.index);
  cm.setValue(value.replaceAll(CARET, ''));
  if (marks.length === 1) cm.setCursor(cm.posFromIndex(marks[0]));
  if (marks.length === 2) cm.setSelection(cm.posFromIndex(marks[0]), cm.posFromIndex(marks[1] - 1));
};

/** The editor's text with "‸" at the cursor (or around the selection). */
export const show = (cm) => {
  const text = cm.getValue();
  const from = cm.indexFromPos(cm.getCursor('from'));
  const to = cm.indexFromPos(cm.getCursor('to'));
  if (from === to) return text.slice(0, from) + CARET + text.slice(from);
  return text.slice(0, from) + CARET + text.slice(from, to) + CARET + text.slice(to);
};

// Every page feature option's default, from the popup metadata, keyed the way
// main.js hands them to the page: { 'feature.option': true | false }.
const defaultOptions = () => {
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/page-features.js');
  const SH = globalThis.SlateHelper;
  return Object.fromEntries(SH.features.flatMap((f) =>
    (f.options || []).map((o) => [SH.optionKey(f.id, o.id), o.defaultEnabled])));
};

/**
 * A fresh page runtime with the given page features enabled, and one editor
 * holding value. options override the defaults: { 'feature.option': false }.
 * cmOptions are extra CodeMirror options.
 */
export const setupEditor = (features, value, options = {}, cmOptions = {}) => {
  document.body.innerHTML = '';
  delete window.SlateHelperPage;
  loadScripts('src/page/runtime.js', 'src/page/cm-utils.js', ...features.map((f) => `src/page/features/${f}.js`));

  const cm = CodeMirror(document.body, { mode: 'liquid', value: '', indentUnit: 2, ...cmOptions });
  setValue(cm, value);
  const config = { enabled: features, options: { ...defaultOptions(), ...options } };
  document.documentElement.setAttribute('data-slate-helper-config', JSON.stringify(config));
  window.SlateHelperPage.boot();
  return cm;
};

// What CodeMirror does with keys no handler takes.
const DEFAULTS = {
  Backspace: (cm) => cm.execCommand('delCharBefore'),
  Enter: (cm) => cm.execCommand('newlineAndIndent'),
  Tab: (cm) => cm.execCommand('defaultTab'),
};

/**
 * Press a key the way CodeMirror dispatches it: through the added key maps in
 * order, skipping handlers that return Pass. Characters are written "'('".
 */
export const press = (cm, key) => {
  for (const map of cm.state.keyMaps) {
    const handler = map[key];
    if (!handler) continue;
    const result = typeof handler === 'string' ? cm.execCommand(handler) : handler(cm);
    if (result !== CodeMirror.Pass) return;
  }
  if (DEFAULTS[key]) return DEFAULTS[key](cm);
  if (key.length === 3 && key[0] === "'") return cm.replaceSelection(key[1], null, '+input');
  throw new Error(`No default for key ${key}`);
};

/** Type text one character at a time. */
export const type = (cm, text) => {
  for (const ch of text) press(cm, `'${ch}'`);
};

export { CodeMirror };
