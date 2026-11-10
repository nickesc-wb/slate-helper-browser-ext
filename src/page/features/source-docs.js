// Source view: rest the mouse on an HTML tag or attribute, a CSS property,
// value, selector or at-rule, or a JavaScript name to see its description
// from MDN: what it does, browser support (Baseline) and a link to the MDN
// page; for JavaScript, its signature or type. The docs come from VS Code's
// HTML and CSS language services (src/vendor/source-tools.js, loaded when the
// first editor opens) and TypeScript's (src/vendor/js-tools.js, loaded for
// editors with a <script>). Options pick which parts show and how much detail
// it opens with (compact, standard or verbose; up/down buttons in the corner
// step between them). The suggestion list's docs follow the same options.
(() => {
  const SHP = window.SlateHelperPage;
  const on = (option) => SHP.option('source-docs', option);

  /** HTML for the docs at pos, or null (nothing there, or the tools aren't in yet). */
  const docsAt = (cm, pos) => {
    const text = cm.getValue();
    const index = cm.indexFromPos(pos);
    if (SHP.cm.liquidSpans(text).some((s) => s.from <= index && index < s.to)) return null;
    const region = SHP.cm.regions(text).find((r) => r.from <= index && index <= r.to);
    let contents = null;
    if (region?.lang === 'javascript') {
      if (!on('js')) return null;
      if (!SHP.cm.js) {
        SHP.cm.loadJsTools();
        return null;
      }
      contents = SHP.cm.js.hover(text, index);
    } else {
      const tools = SHP.cm.tools;
      if (!tools) return null;
      const masked = SHP.cm.maskLiquid(text);
      let hover = null;
      if (region?.lang === 'css' && on('css')) {
        const doc = tools.TextDocument.create('slate.css', 'css', 1, SHP.cm.embed(masked, [region]));
        hover = tools.css.doHover(doc, doc.positionAt(index), tools.css.parseStylesheet(doc));
      } else if (!region && on('html')) {
        const doc = tools.TextDocument.create('slate.html', 'html', 1, masked);
        hover = tools.html.doHover(doc, doc.positionAt(index), tools.html.parseHTMLDocument(doc));
      }
      contents = hover?.contents;
    }
    if (!contents) return null;
    return SHP.cm.docsHtml(contents, SHP.cm.docsSettings()) || null;
  };

  SHP.docsAt = docsAt; // for tests and the console

  SHP.registerFeature('source-docs', () => {
    SHP.onCodeMirror((cm) => {
      SHP.cm.loadTools();
      if (on('js') && SHP.cm.regions(cm.getValue()).some((r) => r.lang === 'javascript')) SHP.cm.loadJsTools();
      SHP.cm.onHover(cm, docsAt);
    });
  });
})();
