// Source view: long lines run off to the right and the editor scrolls
// horizontally, instead of Slate's wrapping them onto the next row.
(() => {
  const SHP = window.SlateHelperPage;

  SHP.registerFeature('source-no-wrap', () => {
    SHP.onCodeMirror((cm) => {
      if (cm.getOption('lineWrapping')) cm.setOption('lineWrapping', false);
    });
  });
})();
