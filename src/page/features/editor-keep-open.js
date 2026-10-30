// Keep editor dialogs open after Save.
//
// Slate's Save runs FW.Lazy.Commit(button, { cmd: 'save' }), which posts the
// form into a hidden iframe. The response is a script that calls
// parent.FW.Dialog.Unload() (closing the dialog) and then refreshes the saved
// block on the page. For Save in a dialog with a WYSIWYG editor, we run the
// same commit but skip that one Unload call, then flash "Saved ✓" on the
// button. Save as Copy and other buttons are left alone, and a "Save & Close"
// button is added for the old behavior.
//
// A new record's dialog posts without an id, so every Save would create another
// record. For a new portal part the response renames the placeholder named by
// the form's div parameter to the saved part (data-id), so after the first save
// the dialog is pointed at that part. If the new record can't be found, the
// dialog closes like Slate's own Save.
(() => {
  const SHP = window.SlateHelperPage;
  const SAVED_LABEL = 'Saved ✓';

  let keepOpen = false;
  // Slate keeps the options object a dialog was loaded with and reads its
  // cancel handler when the dialog is cancelled, so remember it per dialog.
  const dialogOptions = new WeakMap();

  const patchDialog = () => {
    const dialog = window.FW?.Dialog;
    if (dialog?.Unload && !dialog.Unload.slateHelperPatched) {
      const original = dialog.Unload;
      const patched = function (...args) {
        if (keepOpen) {
          keepOpen = false;
          SHP.log('editor-keep-open: skipped dialog close after save');
          return undefined;
        }
        return original.apply(this, args);
      };
      patched.slateHelperPatched = true;
      dialog.Unload = patched;
    }
    if (dialog?.Load && !dialog.Load.slateHelperPatched) {
      const original = dialog.Load;
      const patched = function (el, options, ...rest) {
        options ??= {}; // what Slate does too, but now it's an object we can see
        const node = el?.[0] ?? el; // a jQuery object or an element
        if (node) dialogOptions.set(node, options);
        return original.call(this, el, options, ...rest);
      };
      patched.slateHelperPatched = true;
      dialog.Load = patched;
    }
  };

  // Slate's dialog URLs are relative ("widget/html?cmd=edit_part&id=…&div=…").
  const query = (url) => new URLSearchParams((url || '').split('?')[1] || '');
  const withParams = (url, values) => {
    const [path, search = ''] = url.split('?');
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) params.set(key, value);
    return `${path}?${params}`;
  };

  // Points a new record's dialog at the record its first save created, the way
  // Slate opens an existing part: id and div in the URL, and Cancel just closes
  // (a new part's cancel handler removes it from the page).
  const adoptSavedRecord = (form, placeholder) => {
    const id = placeholder?.getAttribute('data-id');
    const dialog = form.closest('.dialog');
    const options = dialogOptions.get(dialog);
    if (!id || !options) return false;
    const values = { id, div: placeholder.id };
    form.setAttribute('action', withParams(form.getAttribute('action'), values));
    if (dialog.hasAttribute('data-href')) dialog.setAttribute('data-href', withParams(dialog.getAttribute('data-href'), values));
    options.cancel = true;
    SHP.log('editor-keep-open: dialog now edits saved record', id);
    return true;
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
    patchDialog();
    const form = button.closest('form');
    const params = query(form?.getAttribute('action'));
    const isNew = !!form && !params.get('id');
    const placeholder = isNew && params.get('div') ? document.getElementById(params.get('div')) : null;
    keepOpen = true;
    FW.Lazy.Commit(button, { cmd: 'save' }, {
      complete() {
        // complete runs after the response is handled. If the response didn't
        // try to close the dialog (e.g. it showed an error), don't let the flag
        // leak into the next Cancel/close.
        const closedSkipped = !keepOpen;
        keepOpen = false;
        if (!closedSkipped) return;
        if (isNew && !adoptSavedRecord(form, placeholder)) {
          FW.Dialog.Unload(); // another Save would create another record
          return;
        }
        if (button.isConnected) flashSaved(button);
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

  // Slate's Ctrl+S clicks the dialog's first button.default, which is now Save
  // & Close. Send it to Save instead. CKEditor re-dispatches Ctrl+S from its
  // iframe as a keydown on this document, so one listener covers both views.
  const onCtrlS = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.code !== 'KeyS') return;
    const save = [...document.querySelectorAll('.dialog_host:not(.dialog_inactive) .action button')]
      .find((b) => isSaveButton(b) && b.closest('.dialog_host').querySelector('.cke'));
    if (!save) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    save.click();
  };

  SHP.registerFeature('editor-keep-open', () => {
    patchDialog(); // before any dialog loads, so its options are remembered
    window.addEventListener('keydown', onCtrlS, true); // before Slate's document handler
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
