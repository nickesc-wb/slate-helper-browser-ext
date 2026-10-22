// Source view: shade the element the cursor is in. Multi-line elements shade
// every line from the opening tag to the closing tag; single-line elements
// shade just the element's own text. Inside <style>, the innermost CSS rule
// the cursor is in (selector through closing brace) is shaded instead.
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

  // The innermost CSS rule around the cursor ({ from, to } doc positions, from
  // the start of its selector/at-rule through its "}"), or null between rules.
  // Right after a "}" counts as being in that rule. Braces in comments,
  // strings and Liquid tags don't count; unclosed rules are ignored. Also null
  // when the cursor isn't inside a <style>.
  const currentCssRule = (cm) => {
    const text = cm.getValue();
    const cursor = cm.indexFromPos(cm.getCursor());
    let begin = -1;
    for (const m of text.slice(0, cursor).matchAll(/<style\b[^>]*>/gi)) begin = m.index + m[0].length;
    if (begin < 0 || /<\/style\b/i.test(text.slice(begin, cursor))) return null;
    const close = text.slice(cursor).search(/<\/style\b/i);
    const finish = close < 0 ? text.length : cursor + close;

    const open = [];
    let best = null;
    let ruleStart = null;
    for (let i = begin; i < finish; i++) {
      const two = text.slice(i, i + 2);
      const skipTo = (end, openLen) => {
        if (ruleStart === null) ruleStart = i;
        const at = text.indexOf(end, i + openLen);
        i = (at < 0 ? finish : at + end.length) - 1;
      };
      const ch = text[i];
      if (two === '/*') {
        const at = text.indexOf('*/', i + 2);
        i = (at < 0 ? finish : at + 2) - 1;
      } else if (two === '{{') skipTo('}}', 2);
      else if (two === '{%') skipTo('%}', 2);
      else if (ch === '"' || ch === "'") skipTo(ch, 1);
      else if (ch === '{') {
        open.push(ruleStart ?? i);
        ruleStart = null;
      } else if (ch === '}') {
        const from = open.pop();
        ruleStart = null;
        // Of the rules around the cursor, the one starting last is the innermost.
        if (from !== undefined && from <= cursor && cursor <= i + 1 && (!best || from > best.from)) {
          best = { from, to: i + 1 };
        }
      } else if (ch === ';') ruleStart = null;
      else if (ruleStart === null && !/\s/.test(ch)) ruleStart = i;
    }
    return best && { from: cm.posFromIndex(best.from), to: cm.posFromIndex(best.to) };
  };

  const currentRange = (cm) => {
    // 'liquid' too: a {{ }} in a declaration is still inside the CSS rule.
    if (['css', 'liquid'].includes(SHP.cm.context(cm, cm.getCursor()))) {
      const rule = currentCssRule(cm);
      if (rule) return rule;
    }
    const el = currentElement(cm);
    return el?.open && { from: el.open.from, to: (el.close || el.open).to };
  };

  const update = (cm) => {
    clear(cm);
    if (cm.somethingSelected()) return;
    const range = currentRange(cm);
    if (!range) return;
    const start = range.from;
    const end = range.to;

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
