const $ = (id) => document.getElementById(id);
const DEFAULT_SETTINGS = { siteOverrides: {}, features: {}, debug: false };

const showReloadNote = () => { $('reload-note').hidden = false; };

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let state;
  try {
    state = await chrome.tabs.sendMessage(tab.id, { type: 'slate-helper:get-state' });
  } catch {
    state = null; // chrome:// pages, the Web Store, or a tab opened before install
  }

  if (!state?.ready) {
    $('status').textContent = 'n/a';
    $('unavailable').hidden = false;
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

  // Feature toggles (global, not per-site)
  for (const f of state.features) {
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
    box.addEventListener('change', async () => {
      const { features } = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      features[f.id] = box.checked;
      await chrome.storage.sync.set({ features });
      showReloadNote();
    });
    $('features').appendChild(li);
  }

  $('reload').addEventListener('click', () => {
    chrome.tabs.reload(tab.id);
    window.close();
  });
})();
