// Keep editor dialogs open after Save.
//
// Slate's Save runs FW.Lazy.Commit(button, { cmd: 'save' }), which posts the
// form into a hidden iframe. The response is a script that calls
// parent.FW.Dialog.Unload() (closing the dialog) and then refreshes the saved
// block on the page. For Save in a dialog with a WYSIWYG editor, we run the
// same commit but skip that one Unload call, then flash "Saved ✓" on the
// button. Save as Copy and other buttons are left alone, and a "Save & Close"
// button is added for the old behavior.
(() => {
  const SHP = window.SlateHelperPage;
  const SAVED_LABEL = 'Saved ✓';

  let keepOpen = false;

  const patchUnload = () => {
    const FW = window.FW;
    if (!FW?.Dialog?.Unload || FW.Dialog.Unload.slateHelperPatched) return;
    const original = FW.Dialog.Unload;
    const patched = function (...args) {
      if (keepOpen) {
        keepOpen = false;
        SHP.log('editor-keep-open: skipped dialog close after save');
        return undefined;
      }
      return original.apply(this, args);
    };
    patched.slateHelperPatched = true;
    FW.Dialog.Unload = patched;
  };

  const isSaveButton = (button) =>
    /FW\.Lazy\.Commit\(this,\s*\{\s*cmd:\s*'save'\s*\}\)/.test(button.getAttribute('onclick') || '');

  const flashSaved = (button) => {
    const label = button.textContent;
    button.textContent = SAVED_LABEL;
    setTimeout(() => { button.textContent = label; }, 1500);
  };

  const save = (button) => {
    const FW = window.FW;
    if (!FW.Validate(button)) return;
    patchUnload();
    keepOpen = true;
    FW.Lazy.Commit(button, { cmd: 'save' }, {
      complete() {
        // complete runs after the response is handled. If the response didn't
        // try to close the dialog (e.g. it showed an error), don't let the flag
        // leak into the next Cancel/close.
        const closedSkipped = !keepOpen;
        keepOpen = false;
        if (closedSkipped && button.isConnected) flashSaved(button);
      },
      error() { keepOpen = false; },
    });
  };

  // "Save & Close" just before Save: Slate's original Save behavior. It calls the
  // commit directly (no onclick attribute), so the click handler below leaves
  // it alone and the dialog closes as usual.
  const addSaveAndClose = (host) => {
    const save = [...host.querySelectorAll('.action button')].find(isSaveButton);
    if (!save || host.querySelector('.slate-helper-save-close')) return;
    const button = document.createElement('button');
    button.type = 'button';
    // Slate marks its primary button with a class (the bold styling), so move
    // that from Save to Save & Close.
    button.className = `${save.className} slate-helper-save-close`.trim();
    save.className = '';
    button.textContent = 'Save & Close';
    button.addEventListener('click', () => {
      if (window.FW.Validate(save)) window.FW.Lazy.Commit(save, { cmd: 'save' });
    });
    save.before(button, ' '); // Slate separates its buttons with a space
  };

  SHP.registerFeature('editor-keep-open', () => {
    SHP.onCKEditor((editor) => {
      const host = editor.container.$.closest('.dialog_host');
      if (host) addSaveAndClose(host);
    });

    // Capture phase on the document runs before the button's own onclick.
    document.addEventListener('click', (e) => {
      const button = e.target.closest?.('.dialog_host .action button');
      if (!button || !isSaveButton(button) || !button.closest('.dialog_host').querySelector('.cke')) return;
      if (!window.FW?.Lazy?.Commit || !window.FW.Validate) return;
      e.preventDefault();
      e.stopPropagation();
      save(button);
    }, true);
  });
})();
