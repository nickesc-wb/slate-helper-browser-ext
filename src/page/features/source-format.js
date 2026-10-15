// Source view: a "Format" toolbar button (and Shift+Alt+F) that tidies the
// HTML without saving or closing.
//
// Slate's tidy indentation comes from CKEditor: when content is loaded into the
// WYSIWYG view, CKEditor's HTML writer re-indents it. That's why the source
// looks formatted after Save & Close and reopening, but not after a plain Save.
// Format does the same round trip in place: load the source into the WYSIWYG
// view, then switch back to source.
(() => {
  const SHP = window.SlateHelperPage;
  const BUTTON_CLASS = 'slate-helper-format';

  const modeSwitch = (editor, mode) => new Promise((resolve) => editor.setMode(mode, resolve));
  const codeMirrorOf = (editor) => editor.container.$.querySelector('.CodeMirror')?.CodeMirror;

  let busy = false;
  const format = async (editor) => {
    if (busy || editor.mode !== 'source') return;
    const cm = codeMirrorOf(editor);
    if (!cm) return;
    busy = true;
    const line = cm.getCursor().line;
    const { top } = cm.getScrollInfo();
    const data = cm.getValue();
    try {
      await modeSwitch(editor, 'wysiwyg');
      await new Promise((resolve) => editor.setData(data, { callback: resolve }));
      await modeSwitch(editor, 'source');
    } finally {
      busy = false;
    }
    // Line numbers shift when formatting, so this lands close to, not exactly
    // at, where you were.
    const formatted = codeMirrorOf(editor);
    if (formatted) {
      formatted.focus();
      formatted.setCursor({ line: Math.min(line, formatted.lineCount() - 1), ch: 0 });
      formatted.scrollTo(null, top);
    }
  };

  // A toolbar button cloned from CKEditor's own Source button, so it matches.
  const addButton = (editor) => {
    const source = editor.container.$.querySelector('.cke_button__source');
    if (!source || editor.container.$.querySelector(`.${BUTTON_CLASS}`)) return;
    const button = source.cloneNode(true);
    for (const attr of [...button.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'id' || attr.name === 'aria-labelledby') button.removeAttribute(attr.name);
    }
    button.className = `cke_button cke_button_off ${BUTTON_CLASS}`;
    button.title = 'Format HTML (Shift+Alt+F)';
    button.setAttribute('aria-label', 'Format HTML');
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
      format(editor);
    });
    source.after(button);

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
          const editor = cke && SHP.ckeditorFor(cke);
          if (editor) format(editor);
        },
      });
    });
  });
})();
