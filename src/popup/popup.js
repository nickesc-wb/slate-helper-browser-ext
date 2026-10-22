const $ = (id) => document.getElementById(id);
const DEFAULT_SETTINGS = { siteOverrides: {}, features: {}, debug: false };
const EXPANDED_KEY = 'slate-helper-popup-expanded'; // which features show their options

const AREA_LABELS = { admin: 'Admin', apply: 'Application', portal: 'Portal', other: 'Other page' };
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
  // Global, not per-site. Options are stored as features['<feature>.<option>'].
  const saveToggle = async (key, value) => {
    const { features } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    features[key] = value;
    await chrome.storage.sync.set({ features });
    showReloadNote();
  };

  const expanded = loadExpanded();

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
    let updateCount = () => {};
    if (f.options.length) {
      const more = el('button', 'more');
      more.type = 'button';
      const count = el('span', 'count');
      more.append(el('span', 'chev', '›'), el('span', null, 'Options'), count);
      const list = el('ul', 'options');

      for (const o of f.options) {
        const label = el('label', 'option');
        const optBox = el('input');
        optBox.type = 'checkbox';
        optBox.checked = o.enabled;
        optBox.addEventListener('change', () => {
          updateCount();
          saveToggle(`${f.id}.${o.id}`, optBox.checked);
        });
        optionBoxes.push(optBox);
        label.append(optBox, el('span', null, o.name));
        const li = el('li');
        li.append(label);
        list.append(li);
      }

      updateCount = () => {
        const on = optionBoxes.filter((b) => b.checked).length;
        count.textContent = `· ${on} of ${optionBoxes.length} on`;
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
      optionBoxes.forEach((b) => { b.disabled = !box.checked; });
    };
    box.addEventListener('change', () => {
      applyEnabled();
      saveToggle(f.id, box.checked);
    });
    applyEnabled();
    updateCount();
    return item;
  };

  for (const group of [...state.groups, 'Other']) {
    const inGroup = state.features.filter((f) => f.group === group);
    if (!inGroup.length) continue;
    const section = el('section', 'group');
    const list = el('ul', 'card');
    inGroup.forEach((f) => list.append(renderFeature(f)));
    section.append(el('h2', null, group), list);
    $('features').append(section);
  }

  $('reload').addEventListener('click', () => reloadTab(tab.id));
})();
