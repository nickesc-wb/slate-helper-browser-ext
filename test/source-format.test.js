import { describe, expect, it, vi } from 'vitest';
import { sleep } from './helpers/load.js';
import { CodeMirror, press, provideFormatTools, setupEditor } from './helpers/codemirror.js';

// No CKEditor here, so this is the plain-CodeMirror path (Shift+Alt+F); Slate's
// own tidying (a round trip through CKEditor) needs a real Slate editor.
const PRETTIER = { 'source-format.prettier': true };

const formatted = async (value, options = {}) => {
  const cm = setupEditor(['source-format'], value, { ...PRETTIER, ...options });
  provideFormatTools();
  press(cm, 'Shift-Alt-F');
  await vi.waitFor(() => expect(cm.getValue()).not.toBe(value.replace('‸', '')));
  return cm;
};

const ON_OPEN = { ...PRETTIER, 'source-format.onOpen': true };

/** A page runtime with source-format and these options, on a new <body>. */
const boot = async (options) => {
  // Page runtimes from earlier tests still watch the old <body>, with their
  // own options, and a pending watcher timer would scan the whole document:
  // let those run out, then move to a body they don't watch.
  await sleep(40);
  document.body.replaceWith(document.createElement('body'));
  setupEditor(['source-format'], '', options);
};

/**
 * Open a CKEditor's source view the way Slate does, after the page runtime
 * has booted: a .cke element (with a stand-in CKEditor) gets a new CodeMirror.
 */
const openSource = (value) => {
  const editor = {
    mode: 'source', status: 'ready', on() {}, once() {},
    checkDirty: () => false, resetDirty: vi.fn(),
  };
  const cke = document.createElement('div');
  cke.className = 'cke';
  editor.container = { $: cke };
  window.CKEDITOR = { instances: { editor1: editor } };
  document.body.append(cke);
  const cm = CodeMirror(cke, { mode: 'liquid', value, indentUnit: 2 });
  return { cm, editor };
};

describe('source-format', () => {
  it("doesn't use Prettier unless its option is on", async () => {
    const loads = [];
    const listener = (e) => loads.push(e.detail);
    document.addEventListener('slate-helper:load', listener);
    const cm = setupEditor(['source-format'], '<div><p>x</p></div>');
    press(cm, 'Shift-Alt-F');
    await sleep(10);
    document.removeEventListener('slate-helper:load', listener);
    expect(loads).toEqual([]);
    expect(cm.getValue()).toBe('<div><p>x</p></div>');
  });

  it('with Prettier, formats HTML, CSS and JavaScript and keeps every Liquid tag exactly as written', async () => {
    const cm = await formatted(
      '<style>.a{color:red}</style><div><p>Hi {{first-name}}</p>'
      + "{% if {{status}} == \"Admit\" %}<a href=\"/x?id={{id}}\">‸Go</a>{% else %}<span>No</span>{% endif %}</div>"
      + '<script>var a=1;if(a){go()}</script>',
    );
    expect(cm.getValue()).toBe([
      '<style>',
      '  .a {',
      '    color: red;',
      '  }',
      '</style>',
      '<div>',
      '  <p>Hi {{first-name}}</p>',
      '  {% if {{status}} == "Admit" %}',
      '    <a href="/x?id={{id}}">Go</a>',
      '  {% else %}',
      '    <span>No</span>',
      '  {% endif %}',
      '</div>',
      '<script>',
      '  var a = 1;',
      '  if (a) {',
      '    go();',
      '  }',
      '</script>',
      '',
    ].join('\n'));
    // Prettier tracks the cursor by node: it stays on its line, not always on its character.
    expect(cm.getLine(cm.getCursor().line)).toContain('>Go<');
  });

  it('with Prettier, is one undo step', async () => {
    const value = '<div><p>x</p></div>';
    const cm = await formatted(value);
    cm.undo();
    expect(cm.getValue()).toBe(value);
  });

  it('with Prettier, leaves the code as it was, and says why, when it would change the Liquid', async () => {
    // Prettier's Liquid parser closes the {% if %} itself.
    const value = '<p>{% if x %}</p>';
    const cm = setupEditor(['source-format'], value, PRETTIER);
    provideFormatTools();
    press(cm, 'Shift-Alt-F');
    await vi.waitFor(() => expect(cm.getWrapperElement().querySelector('.slate-helper-format-notice')).not.toBeNull());
    expect(cm.getValue()).toBe(value);
  });

  it('with onOpen, formats the source view when it opens without marking it changed', async () => {
    await boot(ON_OPEN);
    provideFormatTools();
    const { cm, editor } = openSource('<div><p>x</p><p>y</p></div>');
    await vi.waitFor(() => expect(cm.getValue()).toBe('<div>\n  <p>x</p>\n  <p>y</p>\n</div>\n'));
    expect(editor.resetDirty).toHaveBeenCalled();
    cm.undo();
    expect(cm.getValue()).toBe('<div><p>x</p><p>y</p></div>');
  });

  it("with onOpen, doesn't overwrite what you typed while Prettier was loading", async () => {
    await boot(ON_OPEN);
    const { cm } = openSource('<div><p>x</p></div>');
    await sleep(50); // the watcher has seen the editor; Prettier hasn't loaded
    cm.replaceRange('!', { line: 0, ch: 0 }, null, '+input');
    provideFormatTools();
    await sleep(50);
    expect(cm.getValue()).toBe('!<div><p>x</p></div>');
  });

  it('labels the toolbar button Prettier when Prettier is on', async () => {
    const labels = [];
    for (const options of [{}, PRETTIER]) {
      await boot(options);
      const { cm } = openSource('');
      const source = document.createElement('a');
      source.className = 'cke_button cke_button__source';
      source.innerHTML = '<span class="cke_button_icon"></span><span class="cke_button_label">Source</span>';
      cm.getWrapperElement().before(source);
      await vi.waitFor(() => expect(document.querySelector('.slate-helper-format')).not.toBeNull());
      labels.push(document.querySelector('.slate-helper-format .cke_button_label').textContent);
    }
    expect(labels).toEqual(['Format', 'Prettier']);
  });

  it('only formats on open when Prettier is on too', async () => {
    await boot({ 'source-format.onOpen': true });
    provideFormatTools();
    const { cm } = openSource('<div><p>x</p></div>');
    await sleep(50);
    expect(cm.getValue()).toBe('<div><p>x</p></div>');
  });

  it('with Prettier, uses the config from the popup over the defaults', async () => {
    const config = JSON.stringify({ tabWidth: 4, singleAttributePerLine: true, printWidth: 40 });
    const cm = await formatted('<div><a href="/x" class="btn" target="_blank">Go</a></div>', { 'source-format.prettierConfig': config });
    expect(cm.getValue()).toBe([
      '<div>',
      '    <a',
      '        href="/x"',
      '        class="btn"',
      '        target="_blank"',
      '        >Go</a',
      '    >',
      '</div>',
      '',
    ].join('\n'));
  });

  it('with Prettier, leaves the code alone and says so when the config has a bad value', async () => {
    const value = '<div><p>x</p></div>';
    const cm = setupEditor(['source-format'], value, { ...PRETTIER, 'source-format.prettierConfig': '{ "trailingComma": "sometimes" }' });
    provideFormatTools();
    press(cm, 'Shift-Alt-F');
    await vi.waitFor(() => expect(cm.getWrapperElement().querySelector('.slate-helper-format-notice')).not.toBeNull());
    expect(cm.getWrapperElement().querySelector('.slate-helper-format-notice').textContent).toContain('trailingComma');
    expect(cm.getValue()).toBe(value);
  });
});
