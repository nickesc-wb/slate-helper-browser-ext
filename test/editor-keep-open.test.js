import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts } from './helpers/load.js';

// Slate's Save onclick. Inline handlers run in a jsdom global without FW, so it
// guards on that; slateOnclick below stands in for what it does in Slate.
const SAVE_ONCLICK = "if (window.FW) FW.Lazy.Commit(this, { cmd: 'save' })";
// A Deliver message's Save: uploads a recorded video first, then commits.
const MESSAGE_ONCLICK = "if (window.FW) { var commit = function() { FW.Lazy.Commit(this, { cmd: 'save', video: video_params }); }.bind(this); commit(); }";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A block editor dialog the way Slate builds it. Save & Close (added by the
// feature) has Slate's "default" class, which is what Slate's Ctrl+S clicks.
const dialog = ({ cke = true } = {}) => {
  document.body.innerHTML = `
    <div class="dialog_host"><div class="dialog">
      <form action="https://x.test/manage/database/portal/widget/html?cmd=edit_part&id=abc">
        ${cke ? '<div class="cke"></div>' : ''}
        <div class="action">
          <button class="slate-helper-save-close default" type="button">Save &amp; Close</button>
          <button type="button" onclick="${SAVE_ONCLICK}">Save</button>
        </div>
      </form>
    </div></div>`;
};

// A settings dialog with rich-text fields, like a portal's Edit Details.
const settingsDialog = () => {
  document.body.innerHTML = `
    <div class="dialog_host"><div class="dialog" data-href="/manage/database/portal/edit?cmd=edit_details">
      <form action="https://x.test/manage/database/portal/edit?cmd=edit_details">
        <input name="name"><div class="cke"></div><div class="cke"></div>
        <div class="action">
          <button class="default" type="button" onclick="${SAVE_ONCLICK}">Save</button>
        </div>
      </form>
    </div></div>`;
};

// A dialog opened with CKEditor ready: the feature adds its buttons then, so
// this registers an instance and waits for the DOM watcher.
const open = async (url, { fields = '', onclick = SAVE_ONCLICK } = {}) => {
  document.body.innerHTML = `
    <div class="dialog_host"><div class="dialog" data-href="${url}">
      <form action="https://x.test${url}">
        ${fields}
        <div class="cke"></div>
        <div class="action">
          <button class="default" type="button" onclick="${onclick}">Save</button>
          <button type="button">Cancel</button>
        </div>
      </form>
    </div></div>`;
  const cke = document.querySelector('.cke');
  window.CKEDITOR = { instances: { html: { status: 'ready', container: { $: cke } } } };
  await sleep(60); // the DOM watcher's debounce
};

const labels = () => [...document.querySelectorAll('.action button')].map((b) => b.textContent);
const slateSave = () => [...document.querySelectorAll('.action button')].find((b) => b.getAttribute('onclick'));
const button = (label) => [...document.querySelectorAll('.action button')].find((b) => b.textContent === label);
// The keep-open callbacks the feature adds to Slate's commit, if it did.
const keepOpenCallbacks = () => commit.mock.calls.at(-1)?.[2];

// Clicks Save and plays Slate's response, which closes the dialog.
const save = () => {
  slateSave().click();
  window.FW.Dialog.Unload();
  keepOpenCallbacks()?.complete?.();
};

const ctrlS = () => {
  const e = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};

// Slate's stand-ins. The feature wraps Dialog.Load/Unload and Lazy.Commit when
// it starts, so the same FW object is kept for the whole file and only its
// mocks are reset; tests read the calls from these mocks. Commits are also kept
// in a list of their own, which Vitest's clearing between tests doesn't empty.
const commits = [];
const commit = vi.fn((...args) => { commits.push(args); });
const unload = vi.fn();
const load = vi.fn();
let slateCtrlS;

beforeAll(() => {
  window.FW = { Validate: () => true, Lazy: { Commit: commit }, Dialog: { Load: load, Unload: unload } };
  delete window.SlateHelperPage;
  loadScripts('src/page/runtime.js', 'src/page/cm-utils.js', 'src/page/features/editor-keep-open.js');
  window.SlateHelperPage.features['editor-keep-open']();
  // Stand-in for Slate's own Ctrl+S handler on the document.
  slateCtrlS = vi.fn();
  document.addEventListener('keydown', slateCtrlS);
  // Stand-in for Save's onclick, which runs after the feature's capture listener.
  document.addEventListener('click', (e) => {
    const onclick = e.target.closest?.('button')?.getAttribute('onclick') || '';
    if (!onclick.includes("cmd: 'save'")) return;
    const args = onclick.includes('video') ? { cmd: 'save', video: null } : { cmd: 'save' };
    window.FW.Lazy.Commit(e.target, args);
  });
});

beforeEach(() => {
  slateCtrlS.mockClear();
  // End any keep-open save a test left waiting, so the next one isn't queued.
  for (const call of commits.splice(0)) call[2]?.error?.();
  commit.mockClear();
  unload.mockClear();
  load.mockClear();
});

describe('editor-keep-open Ctrl+S', () => {

  it('saves without closing instead of clicking Save & Close', () => {
    dialog();
    expect(ctrlS().defaultPrevented).toBe(true);
    expect(slateCtrlS).not.toHaveBeenCalled();
    const [target, args, callbacks] = commit.mock.calls[0];
    expect(target.getAttribute('onclick')).toBe(SAVE_ONCLICK); // Slate's Save, not Save & Close
    expect(args).toEqual({ cmd: 'save' });
    expect(callbacks.complete).toBeTypeOf('function'); // the keep-open save
  });

  it('leaves Ctrl+S to Slate in dialogs without a WYSIWYG editor', () => {
    dialog({ cke: false });
    ctrlS();
    expect(slateCtrlS).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('editor-keep-open in settings dialogs', () => {
  it('leaves Save and Ctrl+S to Slate, so the dialog closes', () => {
    settingsDialog();
    ctrlS();
    expect(slateCtrlS).toHaveBeenCalled();
    slateSave().click();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(keepOpenCallbacks()).toBeUndefined();
  });
});

describe('editor-keep-open Save & Close', () => {
  it("runs Slate's Save, which closes", async () => {
    await open('/manage/database/portal/widget/html?cmd=edit_part&id=abc');
    button('Save & Close').click();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toBe(slateSave());
    expect(keepOpenCallbacks()).toBeUndefined();
  });

  it("isn't kept open by an earlier Save that never committed", async () => {
    await open('/manage/database/portal/widget/html?cmd=edit_part&id=abc');
    window.FW.Validate = () => false; // Slate's onclick stops here, no commit
    slateSave().dispatchEvent(new MouseEvent('click', { bubbles: false })); // the feature's listener only
    window.FW.Validate = () => true;
    button('Save & Close').click();
    expect(keepOpenCallbacks()).toBeUndefined();
  });
});

// Slate's response arrives later; these play it at a chosen moment.
describe('editor-keep-open while a save waits for its response', () => {
  const respond = (call = commit.mock.calls.at(-1)) => {
    window.FW.Dialog.Unload(); // from the response's script, during no event
    call[2]?.complete?.();
  };

  // Cancel's onclick is Slate's FW.Dialog.Unload(), run during the click.
  const addCancel = () => {
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => window.FW.Dialog.Unload());
    document.querySelector('.action').append(cancel);
    return cancel;
  };

  it('restores the label after a save that finishes while "Saved ✓" shows', () => {
    vi.useFakeTimers();
    try {
      dialog();
      slateSave().click();
      respond();
      slateSave().click();
      respond();
      expect(slateSave().textContent).toBe('Saved ✓');
      vi.advanceTimersByTime(2000);
      expect(slateSave().textContent).toBe('Save');
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs a second Save after the first is answered, not alongside it', () => {
    dialog();
    slateSave().click();
    slateSave().click();
    ctrlS();
    expect(commit).toHaveBeenCalledTimes(1);
    respond();
    expect(commit).toHaveBeenCalledTimes(2); // the queued Save, once
    expect(keepOpenCallbacks().complete).toBeTypeOf('function');
    respond();
    expect(unload).not.toHaveBeenCalled();
  });

  it('runs Save & Close clicked meanwhile once the save is answered', async () => {
    await open('/manage/database/portal/widget/html?cmd=edit_part&id=abc'); // the feature's own Save & Close
    slateSave().click();
    button('Save & Close').click();
    expect(commit).toHaveBeenCalledTimes(1);
    respond();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(keepOpenCallbacks()).toBeUndefined(); // Slate's Save, which closes
  });

  it('closes on Cancel during a save, and skips the response closing what is left', () => {
    dialog();
    const cancel = addCancel();
    slateSave().click();
    cancel.click();
    expect(unload).toHaveBeenCalledTimes(1); // the user's close went through
    respond();
    expect(unload).toHaveBeenCalledTimes(1); // the response's didn't close another dialog
  });

  it('stops waiting for a response that never comes', () => {
    vi.useFakeTimers();
    try {
      dialog();
      slateSave().click();
      vi.advanceTimersByTime(31000);
      window.FW.Dialog.Unload(); // a later close, from anything
      expect(unload).toHaveBeenCalledTimes(1);
      slateSave().click(); // not queued behind the lost save
      expect(commit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Content block dialogs (Database > Content Blocks > a block): Edit Key, with
// the default output in a WYSIWYG editor, and a value's dialog. New Key and New
// Code open them without original_key / id.
describe('editor-keep-open in content block dialogs', () => {
  const url = (cmd, params) => `/manage/database/translation/edit?cmd=${cmd}&translation_type=snippet&${params}`;

  const keyFields = (original) => `
    <input name="original_key" value="${original}"><input name="original_type" value="${original && 'string'}">
    <input name="key" value="${original || 'new_key'}">
    <select name="type"><option value="string" selected>String</option><option value="html">HTML</option></select>`;

  it('keeps a value open after Save', async () => {
    await open(url('edit_code', 'key=k&id=abc'));
    expect(labels()).toEqual(['Save & Close', 'Save', 'Cancel']);
    save();
    expect(unload).not.toHaveBeenCalled();
    expect(ctrlS().defaultPrevented).toBe(true);
  });

  it('keeps a key open after Save', async () => {
    await open(url('edit_key', 'key=k'), { fields: keyFields('k') });
    expect(labels()).toEqual(['Save & Close', 'Save', 'Cancel']);
    save();
    expect(unload).not.toHaveBeenCalled();
  });

  it('closes a key saved under a new name or type, like Slate', async () => {
    await open(url('edit_key', 'key=k'), { fields: keyFields('k') });
    document.querySelector('[name=key]').value = 'renamed';
    slateSave().click();
    expect(keepOpenCallbacks()).toBeUndefined();
    commit.mockClear();
    document.querySelector('[name=key]').value = 'k';
    document.querySelector('[name=type]').value = 'html';
    slateSave().click();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(keepOpenCallbacks()).toBeUndefined();
  });

  // A second Save from the same dialog would create another one.
  it.each([
    ['New Code', 'edit_code', 'key=k&group=g', ''],
    ['New Key', 'edit_key', '', keyFields('')],
  ])('shows only Slate\'s Save, labeled Save & Close, for %s', async (_, cmd, params, fields) => {
    await open(url(cmd, params), { fields });
    expect(labels()).toEqual(['Save & Close', 'Cancel']);
    expect(ctrlS().defaultPrevented).toBe(false); // Slate's Ctrl+S, which closes
    slateSave().click();
    expect(keepOpenCallbacks()).toBeUndefined(); // not taken over
  });
});

// A Deliver message's Edit Message dialog (a mailing's message, or a form's
// communication). Its Save commits with more than { cmd: 'save' }.
describe('editor-keep-open in message dialogs', () => {
  it("keeps the message open, passing Slate's commit arguments through", async () => {
    await open('/manage/deliver/message?id=abc&cmd=edit', { onclick: MESSAGE_ONCLICK });
    expect(labels()).toEqual(['Save & Close', 'Save', 'Cancel']);
    save();
    expect(commit.mock.calls[0][1]).toEqual({ cmd: 'save', video: null });
    expect(unload).not.toHaveBeenCalled();
    expect(ctrlS().defaultPrevented).toBe(true);
  });

  it('leaves other Deliver dialogs alone', async () => {
    await open('/manage/deliver/mailing?id=abc&cmd=edit', { onclick: MESSAGE_ONCLICK });
    expect(labels()).toEqual(['Save', 'Cancel']);
    slateSave().click();
    expect(keepOpenCallbacks()).toBeUndefined();
  });
});

// A portal part dialog the way Slate's view builder opens it: a new part has
// no id in its URL and a placeholder on the page named by div.
describe('editor-keep-open on a new record', () => {
  const url = (params) => `widget/html?cmd=edit_part&${params}&type=html`;

  const partDialog = (params) => {
    document.body.innerHTML = `
      <div class="part_rows_container"><div id="part_1"></div></div>
      <div class="dialog_host"><div class="dialog" data-href="${url(params)}">
        <form action="https://x.test/manage/database/portal/${url(params)}">
          <div class="cke"></div>
          <div class="action"><button type="button" onclick="${SAVE_ONCLICK}">Save</button></div>
        </form>
      </div></div>`;
    const options = { cancel: () => true }; // Slate's: removes the placeholder
    window.FW.Dialog.Load(document.querySelector('.dialog'), options);
    return { form: document.querySelector('form'), options };
  };

  // Clicks Save and plays Slate's response: close the dialog, then turn the
  // placeholder into the saved part.
  const savePartWith = (call, savedId) => {
    window.FW.Dialog.Unload();
    const placeholder = document.getElementById('part_1');
    if (savedId && placeholder) {
      placeholder.id = `div_${savedId}`;
      placeholder.setAttribute('data-id', savedId);
    }
    call[2].complete();
  };
  const savePart = (savedId) => {
    slateSave().click();
    savePartWith(commit.mock.calls.at(-1), savedId);
  };

  it('points the dialog at the part its first save created', () => {
    const { form, options } = partDialog('div=part_1');
    savePart('abc');
    expect(unload).not.toHaveBeenCalled();
    const params = new URLSearchParams(form.getAttribute('action').split('?')[1]);
    expect(params.get('id')).toBe('abc');
    expect(params.get('div')).toBe('div_abc');
    expect(document.querySelector('.dialog').getAttribute('data-href')).toContain('id=abc');
    expect(options.cancel).toBe(true); // Cancel no longer removes the saved part
  });

  it("closes the dialog when the new record can't be found", () => {
    const { options } = partDialog('div=part_1');
    savePart(null);
    expect(unload).toHaveBeenCalledTimes(1);
    expect(options.cancel).toBeTypeOf('function');
  });

  it('sends a Save clicked during the first save as an edit of the saved part', () => {
    const { form } = partDialog('div=part_1');
    slateSave().click();
    slateSave().click(); // before the response
    expect(commit).toHaveBeenCalledTimes(1);
    savePartWith(commit.mock.calls[0], 'abc');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(new URLSearchParams(form.getAttribute('action').split('?')[1]).get('id')).toBe('abc');
  });

  it('keeps an existing record open as before', () => {
    const { form } = partDialog('id=abc&div=div_abc');
    const action = form.getAttribute('action');
    savePart(null);
    expect(unload).not.toHaveBeenCalled();
    expect(form.getAttribute('action')).toBe(action);
  });
});
