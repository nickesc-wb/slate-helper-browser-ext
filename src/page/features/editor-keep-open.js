// Keep editor dialogs open after Save.
//
// Slate's Save runs FW.Lazy.Commit(button, { cmd: 'save', … }), which posts the
// form into a hidden iframe. The response is a script that calls
// parent.FW.Dialog.Unload() (closing the dialog) and then refreshes the saved
// block on the page. For Save in a block editor, we let Slate's own onclick run
// (a Deliver message's Save uploads a recorded video first, then commits) and
// only add callbacks to the commit it makes: skip that one Unload call, then
// flash "Saved ✓" on the button. Save as Copy and other buttons are left alone,
// and a "Save & Close" button is added for the old behavior.
//
// A block editor is a dialog with a WYSIWYG editor that edits one block of a
// page (cmd=edit_part, e.g. a portal view's Static Content), a content block
// (Database > Content Blocks): its key with the default output (cmd=edit_key)
// or one of its values (cmd=edit_code), or a Deliver message (deliver/message,
// cmd=edit). DIALOGS below lists them. Settings dialogs that happen to have
// rich-text fields (a portal's or form's Edit Details, a form field's label)
// keep Slate's Save, which closes them: their saves update the page around
// them, and a dialog left open invites a second Save.
//
// A new record's dialog posts without an id, so every Save would create another
// record. For a new portal part the response renames the placeholder named by
// the form's div parameter to the saved part (data-id), so after the first save
// the dialog is pointed at that part. If the new record can't be found, the
// dialog closes like Slate's own Save. A new record with nothing to point the
// dialog at afterwards (a new content block or value, a new part without a
// placeholder) keeps Slate's Save, relabeled Save & Close, and no second button.
// Saving a content block key under a new name or type also closes the dialog.
//
// While a save waits for its response: a second Save (or Save & Close, or
// Ctrl+S) waits and runs once the first is answered, so it posts with the
// first one's result (a new part's id) instead of alongside it. A close from
// a click or key press (Cancel, ×, Esc) goes through; only the response's
// close is skipped. After SAVE_TIMEOUT with no response, nothing is skipped.
(() => {
  const SHP = window.SlateHelperPage;
  const SAVED_LABEL = 'Saved ✓';

  // A wait this long for Slate's response means it isn't coming (a request
  // that hung): stop waiting to skip its close.
  const SAVE_TIMEOUT = 30000;

  // The Save click whose commit should keep the dialog open, set just before
  // Slate's onclick runs and taken by the commit it makes.
  let armed = null;
  // The keep-open save waiting for Slate's response: { button, form, isNew,
  // placeholder, closeSkipped, queued, timer }. One at a time; a Save clicked
  // meanwhile is queued (see onSaveClick).
  let saving = null;
  // Set by Save & Close so its click on Save runs Slate's onclick untouched.
  let bypass = false;
  // Slate keeps the options object a dialog was loaded with and reads its
  // cancel handler when the dialog is cancelled, so remember it per dialog.
  const dialogOptions = new WeakMap();

  // A close from a click or key press (Cancel, ×, Esc) is the user's. Slate's
  // save response closes from a script in its hidden iframe, during no event
  // of this window.
  const byUser = () => window.event instanceof UIEvent;

  const patchDialog = () => {
    const dialog = window.FW?.Dialog;
    if (dialog?.Unload && !dialog.Unload.slateHelperPatched) {
      const original = dialog.Unload;
      const patched = function (...args) {
        // Skip the one close the response makes. If the user closed the dialog
        // meanwhile, that's skipped too: the dialog it meant is already gone.
        if (saving && !saving.closeSkipped && !byUser()) {
          saving.closeSkipped = true;
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

  // Most records are named by the id in the dialog's URL; a new one has none.
  const noIdInUrl = (form) => !query(form.getAttribute('action')).get('id');
  const TRANSLATION = /\/database\/translation\/edit$/;

  // Every dialog the feature keeps open, and everything that differs between
  // them. A dialog matches by its URL's cmd and path (edit_part by cmd alone:
  // portals, forms and others each have their own path for it).
  //   isNew(form): a new record, which a second Save would create again.
  //   placeholder(form): for a new record, the page element its saved record
  //     takes over, so the dialog can be pointed at it (see the top).
  //   closesOnSave(form): this save should close the dialog after all.
  const DIALOGS = [
    {
      name: 'portal part', cmd: 'edit_part', isNew: noIdInUrl,
      placeholder: (form) => {
        const div = query(form.getAttribute('action')).get('div');
        return div ? document.getElementById(div) : null;
      },
    },
    {
      name: 'content block key', cmd: 'edit_key', path: TRANSLATION,
      isNew: (form) => !form.elements.original_key?.value,
      // Renamed or retyped: the page and the form's original_key /
      // original_type still name the old key.
      closesOnSave: ({ elements: e }) => e.key?.value !== e.original_key?.value || e.type?.value !== e.original_type?.value,
    },
    { name: 'content block value', cmd: 'edit_code', path: TRANSLATION, isNew: noIdInUrl },
    { name: 'Deliver message', cmd: 'edit', path: /\/deliver\/message$/, isNew: noIdInUrl },
  ];

  const dialogFor = (url) => {
    const cmd = query(url).get('cmd');
    const path = (url || '').split('?')[0];
    return DIALOGS.find((d) => d.cmd === cmd && (!d.path || d.path.test(path))) ?? null;
  };

  // The block editor a dialog host holds: one of DIALOGS with a WYSIWYG editor
  // and a form, or null.
  const blockEditor = (host) => {
    const form = host?.querySelector('form');
    if (!form || !host.querySelector('.cke')) return null;
    const urls = [form.getAttribute('action'), host.querySelector('.dialog')?.getAttribute('data-href')];
    const type = urls.map(dialogFor).find(Boolean);
    return type ? { type, form } : null;
  };

  // 'keep': Save keeps the dialog open. 'close': it's a block editor, but a
  // second Save from it would create another record, so Save stays Slate's
  // (labeled Save & Close). null: not a block editor, left alone.
  const blockMode = (host) => {
    const editor = blockEditor(host);
    if (!editor) return null;
    const { type, form } = editor;
    return !type.isNew(form) || type.placeholder?.(form) ? 'keep' : 'close';
  };

  // Slate's Save onclick, plain or with extra arguments (a message's video).
  const isSaveButton = (button) =>
    /FW\.Lazy\.Commit\(this,\s*\{\s*cmd:\s*'save'\s*[,}]/.test(button.getAttribute('onclick') || '');

  // The button's own label is kept on it, so a save that finishes while
  // "Saved ✓" still shows doesn't take that for the label to restore.
  const flashTimers = new WeakMap();
  const flashSaved = (button) => {
    button.dataset.slateHelperLabel ??= button.textContent;
    clearTimeout(flashTimers.get(button));
    button.textContent = SAVED_LABEL;
    flashTimers.set(button, setTimeout(() => { button.textContent = button.dataset.slateHelperLabel; }, 1500));
  };

  const finish = (save) => {
    clearTimeout(save.timer);
    if (saving === save) saving = null;
  };

  // Slate's callbacks (if it passed any) plus the keep-open ones.
  const keepOpenCallbacks = (callbacks, save) => ({
    ...callbacks,
    complete(...args) {
      callbacks?.complete?.apply(this, args);
      if (saving !== save) return; // timed out: its close wasn't skipped
      finish(save);
      // complete runs after the response is handled. If the response didn't
      // try to close the dialog (e.g. it showed an error), or the user closed
      // it meanwhile, there's nothing to keep open.
      const { button, form, isNew, placeholder, closeSkipped, queued } = save;
      if (!closeSkipped || !form.isConnected) return;
      if (isNew && !adoptSavedRecord(form, placeholder)) {
        window.FW.Dialog.Unload(); // another Save would create another record
        return;
      }
      flashSaved(button);
      // A Save (or Save & Close) clicked while this one waited.
      if (queued) {
        bypass = queued.bypass;
        button.click();
        bypass = false;
      }
    },
    error(...args) {
      finish(save);
      callbacks?.error?.apply(this, args);
    },
  });

  const patchCommit = () => {
    const lazy = window.FW?.Lazy;
    if (!lazy?.Commit || lazy.Commit.slateHelperPatched) return;
    const original = lazy.Commit;
    const patched = function (el, args, callbacks, ...rest) {
      const click = armed;
      if (click && el === click.button && args?.cmd === 'save' && (callbacks == null || typeof callbacks === 'object')) {
        armed = null;
        patchDialog();
        const save = { ...click, closeSkipped: false, queued: null };
        save.timer = setTimeout(() => {
          SHP.log('editor-keep-open: no response to save, stopped waiting');
          finish(save);
        }, SAVE_TIMEOUT);
        saving = save;
        return original.call(this, el, args, keepOpenCallbacks(callbacks, save), ...rest);
      }
      return original.call(this, el, args, callbacks, ...rest);
    };
    patched.slateHelperPatched = true;
    lazy.Commit = patched;
  };

  // Runs before Save's own onclick: arm its commit to keep the dialog open.
  // Returns true to stop the click (Slate's onclick then doesn't run).
  const onSaveClick = (button) => {
    armed = null; // a Save whose Validate failed never committed
    // A second Save before the first is answered would go out without the
    // first one's result (a new record's id, so it would create another).
    // Run it once the first is done instead; Save & Close too.
    if (saving) {
      if (saving.button === button) saving.queued = { bypass };
      bypass = false;
      return true;
    }
    if (bypass) { bypass = false; return false; }
    const host = button.closest('.dialog_host');
    if (blockMode(host) !== 'keep') return false;
    const { type, form } = blockEditor(host);
    if (type.closesOnSave?.(form)) return false;
    patchCommit();
    const isNew = type.isNew(form);
    armed = { button, form, isNew, placeholder: isNew ? type.placeholder(form) : null };
    return false;
  };

  // "Save & Close" just before Save: clicks Save with the feature stepped
  // aside, so Slate's own Save runs and the dialog closes as usual.
  const addSaveAndClose = (host) => {
    const save = [...host.querySelectorAll('.action button')].find(isSaveButton);
    if (!save || host.querySelector('.slate-helper-save-close')) return;
    if (blockMode(host) === 'close') {
      // Save closes here anyway, so one button, named for what it does.
      save.textContent = 'Save & Close';
      save.classList.add('slate-helper-save-close');
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    // Slate marks its primary button with a class (the bold styling), so move
    // that from Save to Save & Close.
    button.className = `${save.className} slate-helper-save-close`.trim();
    save.className = '';
    button.textContent = 'Save & Close';
    button.addEventListener('click', () => {
      bypass = true;
      save.click();
      bypass = false;
    });
    save.before(button, ' '); // Slate separates its buttons with a space
  };

  // Slate's Ctrl+S clicks the dialog's first button.default, which is now Save
  // & Close. Send it to Save instead. CKEditor re-dispatches Ctrl+S from its
  // iframe as a keydown on this document, so one listener covers both views.
  const onCtrlS = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.code !== 'KeyS') return;
    const save = [...document.querySelectorAll('.dialog_host:not(.dialog_inactive) .action button')]
      .find((b) => isSaveButton(b) && blockMode(b.closest('.dialog_host')) === 'keep');
    if (!save) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    save.click();
  };

  SHP.registerFeature('editor-keep-open', () => {
    patchDialog(); // before any dialog loads, so its options are remembered
    patchCommit();
    window.addEventListener('keydown', onCtrlS, true); // before Slate's document handler
    SHP.onCKEditor((editor) => {
      const host = editor.container.$.closest('.dialog_host');
      if (blockMode(host)) addSaveAndClose(host);
    });

    // Capture phase on the document runs before the button's own onclick.
    document.addEventListener('click', (e) => {
      const button = e.target.closest?.('.dialog_host .action button');
      if (!button || !isSaveButton(button) || !onSaveClick(button)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  });
})();
