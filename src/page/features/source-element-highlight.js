// Source view: shade the element the cursor is in. Multi-line elements shade
// every line from the opening tag to the closing tag; single-line elements
// shade just the element's own text.
(() => {
  const SHP = window.SlateHelperPage;
  const LINE_CLASS = 'slate-helper-element-line';
  const MARK_CLASS = 'slate-helper-element-mark';

  const clear = (cm) => {
    const st = cm.state.slateHelperHighlight;
    if (!st) return;
    st.mark?.clear();
    st.lines.forEach((h) => cm.removeLineClass(h, 'background', LINE_CLASS));
    cm.state.slateHelperHighlight = null;
  };

  // The element whose tag the cursor is on, or else the one it's inside.
  // Right after a closing tag's ">" (e.g. </div>|) counts as being on that tag.
  const currentElement = (cm) => {
    const CM = window.CodeMirror;
    const pos = cm.getCursor();
    if (/<\/[\w:-]+\s*>$/.test(cm.getLine(pos.line).slice(0, pos.ch))) {
      const justClosed = CM.findMatchingTag(cm, { line: pos.line, ch: pos.ch - 1 });
      if (justClosed) return justClosed;
    }
    const onTag = CM.findMatchingTag(cm, pos);
    if (onTag) return onTag;
    return CM.findEnclosingTag(cm, pos);
  };

  const update = (cm) => {
    clear(cm);
    if (cm.somethingSelected()) return;
    const el = currentElement(cm);
    if (!el?.open) return;
    const start = el.open.from;
    const end = (el.close || el.open).to;

    const st = { mark: null, lines: [] };
    if (start.line === end.line) {
      st.mark = cm.markText(start, end, { className: MARK_CLASS });
    } else {
      cm.operation(() => {
        for (let l = start.line; l <= end.line; l++) {
          st.lines.push(cm.addLineClass(l, 'background', LINE_CLASS));
        }
      });
    }
    cm.state.slateHelperHighlight = st;
  };

  SHP.registerFeature('source-element-highlight', () => {
    SHP.injectStyle('source-element-highlight', `
      .CodeMirror .${LINE_CLASS} { background: rgba(0, 0, 0, 0.045); }
      .CodeMirror .${MARK_CLASS} { background: rgba(0, 0, 0, 0.07); border-radius: 2px; }
    `);

    SHP.onCodeMirror((cm) => {
      let timer = null;
      cm.on('cursorActivity', () => {
        clearTimeout(timer);
        timer = setTimeout(() => update(cm), 30);
      });
      update(cm);
    });
  });
})();
