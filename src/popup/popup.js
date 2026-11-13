const $ = (id) => document.getElementById(id);
const DEFAULT_SETTINGS = { siteOverrides: {}, features: {}, debug: false };
const EXPANDED_KEY = 'slate-helper-popup-expanded'; // which features show their options
const TAB_KEY = 'slate-helper-popup-tab'; // last-opened feature group

const AREA_LABELS ={ admin: 'Admin', apply: 'Application', portal: 'Portal', other: 'Other page' };
const SIGNAL_LABELS = {
  'technolutions-host': 'technolutions.net address',
  'fw-global': "Slate's FW framework",
  'technolutions-link': 'Link to Technolutions',
  'slate-path': 'Slate-style path',
  'shared-assets': 'Assets from /shared/',
};

const showReloadNote = () => { $('reload-note').hidden = false; };

const getState = async (tabId) => {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'slate-helper:get-state' });
  } catch {
    return null; // no content script in the tab
  }
};

const reloadTab = (tabId) => {
  chrome.tabs.reload(tabId);
  window.close();
};

// Remembered per browser profile, so options you opened stay open. Storage can
// be unavailable; the popup works without it.
const loadExpanded = () => {
  try { return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY)) || []); } catch { return new Set(); }
};
const saveExpanded = (set) => {
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
};
const loadTab = () => {
  try { return localStorage.getItem(TAB_KEY); } catch { return null; }
};
const saveTab = (group) => {
  try { localStorage.setItem(TAB_KEY, group); } catch { /* ignore */ }
};

const setStatus = (text, on = false) => {
  $('status-text').textContent = text;
  $('status').classList.toggle('on', on);
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * Check a JSON option's text against its schema (see text() in
 * src/content/page-features.js): { errors, warnings }, as messages. Empty
 * text is fine (the defaults).
 */
const checkJson = (text, schema) => {
  const errors = [];
  const warnings = [];
  if (!text.trim()) return { errors, warnings };
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    errors.push(`Not valid JSON: ${e.message}`);
    return { errors, warnings };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('The config must be a JSON object, like { "printWidth": 100 }.');
    return { errors, warnings };
  }
  for (const [key, v] of Object.entries(value)) {
    const type = schema.keys[key];
    if (!type) {
      const meant = Object.keys(schema.keys).find((k) => k.toLowerCase() === key.toLowerCase());
      if (key === 'parser' || key === 'plugins') errors.push(`"${key}" is set by Format itself.`);
      else if (meant) errors.push(`"${key}" isn't a setting Format supports. Did you mean "${meant}"?`);
      else errors.push(`"${key}" isn't a setting Format supports.`);
    } else if (type === 'number' && !(Number.isInteger(v) && v > 0)) {
      errors.push(`"${key}" must be a whole number above 0.`);
    } else if (type === 'boolean' && typeof v !== 'boolean') {
      errors.push(`"${key}" must be true or false.`);
    } else if (Array.isArray(type) && !type.includes(v)) {
      errors.push(`"${key}" must be one of ${type.map((t) => `"${t}"`).join(', ')}.`);
    }
  }
  for (const w of schema.warn || []) {
    if (value[w.key] === w.value) warnings.push(w.message);
  }
  return { errors, warnings };
};

// --- Version and update check --------------------------------------------------
// Same comparison as the update toast (src/content/features/update-toast.js).
const isNewerVersion = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return false;
};

const installedVersion = chrome.runtime.getManifest().version;
$('version').textContent = `v${installedVersion}`;
$('check-updates').addEventListener('click', async () => {
  const button = $('check-updates');
  const result = $('update-result');
  button.disabled = true;
  button.textContent = 'Checking…';
  result.replaceChildren();
  const release = await chrome.runtime.sendMessage({ type: 'slate-helper:latest-release', fresh: true }).catch(() => null);
  button.textContent = 'Check for updates';
  button.disabled = false;
  if (!release) {
    result.textContent = "Couldn't reach GitHub";
  } else if (isNewerVersion(release.version, installedVersion)) {
    const link = el('a', null, `v${release.version} available`);
    link.href = release.url;
    link.target = '_blank';
    result.append(link);
  } else {
    result.textContent = 'Up to date';
  }
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (/^https?:/.test(tab.url || '')) $('host').textContent = new URL(tab.url).hostname;

  // Detection can take up to ~1s after the page loads; wait for it.
  let state = await getState(tab.id);
  for (let i = 0; state && !state.ready && i < 10; i++) {
    $('loading').hidden = false;
    setStatus('Checking');
    await new Promise((r) => setTimeout(r, 300));
    state = await getState(tab.id);
  }
  $('loading').hidden = true;

  if (!state?.ready) {
    setStatus('Off');
    // No content script on a web page means the tab was open before the
    // extension was installed or reloaded. Anything else (chrome://, the Web
    // Store, PDFs...) is a page extensions can't run on.
    if (/^https?:/.test(tab.url || '')) {
      $('disconnected').hidden = false;
      $('reload-disconnected').addEventListener('click', () => reloadTab(tab.id));
    } else {
      $('unavailable').hidden = false;
    }
    return;
  }

  $('main').hidden = false;
  setStatus(state.active ? 'Active' : 'Inactive', state.active);
  $('host').textContent = state.host;

  // --- This site --------------------------------------------------------------
  const { detection } = state;
  $('area').textContent = detection.isSlate ? `Slate · ${AREA_LABELS[detection.area] || detection.area}` : 'Not detected as Slate';
  $('area').classList.toggle('off', !detection.isSlate);
  $('score').textContent = `${detection.score} / ${detection.threshold}`;
  for (const s of detection.signals) {
    const li = el('li');
    li.append(el('span', null, SIGNAL_LABELS[s.id] || s.id), el('b', null, `+${s.weight}`));
    $('signals').appendChild(li);
  }
  if (!detection.signals.length) $('signals').appendChild(el('li', null, 'No Slate signals found'));

  const overrideButtons = [...$('override').querySelectorAll('button')];
  const showOverride = (value) => overrideButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === value)));
  showOverride(state.override);
  overrideButtons.forEach((b) => b.addEventListener('click', async () => {
    showOverride(b.dataset.value);
    const { siteOverrides } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    if (b.dataset.value === 'auto') delete siteOverrides[state.host];
    else siteOverrides[state.host] = b.dataset.value;
    await chrome.storage.sync.set({ siteOverrides });
    showReloadNote();
  }));

  // --- Features ---------------------------------------------------------------
  // Global, not per-site. Options are stored as features['<feature>.<option>']:
  // true/false for toggles, the picked value for choices.
  const saveToggle = async (key, value) => {
    const { features } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    features[key] = value;
    await chrome.storage.sync.set({ features });
    showReloadNote();
  };

  const expanded = loadExpanded();

  // A text option: a box saved when you leave it, if it checks out. Problems
  // show under it as you type.
  let textIds = 0;
  const renderTextOption = (f, o, dependents) => {
    const li = el('li', 'option option-text');
    const id = `option-text-${textIds++}`;
    const label = el('label', null, o.name);
    label.htmlFor = id;
    const area = el('textarea');
    area.id = id;
    area.rows = 4;
    area.spellcheck = false;
    area.value = o.value || '';
    if (o.placeholder) area.placeholder = o.placeholder;
    if (o.maxLength) area.maxLength = o.maxLength;
    const message = el('div', 'option-message');
    message.setAttribute('aria-live', 'polite');
    area.setAttribute('aria-describedby', message.id = `${id}-message`);

    const check = () => {
      const { errors, warnings } = o.json ? checkJson(area.value, o.json) : { errors: [], warnings: [] };
      message.replaceChildren(
        ...errors.map((e) => el('div', 'option-error', e)),
        ...(errors.length ? [el('div', 'option-error', 'Not saved until this is fixed.')] : []),
        ...warnings.map((w) => el('div', 'option-warning', w)),
      );
      area.setAttribute('aria-invalid', String(errors.length > 0));
      return errors.length === 0;
    };
    let saved = area.value.trim();
    area.addEventListener('input', check);
    area.addEventListener('change', () => {
      const value = area.value.trim();
      if (!check() || value === saved) return;
      saved = value;
      saveToggle(`${f.id}.${o.id}`, value);
    });
    check();
    dependents.push({ input: area, requires: o.requires });
    li.append(label, area, message);
    return li;
  };

  const renderFeature = (f) => {
    const item = el('li', 'feature');

    const row = el('div', 'feature-row');
    const text = el('div', 'feature-text');
    text.append(el('div', 'name', f.name), el('div', 'desc', f.description));
    if (!f.appliesHere) text.append(el('span', 'na', 'Not used in this area of Slate'));

    const toggle = el('label', 'switch');
    toggle.title = f.enabled ? 'On' : 'Off';
    const box = el('input');
    box.type = 'checkbox';
    box.checked = f.enabled;
    box.setAttribute('aria-label', f.name);
    toggle.append(box, el('span', 'track'));
    row.append(text, toggle);
    item.append(row);

    const optionBoxes = [];
    const optionSelects = [];
    // Text boxes, and checkboxes that require another option: { input, requires }.
    const dependents = [];
    const boxById = {};
    let updateCount = () => {};
    // Off while the feature, or the checkbox option it requires, is.
    const applyRequires = () => dependents.forEach(({ input, requires }) => {
      input.disabled = !box.checked || Boolean(requires && boxById[requires] && !boxById[requires].checked);
    });
    if (f.options.length) {
      const more = el('button', 'more');
      more.type = 'button';
      const count = el('span', 'count');
      more.append(el('span', 'chev', '›'), el('span', null, 'Options'), count);
      const list = el('ul', 'options');

      for (const o of f.options) {
        if (o.choices) {
          const label = el('label', 'option option-choice');
          const select = el('select');
          for (const c of o.choices) {
            const choice = el('option', null, c.label);
            choice.value = c.value;
            select.append(choice);
          }
          select.value = o.value;
          select.addEventListener('change', () => saveToggle(`${f.id}.${o.id}`, select.value));
          optionSelects.push(select);
          label.append(el('span', null, o.name), select);
          const li = el('li');
          li.append(label);
          list.append(li);
          continue;
        }
        if (o.text) {
          list.append(renderTextOption(f, o, dependents));
          continue;
        }
        const label = el('label', 'option');
        const optBox = el('input');
        optBox.type = 'checkbox';
        optBox.checked = o.enabled;
        optBox.addEventListener('change', () => {
          updateCount();
          applyRequires();
          saveToggle(`${f.id}.${o.id}`, optBox.checked);
        });
        optionBoxes.push(optBox);
        boxById[o.id] = optBox;
        if (o.requires) dependents.push({ input: optBox, requires: o.requires });
        const optText = el('span', null, o.name);
        if (o.note) optText.append(el('span', 'option-note', o.note));
        label.append(optBox, optText);
        const li = el('li');
        li.append(label);
        list.append(li);
      }

      updateCount = () => {
        const on = optionBoxes.filter((b) => b.checked).length;
        count.textContent = optionBoxes.length ? `· ${on} of ${optionBoxes.length} on` : '';
      };
      const setOpen = (open) => {
        more.setAttribute('aria-expanded', String(open));
        list.hidden = !open;
      };
      setOpen(expanded.has(f.id));
      more.addEventListener('click', () => {
        const open = more.getAttribute('aria-expanded') !== 'true';
        setOpen(open);
        if (open) expanded.add(f.id);
        else expanded.delete(f.id);
        saveExpanded(expanded);
      });
      item.append(more, list);
    }

    const applyEnabled = () => {
      item.classList.toggle('disabled', !box.checked);
      toggle.title = box.checked ? 'On' : 'Off';
      [...optionBoxes, ...optionSelects].forEach((b) => { b.disabled = !box.checked; });
      applyRequires();
    };
    box.addEventListener('change', () => {
      applyEnabled();
      saveToggle(f.id, box.checked);
    });
    applyEnabled();
    updateCount();
    return item;
  };

  // One tab per group, so no group buries the others.
  const tabs = [...state.groups, 'Other'].flatMap((group) => {
    const inGroup = state.features.filter((f) => f.group === group);
    if (!inGroup.length) return [];
    const i = $('tabs').children.length;
    const tab = el('button', 'tab', group);
    tab.type = 'button';
    tab.title = group;
    tab.id = `tab-${i}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `panel-${i}`);
    const panel = el('div', 'panel');
    panel.id = `panel-${i}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    // A card per subgroup under its heading, in SH.SUBGROUPS order; features
    // without one go last, in a card with no heading.
    const card = (list) => {
      const ul = el('ul', 'card');
      list.forEach((f) => ul.append(renderFeature(f)));
      return ul;
    };
    const subgroups = [...new Set([...(state.subgroups?.[group] || []), ...inGroup.map((f) => f.subgroup)])]
      .filter((s) => s && inGroup.some((f) => f.subgroup === s));
    for (const s of subgroups) panel.append(el('h2', 'subgroup', s), card(inGroup.filter((f) => f.subgroup === s)));
    const rest = inGroup.filter((f) => !subgroups.includes(f.subgroup));
    if (rest.length) panel.append(card(rest));
    $('tabs').append(tab);
    $('features').append(panel);
    return [{ group, tab, panel }];
  });

  const selectTab = (t, focus = false) => {
    for (const o of tabs) {
      o.tab.setAttribute('aria-selected', String(o === t));
      o.tab.tabIndex = o === t ? 0 : -1;
      o.panel.hidden = o !== t;
    }
    if (focus) t.tab.focus();
    saveTab(t.group);
  };
  if (tabs.length) selectTab(tabs.find((t) => t.group === loadTab()) || tabs[0]);
  tabs.forEach((t, i) => {
    t.tab.addEventListener('click', () => selectTab(t));
    t.tab.addEventListener('keydown', (e) => {
      const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      selectTab(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
  // The tab bar sticks under the header while a long group scrolls.
  document.body.style.setProperty('--top-height', `${document.querySelector('.top').offsetHeight}px`);

  $('reload').addEventListener('click', () => reloadTab(tab.id));
})();
