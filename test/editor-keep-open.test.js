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

describe('editor-keep-open Ctrl+S', () => {
  let slateCtrlS;

  beforeAll(() => {
    delete window.SlateHelperPage;
    loadScripts('src/page/runtime.js', 'src/page/cm-utils.js', 'src/page/features/editor-keep-open.js');
    window.SlateHelperPage.features['editor-keep-open']();
    // Stand-in for Slate's own Ctrl+S handler on the document.
    slateCtrlS = vi.fn();
    document.addEventListener('keydown', slateCtrlS);
  });

  beforeEach(() => {
    slateCtrlS.mockClear();
    window.FW = { Validate: () => true, Lazy: { Commit: vi.fn() }, Dialog: { Unload: vi.fn() } };
  });

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
