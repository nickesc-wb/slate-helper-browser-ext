import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts } from './helpers/load.js';

const SAVE_ONCLICK = "FW.Lazy.Commit(this, { cmd: 'save' })";

// An editor dialog the way Slate builds it. Save & Close (added by the
// feature) has Slate's "default" class, which is what Slate's Ctrl+S clicks.
const dialog = ({ cke = true } = {}) => {
  document.body.innerHTML = `
    <div class="dialog_host"><div class="dialog">
      ${cke ? '<div class="cke"></div>' : ''}
      <div class="action">
        <button class="slate-helper-save-close default" type="button">Save &amp; Close</button>
        <button type="button" onclick="${SAVE_ONCLICK}">Save</button>
      </div>
    </div></div>`;
};

const ctrlS = () => {
  const e = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};

// Slate's stand-ins. The feature wraps Dialog.Load/Unload when it starts, so
// the same FW object is kept for the whole file and only its mocks are reset.
const commit = vi.fn();
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
});

beforeEach(() => {
  slateCtrlS.mockClear();
  commit.mockReset();
  unload.mockClear();
  load.mockClear();
});

describe('editor-keep-open Ctrl+S', () => {

  it('saves without closing instead of clicking Save & Close', () => {
    dialog();
    expect(ctrlS().defaultPrevented).toBe(true);
    expect(slateCtrlS).not.toHaveBeenCalled();
    const [button, args, callbacks] = window.FW.Lazy.Commit.mock.calls[0];
    expect(button.textContent).toBe('Save');
    expect(args).toEqual({ cmd: 'save' });
    expect(callbacks.complete).toBeTypeOf('function'); // the keep-open save
  });

  it('leaves Ctrl+S to Slate in dialogs without a WYSIWYG editor', () => {
    dialog({ cke: false });
    ctrlS();
    expect(slateCtrlS).toHaveBeenCalled();
    expect(window.FW.Lazy.Commit).not.toHaveBeenCalled();
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
  const save = (savedId) => {
    document.querySelector('.action button').click();
    window.FW.Dialog.Unload();
    const placeholder = document.getElementById('part_1');
    if (savedId && placeholder) {
      placeholder.id = `div_${savedId}`;
      placeholder.setAttribute('data-id', savedId);
    }
    commit.mock.calls.at(-1)[2].complete();
  };

  it('points the dialog at the part its first save created', () => {
    const { form, options } = partDialog('div=part_1');
    save('abc');
    expect(unload).not.toHaveBeenCalled();
    const params = new URLSearchParams(form.getAttribute('action').split('?')[1]);
    expect(params.get('id')).toBe('abc');
    expect(params.get('div')).toBe('div_abc');
    expect(document.querySelector('.dialog').getAttribute('data-href')).toContain('id=abc');
    expect(options.cancel).toBe(true); // Cancel no longer removes the saved part
    expect(document.querySelector('.action button').textContent).toBe('Saved ✓');
  });

  it("closes the dialog when the new record can't be found", () => {
    const { options } = partDialog('div=part_1');
    save(null);
    expect(unload).toHaveBeenCalledTimes(1);
    expect(options.cancel).toBeTypeOf('function');
  });

  it('keeps an existing record open as before', () => {
    const { form } = partDialog('id=abc&div=div_abc');
    const action = form.getAttribute('action');
    save(null);
    expect(unload).not.toHaveBeenCalled();
    expect(form.getAttribute('action')).toBe(action);
  });
});
