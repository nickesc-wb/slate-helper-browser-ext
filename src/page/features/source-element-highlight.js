// Source view: shade the element the cursor is in. Multi-line elements shade
// every line from the opening tag to the closing tag; single-line elements
// shade just the element's own text. Inside <style>, the innermost CSS rule
// the cursor is in (selector through closing brace) is shaded instead.
// With the liquid option, the innermost Liquid statement around the cursor
// (an {% if %}…{% endif %} block, or a lone {{ }} / {% assign %} tag) is also
// shaded light blue, layered over the element shading.
(() => {
  const SHP = window.SlateHelperPage;
  const LINE_CLASS = 'slate-helper-element-line';
  const MARK_CLASS = 'slate-helper-element-mark';
  const LIQUID_LINE_CLASS = 'slate-helper-liquid-line';
  const LIQUID_MARK_CLASS = 'slate-helper-liquid-mark';

  // Liquid tags that open a block closed by {% end<name> %}.
  const BLOCKS = ['if', 'unless', 'case', 'for', 'capture', 'comment', 'raw', 'tablerow'];
  // Tags that only split a block, so they aren't statements of their own.
  const BRANCHES = ['elsif', 'else', 'when'];
  // Blocks whose content isn't parsed as Liquid.
  const VERBATIM = ['comment', 'raw'];
  // {{ }} (no group) or {% name … %} (group 1 is the tag name).
  const LIQUID = /\{\{[\s\S]*?\}\}|\{%-?\s*(\w*)[\s\S]*?%\}/g;

  // A shading is { mark, lines }: one text mark, or line handles given lineClass.
  const unshade = (cm, st, lineClass) => {
    if (!st) return;
    st.mark?.clear();
    st.lines.forEach((h) => cm.removeLineClass(h, 'background', lineClass));
  };

  // A single-line range gets a text mark, a multi-line one a background per line.
  // A mark spans several <span>s when the text has several tokens, so only its
  // first and last span (-start / -end) get rounded corners.
  const shade = (cm, { from, to }, markClass, lineClass) => {
    const st = { mark: null, lines: [] };
    if (from.line === to.line) {
      st.mark = cm.markText(from, to, { className: markClass, startStyle: `${markClass}-start`, endStyle: `${markClass}-end` });
    } else {
      for (let l = from.line; l <= to.line; l++) st.lines.push(cm.addLineClass(l, 'background', lineClass));
    }
    return st;
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

  /**
   * The innermost Liquid statement around offset cursor in text, as
   * { from, to } offsets: a block from its opening tag through its end tag,
   * or a lone {{ }} / {% %} tag (assign, include, …). Branch tags
   * ({% else %} …) belong to their block. Right after a tag counts as on it.
   * Unclosed blocks are skipped; source-liquid-check underlines those.
   */
  const liquidStatement = (text, cursor) => {
    const stack = []; // { name, from }
    let best = null;
    const consider = (from, to) => {
      // Of the statements around the cursor, the one starting last is the innermost.
      if (from <= cursor && cursor <= to && (!best || from > best.from)) best = { from, to };
    };
    LIQUID.lastIndex = 0;
    let m;
    while ((m = LIQUID.exec(text))) {
      const from = m.index;
      const to = from + m[0].length;
      const name = m[1];
      const top = stack.at(-1);
      if (top && VERBATIM.includes(top.name)) {
        // Inside {% raw %} / {% comment %} only its own end tag counts.
        if (name === `end${top.name}`) consider(stack.pop().from, to);
      } else if (name === undefined) {
        consider(from, to); // {{ }}
      } else if (BLOCKS.includes(name)) {
        stack.push({ name, from });
      } else if (name.startsWith('end') && BLOCKS.includes(name.slice(3))) {
        const i = stack.findLastIndex((t) => t.name === name.slice(3));
        // Anything opened after the matching tag was never closed, so it's dropped.
        if (i !== -1) consider(stack.splice(i)[0].from, to);
      } else if (!BRANCHES.includes(name)) {
        consider(from, to);
      }
    }
    return best;
  };

  const currentLiquidRange = (cm) => {
    const found = liquidStatement(cm.getValue(), cm.indexFromPos(cm.getCursor()));
    return found && { from: cm.posFromIndex(found.from), to: cm.posFromIndex(found.to) };
  };

  const update = (cm) => {
    cm.operation(() => {
      const st = cm.state.slateHelperHighlight;
      unshade(cm, st?.element, LINE_CLASS);
      unshade(cm, st?.liquid, LIQUID_LINE_CLASS);
      cm.state.slateHelperHighlight = null;
      if (cm.somethingSelected()) return;
      const element = currentRange(cm);
      const liquid = SHP.option('source-element-highlight', 'liquid') && currentLiquidRange(cm);
      cm.state.slateHelperHighlight = {
        element: element && shade(cm, element, MARK_CLASS, LINE_CLASS),
        liquid: liquid && shade(cm, liquid, LIQUID_MARK_CLASS, LIQUID_LINE_CLASS),
      };
    });
  };

  SHP.registerFeature('source-element-highlight', () => {
    SHP.injectStyle('source-element-highlight', `
      .CodeMirror .${LINE_CLASS} { background-color: rgba(0, 0, 0, 0.045); }
      .CodeMirror .${MARK_CLASS} { background-color: rgba(0, 0, 0, 0.07); }
      /* A gradient image, not a color, so it layers over the element shading
         when both land on the same line background or text span. */
      .CodeMirror .${LIQUID_LINE_CLASS} { background-image: linear-gradient(rgba(30, 136, 229, 0.08), rgba(30, 136, 229, 0.08)); }
      .CodeMirror .${LIQUID_MARK_CLASS} { background-image: linear-gradient(rgba(30, 136, 229, 0.15), rgba(30, 136, 229, 0.15)); }
      .CodeMirror .${MARK_CLASS}-start, .CodeMirror .${LIQUID_MARK_CLASS}-start { border-top-left-radius: 2px; border-bottom-left-radius: 2px; }
      .CodeMirror .${MARK_CLASS}-end, .CodeMirror .${LIQUID_MARK_CLASS}-end { border-top-right-radius: 2px; border-bottom-right-radius: 2px; }
    `);

    SHP.onCodeMirror((cm) => {
      // Once per editor, even if another page runtime (tests reload it) sees it too.
      if (cm.state.slateHelperHighlightOn) return;
      cm.state.slateHelperHighlightOn = true;
      let timer = null;
      cm.on('cursorActivity', () => {
        clearTimeout(timer);
        timer = setTimeout(() => update(cm), 30);
      });
      update(cm);
    });
  });
})();
