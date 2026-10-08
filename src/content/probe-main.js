// Runs in the page's MAIN world so it can see page globals that the isolated
// content-script world cannot. Slate pages load the "FW" framework
// (FW.Dialog, etc.); we report its presence via a DOM attribute + event.
(() => {
  const fw = window.FW;
  const hasFw = !!(fw && typeof fw === 'object' && (fw.Dialog || fw.Lazy || fw.Progress));
  document.documentElement.setAttribute('data-slate-helper-fw', hasFw ? '1' : '0');
  document.dispatchEvent(new CustomEvent('slate-helper:probe'));
})();
