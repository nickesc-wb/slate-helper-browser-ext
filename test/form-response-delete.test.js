import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

const ACTION = 'https://x.test/manage/form/response?id=r1';
const commitOnclick = (cmd, question) =>
  `if (confirm('${question}')) FW.Lazy.Commit(this.form, { 'cmd': '${cmd}' });`;

// A form response popup the way Slate builds it on the Registered tab (Cancel
// Registration) or the Cancelled tab (Restore + Delete).
const popup = (status = 'registered') => {
  const buttons = status === 'registered'
    ? `<button type="button" onclick="${commitOnclick('delete', 'Are you sure you want to cancel this registration?')}">Cancel Registration</button>`
    : `<button type="button" onclick="${commitOnclick('restore', 'Are you sure you want to restore this registration?')}">Restore</button>
       <button type="button" onclick="${commitOnclick('delete', 'Are you sure you want to delete this form response?')}">Delete</button>`;
  document.body.innerHTML = `
    <div class="dialog_host"><div class="dialog">
      <form action="${ACTION}" method="post" enctype="multipart/form-data">
        <input type="hidden" name="record" value="p1">
        <div class="action">
          <button class="default" type="button" onclick="FW.Dialog.Unload();">Close</button>
          <button type="button">Edit</button>
          ${buttons}
        </div>
      </form>
    </div></div>`;
};

const added = () => document.querySelector('.slate-helper-response-delete');
const commit = vi.fn();

beforeAll(() => {
  window.FW = { Lazy: { Commit: commit }, Progress: { Load: vi.fn(), Unload: vi.fn() } };
  delete window.SlateHelperPage;
  loadScripts('src/page/runtime.js', 'src/page/features/form-response-delete.js');
  window.SlateHelperPage.features['form-response-delete']();
});

beforeEach(() => {
  commit.mockReset();
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

const respond = (text, ok = true) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 500, text: async () => text })));

describe('form-response-delete', () => {
  it('adds Delete after Cancel Registration in a registered response popup', async () => {
    popup();
    await sleep(50);
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel Registration');
    expect(added()).not.toBeNull();
    expect(cancel.nextElementSibling).toBe(added());
  });

  it('leaves a cancelled response popup alone (Slate has its own Delete there)', async () => {
    popup('cancelled');
    await sleep(50);
    expect(added()).toBeNull();
  });

  it('cancels with a post, then deletes through Slate\'s commit', async () => {
    popup();
    await sleep(50);
    respond("<script>parent.FW.Dialog.Unload(); parent.$('#rr1').remove();</script>");
    added().click();
    await sleep(0);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(ACTION);
    expect(init.method).toBe('POST');
    expect(init.body.get('cmd')).toBe('delete');
    expect(init.body.get('record')).toBe('p1');
    expect(commit).toHaveBeenCalledWith(document.querySelector('form'), { cmd: 'delete' });
  });

  it('does nothing if the confirm is declined', async () => {
    popup();
    await sleep(50);
    respond('');
    confirm.mockReturnValue(false);
    added().click();
    await sleep(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('stops without deleting if the cancel didn\'t go through', async () => {
    popup();
    await sleep(50);
    respond('<div class="error">Something went wrong</div>');
    added().click();
    await sleep(0);
    expect(commit).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
    expect(added().disabled).toBe(false);
  });
});
