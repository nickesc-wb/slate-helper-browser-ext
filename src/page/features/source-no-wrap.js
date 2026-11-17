// Source view: long lines run off to the right and the editor scrolls
// horizontally, instead of Slate's wrapping them onto the next row. The Wrap
// button (source-wrap-button) can change this as you go; SHP.lineWrap in
// cm-utils.js holds the current choice.
(() => {
  const SHP = window.SlateHelperPage;

  SHP.registerFeature('source-no-wrap', () => {
    SHP.lineWrap.set(true);
  });
})();
