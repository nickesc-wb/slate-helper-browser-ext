// Source view: rest the mouse on an HTML tag or attribute, or a CSS property,
// value, selector or at-rule, to see its description from MDN: what it does,
// browser support (Baseline) and a link to the MDN page. The docs come from
// VS Code's HTML and CSS language services (src/vendor/source-tools.js,
// loaded when the first editor opens). Options pick which parts show, and
// whether it opens compact (first sentence; a chevron shows the rest). The
// suggestion list's docs follow the same options.
(() => {
  const SHP = window.SlateHelperPage;
  const on = (option) => SHP.option('source-docs', option);

  /** HTML for the docs at pos, or null (nothing there, or the tools aren't in yet). */
  const docsAt = (cm, pos) => {
    const tools = SHP.cm.tools;
    if (!tools) return null;
    const text = cm.getValue();
    const index = cm.indexFromPos(pos);
    if (SHP.cm.liquidSpans(text).some((s) => s.from <= index && index < s.to)) return null;
    const masked = SHP.cm.maskLiquid(text);
    const region = SHP.cm.regions(text).find((r) => r.from <= index && index <= r.to);
    let hover = null;
    if (region?.lang === 'css' && on('css')) {
      const doc = tools.TextDocument.create('slate.css', 'css', 1, SHP.cm.embed(masked, [region]));
      hover = tools.css.doHover(doc, doc.positionAt(index), tools.css.parseStylesheet(doc));
    } else if (!region && on('html')) {
      const doc = tools.TextDocument.create('slate.html', 'html', 1, masked);
      hover = tools.html.doHover(doc, doc.positionAt(index), tools.html.parseHTMLDocument(doc));
    }
    if (!hover?.contents) return null;
    return SHP.cm.docsHtml(hover.contents, SHP.cm.docsSettings()) || null;
  };

  SHP.docsAt = docsAt; // for tests and the console

  SHP.registerFeature('source-docs', () => {
    SHP.onCodeMirror((cm) => {
      SHP.cm.loadTools();
      SHP.cm.onHover(cm, docsAt);
    });
  });
})();
