// Source view: underline problems in the HTML, in <style> (CSS) and in
// <script> (JavaScript); resting the mouse on an underline says what's wrong.
//  - HTML (HTMLHint): tags that don't pair up, duplicate attributes, empty src
//  - CSS (VS Code's CSS service, with VS Code's default checks): syntax errors,
//    unknown properties, empty rules, …
//  - JavaScript (JSHint): syntax errors and likely mistakes
// The linters get the text with Liquid masked (SHP.cm.maskLiquid), and
// problems touching a Liquid tag are dropped, since the masking usually
// caused them. Like the Liquid check, it's only a hint: nothing stops a save.
(() => {
  const SHP = window.SlateHelperPage;
  const on = (option) => SHP.option('source-lint', option);
  const CLASS = { error: 'slate-helper-lint-error', warning: 'slate-helper-lint-warning' };

  const HTML_RULES = { 'tag-pair': true, 'attr-no-duplication': true, 'src-not-empty': true, 'attr-unsafe-chars': true };
  const JS_OPTIONS = { esversion: 11, browser: true, jquery: true, devel: true, maxerr: 200 };

  // Each linter returns [{ from, to, severity, message, source }], offsets into
  // the text. Positions are the same in the masked copies (same lines and length).

  const lintHtml = (tools, cm, masked, regions) => {
    // <style> and <script> contents are linted as CSS and JavaScript.
    const text = regions.reduce((t, r) => t.slice(0, r.from) + t.slice(r.from, r.to).replace(/[^\n]/g, ' ') + t.slice(r.to), masked);
    return tools.HTMLHint.verify(text, HTML_RULES).map((m) => {
      let from = cm.indexFromPos({ line: m.line - 1, ch: m.col - 1 });
      let to;
      if (text[from] === '<') {
        to = text.indexOf('>', from) + 1 || from + 1;
      } else {
        from += m.raw.length - m.raw.trimStart().length;
        to = from + Math.max(1, m.raw.trim().length);
      }
      return { from, to, severity: m.type === 'error' ? 'error' : 'warning', message: m.message, source: 'HTML' };
    });
  };

  const lintCss = (tools, masked, region) => {
    const doc = tools.TextDocument.create('slate.css', 'css', 1, SHP.cm.embed(masked, [region]));
    return tools.css.doValidation(doc, tools.css.parseStylesheet(doc)).map((d) => ({
      from: doc.offsetAt(d.range.start),
      to: doc.offsetAt(d.range.end),
      severity: d.severity === 1 ? 'error' : 'warning',
      message: d.message,
      source: 'CSS',
    }));
  };

  const lintJs = (tools, cm, masked, region) => {
    const { JSHINT } = tools;
    JSHINT(SHP.cm.embed(masked, [region]), JS_OPTIONS);
    return JSHINT.errors
      // E041 "Unrecoverable syntax error" just repeats the error before it.
      .filter((e) => e && e.code !== 'E041')
      .map((e) => {
        const line = cm.getLine(e.line - 1) ?? '';
        // JSHint points at a column (1-based); underline the word there, or
        // the last character when it points past the end of the line.
        let ch = Math.min(e.character - 1, line.length);
        const word = line.slice(ch).match(/^(\w+|\S)/);
        if (!word && ch > 0) ch -= 1;
        const from = cm.indexFromPos({ line: e.line - 1, ch });
        return {
          from,
          to: from + (word ? word[0].length : 1),
          severity: e.code?.startsWith('E') ? 'error' : 'warning',
          message: e.reason,
          source: 'JavaScript',
        };
      });
  };

  /** Every problem in cm's text, sorted. */
  const lint = (cm) => {
    const tools = SHP.cm.tools;
    if (!tools) return [];
    const text = cm.getValue();
    const masked = SHP.cm.maskLiquid(text);
    const regions = SHP.cm.regions(text);
    const problems = [];
    if (on('html')) problems.push(...lintHtml(tools, cm, masked, regions));
    for (const region of regions) {
      if (region.lang === 'css' && on('css')) problems.push(...lintCss(tools, masked, region));
      if (region.lang === 'javascript' && on('js')) problems.push(...lintJs(tools, cm, masked, region));
    }
    const liquid = SHP.cm.liquidSpans(text);
    const seen = new Set();
    return problems
      .filter((p) => !liquid.some((s) => p.from <= s.to && s.from <= p.to))
      .filter((p) => {
        const key = `${p.from}:${p.to}:${p.message}`;
        return !seen.has(key) && seen.add(key);
      })
      .sort((a, b) => a.from - b.from);
  };

  SHP.lint = lint; // for tests and the console

  const update = (cm) => {
    const problems = lint(cm);
    cm.operation(() => {
      (cm.state.slateHelperLintMarks || []).forEach((mark) => mark.clear());
      cm.state.slateHelperLintMarks = problems.map((p) => {
        // Zero-width problems (e.g. at the end of the text) still get a character.
        const to = Math.max(p.to, p.from + 1);
        const from = Math.min(p.from, to - 1);
        const mark = cm.markText(cm.posFromIndex(from), cm.posFromIndex(to), { className: CLASS[p.severity] });
        mark.slateHelperLint = p;
        return mark;
      });
    });
  };

  const problemsAt = (cm, pos) => {
    const found = cm.findMarksAt(pos).map((m) => m.slateHelperLint).filter(Boolean);
    if (!found.length) return null;
    return found.map((p) => `<p><b class="slate-helper-lint-${p.severity}-label">${p.source}</b> ${SHP.cm.escapeHtml(p.message)}</p>`).join('');
  };

  SHP.registerFeature('source-lint', () => {
    SHP.injectStyle('source-lint', `
      .CodeMirror .${CLASS.error}, .CodeMirror .${CLASS.warning} {
        text-decoration: underline wavy #d93025;
        text-decoration-skip-ink: none;
        text-underline-offset: 3px;
      }
      .CodeMirror .${CLASS.warning} { text-decoration-color: #e8a200; }
      .slate-helper-lint-error-label { color: #d93025; }
      .slate-helper-lint-warning-label { color: #b07a00; }
    `);

    SHP.onCodeMirror((cm) => {
      let timer = null;
      const later = () => {
        clearTimeout(timer);
        timer = setTimeout(() => update(cm), 500);
      };
      cm.on('changes', later);
      SHP.cm.onHover(cm, problemsAt);
      SHP.cm.loadTools().then(() => update(cm));
    });
  });
})();
