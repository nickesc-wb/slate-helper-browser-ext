// Source view: a "Wrap" toolbar button that turns line wrapping on and off.
// It changes every source view on the page, and saves the choice as the
// "Don't wrap long lines" setting (source-no-wrap) for the next page you open:
// the page asks the isolated world to save it (slate-helper:set-setting, which
// main.js only accepts for that one setting).
(() => {
  const SHP = window.SlateHelperPage;
  const BUTTON_CLASS = 'slate-helper-wrap';

  const toggle = () => {
    const noWrap = SHP.lineWrap.wraps();
    SHP.lineWrap.set(noWrap);
    document.dispatchEvent(new CustomEvent('slate-helper:set-setting', {
      detail: JSON.stringify({ key: 'source-no-wrap', value: noWrap }),
    }));
  };

  const showState = (button) => {
    const on = SHP.lineWrap.wraps();
    // CKEditor's own pressed look, as on its Source button in source view.
    button.classList.toggle('cke_button_on', on);
    button.classList.toggle('cke_button_off', !on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Long lines wrap. Click to keep them on one line.' : 'Long lines stay on one line. Click to wrap them.';
  };

  SHP.registerFeature('source-wrap-button', () => {
    SHP.onCKEditor((editor) => {
      const button = SHP.addToolbarButton(editor, {
        className: BUTTON_CLASS,
        label: 'Wrap',
        ariaLabel: 'Wrap long lines',
        title: '',
        after: ['.slate-helper-format', '.cke_button__replace'],
        onClick: () => {
          toggle();
          SHP.sourceEditorOf(editor)?.focus();
        },
      });
      if (button) showState(button);
    });
    // Every Wrap button on the page shows the same setting.
    SHP.lineWrap.onChange(() => document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(showState));
  });
})();
