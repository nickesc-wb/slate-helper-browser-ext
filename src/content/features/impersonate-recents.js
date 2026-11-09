// Impersonate dialogs (portals, forms, ...): a "Recents" list under the Record
// lookup with every record impersonated on this Slate instance, most recent
// first, scrolling past a few rows. Clicking one fills the lookup the way
// picking it from Slate's dropdown does, so with Impersonate on pick it
// impersonates right away.
//
// Recents are kept in chrome.storage.local, per host and per dialog scope (the
// dialog's hidden "type" input: person, application, ...), so a person-scoped
// portal never offers an application record. A record is added when
// Impersonate is pressed; its name and detail lines (Ref, Major, DOB...) come
// from the lookup's dropdown item, which Slate appends to <body>.
(() => {
  const SH = globalThis.SlateHelper;

  const KEY = 'impersonateRecents';

  const impersonateButton = (dialog) =>
    [...dialog.querySelectorAll('.action button')].find((b) => b.textContent.trim() === 'Impersonate');

  // The parts of an Impersonate dialog, or null for any other dialog.
  const parts = (dialog) => {
    const record = dialog.querySelector('input[name="record"]');
    const button = impersonateButton(dialog);
    if (!record || !button) return null;
    const lookup = (record.id && dialog.querySelector(`input[id="${record.id}_suggest"]`)) || dialog.querySelector('input[type="text"]');
    if (!lookup) return null;
    return { record, lookup, button, scope: dialog.querySelector('input[name="type"]')?.value || '' };
  };

  // Text of a dropdown item's detail block, one entry per <br>-separated line.
  const lines = (el) => {
    const out = [''];
    for (const node of el?.childNodes || []) {
      if (node.nodeName === 'BR') out.push('');
      else out[out.length - 1] += node.textContent;
    }
    return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  };

  SH.registerFeature({
    id: 'impersonate-recents',
    group: 'Dialogs',
    subgroup: 'Impersonate',
    name: 'Recent impersonations',
    description: 'In an Impersonate dialog, lists every record you have impersonated on this Slate instance, most recent first, under the Record lookup. Click one to pick it.',
    defaultEnabled: true,
    areas: ['admin'],
    async init(ctx) {
      const host = ctx.host;
      let store = (await chrome.storage.local.get(KEY))[KEY] || {};
      const recents = (scope) => store[host]?.[scope] || [];

      // Records seen in the lookup's dropdown, by id, for their name and detail.
      const seen = new Map();
      const note = (item) => {
        const name = item.querySelector('.suggest_name')?.textContent.replace(/\s+/g, ' ').trim();
        if (item.dataset.id && name) seen.set(item.dataset.id, { name, lines: lines(item.querySelector('.suggest_data')) });
      };

      // Writes straight from memory (onChanged keeps it current with other
      // tabs): impersonating often navigates away right after the click, and a
      // read first would give the page time to unload before the write.
      const save = (scope, update) => {
        const site = (store[host] = store[host] || {});
        site[scope] = update(site[scope] || []);
        if (!site[scope].length) delete site[scope];
        if (!Object.keys(site).length) delete store[host];
        chrome.storage.local.set({ [KEY]: store });
        renderAll();
      };

      const remember = ({ record, lookup, scope }) => {
        const id = record.value;
        const info = seen.get(id) || recents(scope).find((r) => r.id === id) || { name: lookup.value.trim() || id, lines: [] };
        SH.log('impersonate-recents: remembering', id);
        save(scope, (list) => [{ id, name: info.name, lines: info.lines }, ...list.filter((r) => r.id !== id)]);
      };

      const pick = ({ record, lookup }, entry) => {
        // What Slate's Suggest callback does with a picked result.
        record.value = entry.id;
        lookup.value = entry.name;
        lookup.style.color = 'black';
      };

      const button = (className, text) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = className;
        if (text) b.textContent = text;
        return b;
      };

      const render = (box, p) => {
        const list = recents(p.scope);
        box.hidden = !list.length;
        const rows = list.map((entry) => {
          const row = document.createElement('div');
          row.className = 'slate-helper-recents-row';
          const choose = button('slate-helper-recents-pick');
          choose.title = [entry.name, ...entry.lines].join('\n');
          const name = document.createElement('span');
          name.className = 'slate-helper-recents-name';
          name.textContent = entry.name;
          const detail = document.createElement('span');
          detail.className = 'slate-helper-recents-detail';
          detail.textContent = entry.lines.join(' · ');
          choose.append(name, detail);
          choose.addEventListener('click', () => pick(p, entry));
          const remove = button('slate-helper-recents-remove', '×');
          remove.title = 'Remove from recents';
          remove.addEventListener('click', () => save(p.scope, (l) => l.filter((r) => r.id !== entry.id)));
          row.append(choose, remove);
          return row;
        });
        const title = document.createElement('div');
        title.className = 'slate-helper-recents-title';
        title.textContent = 'Recents';
        const listEl = document.createElement('div');
        listEl.className = 'slate-helper-recents-list';
        listEl.append(...rows);
        box.replaceChildren(title, listEl);
      };

      const renderAll = () => {
        for (const box of document.querySelectorAll('.slate-helper-recents')) {
          const p = parts(box.closest('.dialog'));
          if (p) render(box, p);
        }
      };

      SH.injectStyle('impersonate-recents', `
        tr:has(> td > .slate-helper-recents:not([hidden])) > th { vertical-align: top; padding-top: 6px; }
        .slate-helper-recents { margin-top: 8px; }
        .slate-helper-recents[hidden] { display: none; }
        .slate-helper-recents-title { margin: 0 0 2px 4px; color: #2a6ebb; }
        .slate-helper-recents-list { max-height: 140px; overflow: hidden auto; }
        .slate-helper-recents-row { display: flex; align-items: center; border-radius: 3px; }
        .slate-helper-recents-row:hover { background: #e8f0fb; }
        /* all: unset keeps Slate's button styles out; the rules after it need
           the same specificity to win. */
        .slate-helper-recents button { all: unset; box-sizing: border-box; cursor: pointer; }
        .slate-helper-recents button:focus-visible { outline: 1px solid #2a6ebb; outline-offset: -1px; }
        .slate-helper-recents button.slate-helper-recents-pick { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; padding: 3px 4px; }
        .slate-helper-recents-name { flex: none; color: #000; white-space: nowrap; }
        .slate-helper-recents-detail { min-width: 0; overflow: hidden; color: #777; font-size: 0.92em; white-space: nowrap; text-overflow: ellipsis; }
        .slate-helper-recents button.slate-helper-recents-remove { padding: 2px 6px; color: #999; font-size: 14px; line-height: 1; visibility: hidden; }
        .slate-helper-recents-row:hover button.slate-helper-recents-remove,
        .slate-helper-recents button.slate-helper-recents-remove:focus-visible { visibility: visible; }
        .slate-helper-recents button.slate-helper-recents-remove:hover { color: #c00; }
      `);

      // Add the list to each new Impersonate dialog and note dropdown items.
      // Idempotent: our own changes to the page land here too.
      const scan = () => {
        document.querySelectorAll('.suggest_item[data-id]').forEach(note);
        for (const dialog of document.querySelectorAll('.dialog')) {
          if (dialog.querySelector('.slate-helper-recents')) continue;
          const p = parts(dialog);
          if (!p) continue;
          const box = document.createElement('div');
          box.className = 'slate-helper-recents';
          p.lookup.parentElement.appendChild(box);
          render(box, p);
        }
      };
      scan();
      SH.onDomChange(scan);

      // A pick can follow a dropdown change within the watcher's delay.
      document.addEventListener('mousedown', (e) => {
        const item = e.target.closest?.('.suggest_item[data-id]');
        if (item) note(item);
      }, true);

      // Remember the record when Impersonate is pressed (also by Impersonate on pick).
      document.addEventListener('click', (e) => {
        const dialog = e.target.closest?.('.dialog');
        const p = dialog && parts(dialog);
        if (p && p.button.contains(e.target) && p.record.value) remember(p);
      }, true);

      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes[KEY]) return;
        store = changes[KEY].newValue || {};
        renderAll();
      });
    },
  });
})();
