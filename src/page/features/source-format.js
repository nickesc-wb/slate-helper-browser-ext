// Source view: a "Format" toolbar button (and Shift+Alt+F) that tidies the
// code without saving or closing.
//
// By default that's Slate's own tidying: CKEditor re-indents HTML when it
// loads content into the WYSIWYG view (why the source looks formatted after
// Save & Close and reopening, but not after a plain Save), so Format does that
// round trip in place.
//
// With the prettier option on (off by default), it's Prettier with Shopify's
// Liquid plugin (src/vendor/format-tools.js, loaded the first time you
// format), so the CSS in <style>, the JavaScript in <script> and {% if %} /
// {% for %} blocks are laid out too. That's for working in the source view:
// Slate re-formats its own way when you leave it or reopen the editor.
// Prettier only moves Liquid around: each {{ }} and {% %} is put back exactly
// as written, since Slate's Liquid isn't Shopify's (it would add {%- -%}
// trimming, respace {{x}} and rewrite {% if {{x}} %}). When Prettier can't
// format the code, Format falls back to Slate's tidying.
(() => {
  const SHP = window.SlateHelperPage;
  const BUTTON_CLASS = 'slate-helper-format';
  const NOTICE_CLASS = 'slate-helper-format-notice';

  // Prettier options. The person's config (the prettierConfig option, JSON the
  // popup has checked) goes over these; parser, plugins and cursorOffset are
  // always ours.
  const CONFIG = {
    printWidth: 120,
    tabWidth: SHP.INDENT.length,
    useTabs: false,
    // 'css' keeps whitespace that renders (inline tags in email copy) as it is;
    // 'ignore' would split "</a>." onto two lines, which shows as "link .".
    htmlWhitespaceSensitivity: 'css',
  };

  /** A problem with the person's config, not with the code. */
  class ConfigError extends Error {}
  // How Prettier words a bad option value.
  const PRETTIER_OPTION_ERROR = /^Invalid \w+ value\./;

  const prettierOptions = () => {
    const text = SHP.optionValue('source-format', 'prettierConfig');
    if (typeof text !== 'string' || !text.trim()) return { ...CONFIG };
    let custom;
    try {
      custom = JSON.parse(text);
    } catch (e) {
      throw new ConfigError(`it isn't valid JSON (${e.message})`);
    }
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) throw new ConfigError('it must be a JSON object');
    return { ...CONFIG, ...custom };
  };

  /** The Prettier parser for the editor's mode. */
  const parserFor = (cm) => {
    const mode = cm.getOption('mode');
    const name = String((mode && mode.name) || mode).toLowerCase();
    if (/css$/.test(name)) return 'css';
    if (/javascript|json/.test(name)) return 'babel';
    return 'liquid-html';
  };

  // Every {{ }} and {% %}. A {% %} swallows any {{ }} inside it ({% if {{x}} %}).
  const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
  const liquidKind = (tag) => (tag.startsWith('{{') ? '{{' : tag.match(/^\{%-?\s*(\w*)/)[1]);

  /**
   * Put the input's Liquid tags back into Prettier's output, in order, and move
   * cursor (an offset in output) to match. null when the tags don't line up
   * one to one, which would mean Prettier changed more than layout.
   */
  const restoreLiquid = (input, output, cursor) => {
    const before = [...input.matchAll(LIQUID)];
    const after = [...output.matchAll(LIQUID)];
    if (before.length !== after.length) return null;
    if (before.some((m, i) => liquidKind(m[0]) !== liquidKind(after[i][0]))) return null;
    let text = '';
    let last = 0;
    let moved = cursor;
    after.forEach((m, i) => {
      const original = before[i][0];
      text += output.slice(last, m.index) + original;
      last = m.index + m[0].length;
      if (last <= cursor) moved += original.length - m[0].length;
      else if (m.index < cursor) moved = text.length - original.length; // cursor was inside the tag
    });
    return { text: text + output.slice(last), cursor: moved };
  };

  /**
   * Format text with Prettier: { text, cursor }, or throws with a message for
   * the person (Prettier's, with its line number). A ConfigError means the
   * config is wrong, so nothing was formatted.
   */
  const prettierFormat = async (text, cursor, parser) => {
    const options = prettierOptions();
    const { prettier, plugins } = await SHP.load('format-tools');
    let result;
    try {
      result = await prettier.formatWithCursor(text, { ...options, parser, plugins, cursorOffset: cursor });
    } catch (e) {
      const line = e.loc?.start?.line;
      const message = String(e.message || e).split('\n')[0].replace(/\s*\(\d+:\d+\)$/, '');
      if (PRETTIER_OPTION_ERROR.test(message)) throw new ConfigError(message);
      throw new Error(line ? `${message} (line ${line})` : message);
    }
    if (parser !== 'liquid-html') return { text: result.formatted, cursor: result.cursorOffset };
    const restored = restoreLiquid(text, result.formatted, result.cursorOffset);
    if (!restored) throw new Error('it would have changed the Liquid tags (is an {% if %} or {% for %} not closed?)');
    return restored;
  };

  /** A short message in the editor's corner that goes away by itself. */
  const notice = (cm, message) => {
    SHP.injectStyle('format-notice', `
      .${NOTICE_CLASS} {
        position: absolute; right: 8px; bottom: 8px; z-index: 10; max-width: 70%;
        padding: 4px 8px; border-radius: 4px; background: #333; color: #fff;
        font: 12px/1.4 system-ui, sans-serif; pointer-events: none;
      }
    `);
    const wrapper = cm.getWrapperElement();
    wrapper.querySelector(`.${NOTICE_CLASS}`)?.remove();
    const el = document.createElement('div');
    el.className = NOTICE_CLASS;
    el.textContent = message;
    wrapper.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };

  const modeSwitch = (editor, mode) => new Promise((resolve) => editor.setMode(mode, resolve));
  const codeMirrorOf = (editor) => editor.container.$.querySelector('.CodeMirror')?.CodeMirror;

  // Slate's own tidying: a round trip through CKEditor's WYSIWYG view.
  const ckeditorFormat = async (editor) => {
    const cm = codeMirrorOf(editor);
    const line = cm.getCursor().line;
    const { top } = cm.getScrollInfo();
    const data = cm.getValue();
    await modeSwitch(editor, 'wysiwyg');
    await new Promise((resolve) => editor.setData(data, { callback: resolve }));
    await modeSwitch(editor, 'source');
    // Line numbers shift when formatting, so this lands close to, not exactly
    // at, where you were.
    const formatted = codeMirrorOf(editor);
    if (formatted) {
      formatted.focus();
      formatted.setCursor({ line: Math.min(line, formatted.lineCount() - 1), ch: 0 });
      formatted.scrollTo(null, top);
    }
    return formatted;
  };

  let busy = false;
  /** Format cm; editor is its CKEditor, if it's in one (for the fallback). */
  const format = async (cm, editor) => {
    if (busy || (editor && editor.mode !== 'source')) return;
    const prettier = SHP.option('source-format', 'prettier');
    if (!prettier && !editor) return;
    busy = true;
    try {
      if (!prettier) {
        await ckeditorFormat(editor);
        return;
      }
      const text = cm.getValue();
      const cursor = cm.indexFromPos(cm.getCursor());
      let result;
      try {
        result = await prettierFormat(text, cursor, parserFor(cm));
      } catch (e) {
        SHP.log('format: Prettier failed', e);
        if (e instanceof ConfigError) {
          // Not Slate's tidying instead: the config is what needs fixing.
          notice(cm, `Didn't format: check the Prettier config in Slate Helper's popup. ${e.message}`);
        } else if (editor) {
          const formatted = await ckeditorFormat(editor);
          if (formatted) notice(formatted, `Couldn't format with Prettier: ${e.message}. Used Slate's basic formatting instead.`);
        } else {
          notice(cm, `Couldn't format: ${e.message}.`);
        }
        return;
      }
      if (result.text === text) {
        // Already formatted, or HTML the Liquid parser gave up on: it leaves
        // that as written rather than failing.
        notice(cm, 'No changes. (Prettier leaves HTML it can\'t parse, like unclosed tags, as written.)');
      } else {
        const { top } = cm.getScrollInfo();
        cm.operation(() => {
          cm.replaceRange(result.text, { line: 0, ch: 0 }, { line: cm.lastLine() }, '+format');
          cm.setCursor(cm.posFromIndex(result.cursor));
          cm.scrollTo(null, top);
        });
      }
      cm.focus();
    } finally {
      busy = false;
    }
  };

  // A toolbar button cloned from CKEditor's own Source button, so it matches,
  // placed after Find/Replace with the other code-editing tools.
  const addButton = (editor) => {
    const source = editor.container.$.querySelector('.cke_button__source');
    if (!source || editor.container.$.querySelector(`.${BUTTON_CLASS}`)) return;
    const button = source.cloneNode(true);
    for (const attr of [...button.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'id' || attr.name === 'aria-labelledby') button.removeAttribute(attr.name);
    }
    button.className = `cke_button cke_button_off ${BUTTON_CLASS}`;
    button.title = 'Format code (Shift+Alt+F)';
    button.setAttribute('aria-label', 'Format code');
    button.querySelector('.cke_button_icon')?.remove();
    const label = button.querySelector('.cke_button_label');
    if (label) {
      label.removeAttribute('id');
      label.textContent = 'Format';
      label.style.display = 'inline';
      label.style.paddingLeft = '0';
    }
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const cm = editor.mode === 'source' && codeMirrorOf(editor);
      if (cm) format(cm, editor);
    });
    const anchor = editor.container.$.querySelector('.cke_button__replace') || source;
    anchor.after(button);

    const updateState = () => {
      const enabled = editor.mode === 'source';
      button.classList.toggle('cke_button_disabled', !enabled);
      button.setAttribute('aria-disabled', String(!enabled));
    };
    editor.on('mode', updateState);
    updateState();
  };

  SHP.registerFeature('source-format', () => {
    SHP.onCKEditor(addButton);
    SHP.onCodeMirror((cm) => {
      cm.addKeyMap({
        name: 'slate-helper-format',
        'Shift-Alt-F': () => {
          const cke = cm.getWrapperElement().closest('.cke');
          format(cm, (cke && SHP.ckeditorFor(cke)) || null);
        },
      });
    });
  });
})();
