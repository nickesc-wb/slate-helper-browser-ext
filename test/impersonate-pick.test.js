import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

// A Slate-like Impersonate dialog: the lookup dropdown (appended to body)
// writes the picked record id into the hidden input on mousedown, the way
// Slate's Suggest does, without firing any events.
const setup = ({ value = '' } = {}) => {
  document.body.innerHTML = `
    <div class="dialog">
      <form>
        <div class="header">Impersonate</div>
        <div class="content">
          <input type="hidden" id="record" name="record" value="${value}">
          <input type="text" id="record_suggest">
        </div>
        <div class="action">
          <button type="button" class="default">Impersonate</button>
          <button type="button">Cancel</button>
        </div>
      </form>
    </div>
    <div class="suggest"><div class="suggest_item" id="suggest_item_0_0">Test, Zoe</div></div>`;
  const input = document.getElementById('record');
  document.querySelector('.suggest_item').addEventListener('mousedown', () => { input.value = 'abc-123'; });
  const submit = vi.fn();
  document.querySelector('.action .default').addEventListener('click', submit);
  return { input, submit };
};

const mousedown = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));

describe('impersonate on pick', () => {
  let initialized = false;
  beforeEach(() => {
    if (initialized) return; // the feature's listeners live on document for the whole file
    delete globalThis.SlateHelper;
    loadScripts('src/content/core.js', 'src/content/features/impersonate-pick.js');
    globalThis.SlateHelper.features.find((f) => f.id === 'impersonate-pick').init();
    initialized = true;
  });

  it('presses Impersonate when a record is picked', async () => {
    const { submit } = setup();
    mousedown(document.querySelector('.suggest_item'));
    await sleep(0);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the pick leaves the record unchanged or empty', async () => {
    const { input, submit } = setup({ value: 'abc-123' });
    mousedown(document.querySelector('.suggest_item'));
    await sleep(0);
    input.value = '';
    document.getElementById('record_suggest').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it('ignores other dialogs with a record lookup', async () => {
    const { submit } = setup();
    document.querySelector('.action .default').textContent = 'Save';
    mousedown(document.querySelector('.suggest_item'));
    await sleep(0);
    expect(submit).not.toHaveBeenCalled();
  });
});
