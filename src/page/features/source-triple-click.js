// Source view: triple-clicking body text selects the text inside the innermost
// element around it (inline ones like <strong> and <a> too), without that
// element's tags, instead of the whole line. Leading and trailing whitespace is
// left out. Triple-clicking an attribute's value selects the value, without
// its quotes. Clicks elsewhere in tags, in <style>/<script>, or between tags
// select the line as usual.
(() => {
  const SHP = window.SlateHelperPage;

  // The value of the attribute at index i of text (Liquid masked), without its
  // quotes, as [from, to] offsets; the quotes themselves count as part of it.
  // null if i isn't in a value. tagStart is the tag's "<".
  const attributeValue = (text, tagStart, i) => {
    let end = tagStart + 1;
    for (let quote = null; end < text.length; end++) {
      const ch = text[end];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '<' || ch === '>') break;
    }
    const tag = text.slice(tagStart, end);
    for (const m of tag.matchAll(/=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/g)) {
      const value = m[1] ?? m[2] ?? m[3];
      const quotes = m[3] === undefined ? 1 : 0;
      const from = tagStart + m.index + m[0].length - quotes - value.length;
      const to = from + value.length;
      if (value && from - quotes <= i && i <= to + quotes) return [from, to];
    }
    return null;
  };

  // Whether index i of text (Liquid masked) is in text between tags that has
  // something besides whitespace. left is the "<" or ">" before i, or -1.
  const inText = (text, left, i) => {
    const rest = text.slice(i).search(/[<>]/);
    const right = rest < 0 ? text.length : i + rest;
    return text[right] !== '>' && /\S/.test(text.slice(left + 1, right));
  };

  // The text inside the element around pos, without the element's tags.
  const elementText = (cm, pos) => {
    const el = window.CodeMirror.findEnclosingTag(cm, pos);
    if (!el?.close) return null;
    const inner = cm.getRange(el.open.to, el.close.from);
    const start = inner.search(/\S/);
    if (start < 0) return null;
    const base = cm.indexFromPos(el.open.to);
    return [base + start, base + inner.trimEnd().length];
  };

  /** What a triple click at pos selects as { from, to }, or null for the line. */
  const rangeAt = (cm, pos) => {
    if (['css', 'javascript'].includes(SHP.cm.context(cm, pos))) return null;
    const text = SHP.cm.maskLiquid(cm.getValue());
    const i = cm.indexFromPos(pos);
    const left = Math.max(text.lastIndexOf('<', i - 1), text.lastIndexOf('>', i - 1));
    const range = text[left] === '<'
      ? attributeValue(text, left, i)
      : inText(text, left, i) && elementText(cm, pos);
    return range && { from: cm.posFromIndex(range[0]), to: cm.posFromIndex(range[1]) };
  };

  // A selection unit for CodeMirror's configureMouse: the element's text or
  // attribute value, or the whole line where there isn't one. Dragging after
  // the triple click extends by the same unit.
  const unit = (cm, pos) => rangeAt(cm, pos)
    || { from: { line: pos.line, ch: 0 }, to: cm.clipPos({ line: pos.line + 1, ch: 0 }) };

  SHP.registerFeature('source-triple-click', () => {
    SHP.onCodeMirror((cm) => {
      const previous = cm.getOption('configureMouse');
      cm.setOption('configureMouse', (cm2, repeat, event) => {
        const value = previous ? previous(cm2, repeat, event) : {};
        // Alt+click is CodeMirror's rectangle selection; leave it alone.
        if (repeat === 'triple' && value.unit == null && !event.altKey) value.unit = unit;
        return value;
      });
    });
  });
})();
