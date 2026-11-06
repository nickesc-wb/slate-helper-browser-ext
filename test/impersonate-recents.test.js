import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

const HOST = 'slate.example.edu';
const KEY = 'impersonateRecents';

// In-memory chrome.storage.local, shared by every feature instance in a test.
let stored;
const stubChrome = () => {
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key) => ({ [key]: structuredClone(stored[key]) })),
        set: vi.fn(async (items) => { Object.assign(stored, structuredClone(items)); }),
      },
    },
  };
};

// A Slate-like Impersonate dialog with its lookup dropdown (appended to body).
// Picking an item writes its id into the hidden input on mousedown, the way
// Slate's Suggest does, without firing any events.
const setup = ({ scope = 'person' } = {}) => {
  document.body.innerHTML = `
    <div class="dialog" aria-label="Impersonate">
      <form>
        <div class="content"><table><tr><th>Record</th><td>
          <input type="hidden" id="record" name="record" value="">
          <input type="text" id="record_suggest">
          <input type="hidden" name="type" value="${scope}">
        </td></tr></table></div>
        <div class="action">
          <button type="button" class="default">Impersonate</button>
          <button type="button">Cancel</button>
        </div>
      </form>
    </div>
    <div class="suggest">
      <div class="suggest_item" data-id="id-zoe"><div class="suggest_name">Test, <b>Zoe</b></div><div class="suggest_data">Ref: 111<br>DOB: 01/02/2003</div></div>
      <div class="suggest_item" data-id="id-max"><div class="suggest_name">Test, Max</div><div class="suggest_data">Ref: 222</div></div>
    </div>`;
  const record = document.getElementById('record');
  const lookup = document.getElementById('record_suggest');
  for (const item of document.querySelectorAll('.suggest_item')) {
    item.addEventListener('mousedown', () => {
      record.value = item.dataset.id;
      lookup.value = item.querySelector('.suggest_name').textContent;
    });
  }
  return { record, lookup };
};

const start = async (...ids) => {
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/features/impersonate-pick.js', 'src/content/features/impersonate-recents.js');
  for (const id of ids) await globalThis.SlateHelper.features.find((f) => f.id === id).init({ host: HOST });
  await sleep(50); // let the DOM watcher run
};

const mousedown = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
const item = (id) => document.querySelector(`.suggest_item[data-id="${id}"]`);
const impersonate = () => document.querySelector('.action .default').click();
const rows = () => [...document.querySelectorAll('.slate-helper-recents-row')];
const names = () => rows().map((r) => r.querySelector('.slate-helper-recents-name').textContent);

const impersonateRecord = async (id) => {
  mousedown(item(id));
  impersonate();
  await sleep(0);
};

describe('recent impersonations', () => {
  beforeEach(() => {
    stored = {};
    stubChrome();
  });

  it('remembers impersonated records, most recent first, and lists them in the dialog', async () => {
    setup();
    await start('impersonate-recents');
    expect(document.querySelector('.slate-helper-recents').hidden).toBe(true);

    await impersonateRecord('id-zoe');
    await impersonateRecord('id-max');
    await impersonateRecord('id-zoe');

    expect(stored[KEY][HOST].person.map((r) => r.id)).toEqual(['id-zoe', 'id-max']);
    expect(stored[KEY][HOST].person[0]).toEqual({ id: 'id-zoe', name: 'Test, Zoe', lines: ['Ref: 111', 'DOB: 01/02/2003'] });
    expect(document.querySelector('.slate-helper-recents').hidden).toBe(false);
    expect(names()).toEqual(['Test, Zoe', 'Test, Max']);
  });

  it('keeps every impersonated record', async () => {
    const older = Array.from({ length: 20 }, (_, i) => ({ id: `old-${i}`, name: `Old ${i}`, lines: [] }));
    stored[KEY] = { [HOST]: { person: older } };
    setup();
    await start('impersonate-recents');
    expect(rows()).toHaveLength(20);

    await impersonateRecord('id-max');

    expect(stored[KEY][HOST].person.map((r) => r.id)).toEqual(['id-max', ...older.map((r) => r.id)]);
    expect(rows()).toHaveLength(21);
  });

  it('fills the dialog with a recent record when it is clicked', async () => {
    stored[KEY] = { [HOST]: { person: [{ id: 'id-max', name: 'Test, Max', lines: ['Ref: 222'] }] } };
    const { record, lookup } = setup();
    await start('impersonate-recents');

    rows()[0].querySelector('.slate-helper-recents-pick').click();

    expect(record.value).toBe('id-max');
    expect(lookup.value).toBe('Test, Max');
  });

  it('only offers records from this instance and this dialog scope', async () => {
    const entry = (id) => [{ id, name: id, lines: [] }];
    stored[KEY] = {
      [HOST]: { person: entry('mine'), application: entry('other-scope') },
      'other.example.edu': { person: entry('other-host') },
    };
    setup();
    await start('impersonate-recents');
    expect(names()).toEqual(['mine']);

    // A fresh start per dialog: earlier tests' instances still watch the DOM.
    setup({ scope: 'application' });
    await start('impersonate-recents');
    expect(names()).toEqual(['other-scope']);
  });

  it('removes a record from the list', async () => {
    stored[KEY] = { [HOST]: { person: [{ id: 'a', name: 'A', lines: [] }, { id: 'b', name: 'B', lines: [] }] } };
    setup();
    await start('impersonate-recents');

    rows()[0].querySelector('.slate-helper-recents-remove').click();
    await sleep(0);

    expect(stored[KEY][HOST].person.map((r) => r.id)).toEqual(['b']);
    expect(names()).toEqual(['B']);
  });

  it('impersonates a clicked recent right away with Impersonate on pick', async () => {
    stored[KEY] = { [HOST]: { person: [{ id: 'id-max', name: 'Test, Max', lines: [] }] } };
    setup();
    const submit = vi.fn();
    document.querySelector('.action .default').addEventListener('click', submit);
    await start('impersonate-pick', 'impersonate-recents');

    rows()[0].querySelector('.slate-helper-recents-pick').click();
    await sleep(0);

    expect(submit).toHaveBeenCalledTimes(1);
  });
});
