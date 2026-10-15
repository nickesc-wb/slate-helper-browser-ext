const $ = (id) => document.getElementById(id);
const DEFAULT_SETTINGS = { siteOverrides: {}, features: {}, debug: false };

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

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Detection can take up to ~1s after the page loads; wait for it.
  let state = await getState(tab.id);
  for (let i = 0; state && !state.ready && i < 10; i++) {
    $('loading').hidden = false;
    await new Promise((r) => setTimeout(r, 300));
    state = await getState(tab.id);
  }
  $('loading').hidden = true;

  if (!state?.ready) {
    $('status').textContent = 'n/a';
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
  $('status').textContent = state.active ? 'Active' : 'Inactive';
  $('status').classList.toggle('on', state.active);
  $('host').textContent = state.host;
  $('area').textContent = state.detection.isSlate ? `Slate · ${state.detection.area}` : 'Not detected as Slate';

  $('score').textContent = `${state.detection.score} / ${state.detection.threshold}`;
  for (const s of state.detection.signals) {
    const li = document.createElement('li');
    li.textContent = `+${s.weight} ${s.id}`;
    $('signals').appendChild(li);
  }
  if (!state.detection.signals.length) $('signals').innerHTML = '<li>No Slate signals found</li>';

  // Per-site override
  $('override').value = state.override;
  $('override').addEventListener('change', async (e) => {
    const { siteOverrides } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    if (e.target.value === 'auto') delete siteOverrides[state.host];
    else siteOverrides[state.host] = e.target.value;
    await chrome.storage.sync.set({ siteOverrides });
    showReloadNote();
  });

  // Feature toggles (global, not per-site), grouped into sections. Options are
  // stored as features['<feature>.<option>'].
  const saveToggle = async (key, value) => {
    const { features } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    features[key] = value;
    await chrome.storage.sync.set({ features });
    showReloadNote();
  };

  const renderFeature = (f) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <label>
        <input type="checkbox">
        <span><strong></strong><span class="desc"></span></span>
      </label>`;
    li.querySelector('strong').textContent = f.name;
    li.querySelector('.desc').textContent = f.description;
    if (!f.appliesHere) {
      const na = document.createElement('span');
      na.className = 'na';
      na.textContent = 'Not used in this area of Slate';
      li.querySelector('.desc').after(na);
    }
    const box = li.querySelector('input');
    box.checked = f.enabled;

    const optionBoxes = [];
    if (f.options.length) {
      const ul = document.createElement('ul');
      ul.className = 'options';
      for (const o of f.options) {
        const optLi = document.createElement('li');
        optLi.innerHTML = '<label><input type="checkbox"><span></span></label>';
        optLi.querySelector('span').textContent = o.name;
        const optBox = optLi.querySelector('input');
        optBox.checked = o.enabled;
        optBox.disabled = !f.enabled;
        optBox.addEventListener('change', () => saveToggle(`${f.id}.${o.id}`, optBox.checked));
        optionBoxes.push(optBox);
        ul.appendChild(optLi);
      }
      li.appendChild(ul);
    }

    box.addEventListener('change', () => {
      optionBoxes.forEach((b) => { b.disabled = !box.checked; });
      saveToggle(f.id, box.checked);
    });
    return li;
  };

  const groups = [...state.groups, 'Other'];
  for (const group of groups) {
    const inGroup = state.features.filter((f) => f.group === group);
    if (!inGroup.length) continue;
    const h = document.createElement('h3');
    h.textContent = group;
    $('features').appendChild(h);
    const ul = document.createElement('ul');
    inGroup.forEach((f) => ul.appendChild(renderFeature(f)));
    $('features').appendChild(ul);
  }

  $('reload').addEventListener('click', () => reloadTab(tab.id));
})();
