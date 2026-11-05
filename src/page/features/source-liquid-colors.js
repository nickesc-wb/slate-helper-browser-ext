// Source view: color the parts of Liquid tags ({{ }} and {% %}) in shades of
// blue: tag names, variables, properties, filters, operators, strings,
// literals and comments. Slate's mode shows each tag in one color.
//
// The whole document is tokenized once per change and a CodeMirror overlay
// looks tokens up by offset. Overlays restart on every line, so this is how
// tags spanning lines, {% comment %} blocks and {% liquid %} stay right.
(() => {
  const SHP = window.SlateHelperPage;
  const PREFIX = 'slate-helper-liquid-';

  const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
  const LITERALS = ['true', 'false', 'nil', 'null', 'empty', 'blank'];
  const WORD_OPERATORS = ['and', 'or', 'contains', 'in', 'reversed', 'with', 'as'];
  // Blocks whose content isn't Liquid: raw is left alone, comment is grayed out.
  const VERBATIM = ['raw', 'comment'];

  // Inside a tag: whitespace, string, number, word, operator / punctuation,
  // {{ }} nested in a {% %} tag (Slate allows it), other.
  const PART = /(\s+)|("[^"]*"?|'[^']*'?)|(-?\d+(?:\.\d+)?(?![\w.]))|([A-Za-z_][\w-]*\??)|(==|!=|<>|<=|>=|\.\.|[<>=|:,.[\]()])|(\{\{-?|-?\}\})|([\s\S])/y;

  /**
   * Tokens for the inside of one tag, text[start..end), pushed onto out.
   * isTag: a {% %} tag, whose first word is the tag name.
   */
  const scanInside = (text, start, end, isTag, out) => {
    const push = (from, to, kind) => out.push({ from, to, kind });
    const body = text.slice(0, end);
    let expectTag = isTag; // the next word names the tag
    let multiline = false; // {% liquid %}: every line starts with a tag name
    let prev = null; // the last operator / punctuation, if it came right before
    PART.lastIndex = start;
    let m;
    while (PART.lastIndex < end && (m = PART.exec(body))) {
      const from = m.index;
      const to = from + m[0].length;
      const [, space, string, number, word, op, nested] = m;
      if (space) {
        if (multiline && space.includes('\n')) expectTag = true;
        continue;
      }
      if (expectTag && m[0] === '#') {
        // {% # note %}, or a # line inside {% liquid %}.
        const lineEnd = multiline ? body.indexOf('\n', from) : -1;
        const stop = lineEnd < 0 ? end : lineEnd;
        push(from, stop, 'comment');
        PART.lastIndex = stop;
        expectTag = multiline;
        continue;
      }
      if (word) {
        let kind;
        if (expectTag) {
          kind = 'tag';
          if (word === 'liquid' && !multiline) multiline = true;
          expectTag = false;
        } else if (prev === '|') kind = 'filter';
        else if (prev === '.') kind = 'property';
        else if (/^\s*:(?!:)/.test(body.slice(to, end))) kind = 'property'; // limit: 5
        else if (LITERALS.includes(word)) kind = 'literal';
        else if (WORD_OPERATORS.includes(word)) kind = 'operator';
        else kind = 'variable';
        push(from, to, kind);
      } else if (string) push(from, to, 'string');
      else if (number) push(from, to, 'literal');
      else if (op) push(from, to, 'operator');
      else if (nested) push(from, to, 'delim');
      prev = op || null;
    }
  };

  /** One tag's tokens: delimiters (with any whitespace-control dash) and inside. */
  const scanTag = (text, from, to, out) => {
    const isTag = text[from + 1] === '%';
    const open = text[from + 2] === '-' ? 3 : 2;
    const close = to - from - open >= 3 && text[to - 3] === '-' ? 3 : 2;
    out.push({ from, to: from + open, kind: 'delim' });
    scanInside(text, from + open, to - close, isTag, out);
    out.push({ from: to - close, to, kind: 'delim' });
  };

  /**
   * Liquid tokens in a template, in order, as [{ from, to, kind }] with
   * offsets into text. kind is delim, tag, variable, property, filter,
   * operator, string, literal or comment.
   */
  const tokens = (text) => {
    const out = [];
    let verbatim = null; // { name, after }
    for (const m of text.matchAll(LIQUID)) {
      const from = m.index;
      const to = from + m[0].length;
      const name = m[0][1] === '%' ? m[0].match(/^\{%-?\s*(\w+)/)?.[1] : undefined;
      if (verbatim) {
        if (name !== `end${verbatim.name}`) continue;
        if (verbatim.name === 'comment' && from > verbatim.after) out.push({ from: verbatim.after, to: from, kind: 'comment' });
        verbatim = null;
      }
      scanTag(text, from, to, out);
      if (VERBATIM.includes(name)) verbatim = { name, after: to };
    }
    return out;
  };

  SHP.liquidTokens = tokens;

  // The first token ending after offset at (tokens are sorted and don't overlap).
  const tokenAt = (list, at) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].to <= at) lo = mid + 1;
      else hi = mid;
    }
    return list[lo];
  };

  const overlayFor = (cm) => {
    let cache = null;
    cm.on('change', () => { cache = null; });
    return {
      name: 'slate-helper-liquid',
      token(stream) {
        // The line being highlighted; old CodeMirror versions don't say.
        const line = stream.lineOracle?.line;
        if (line == null || line >= cm.lineCount()) {
          stream.skipToEnd();
          return null;
        }
        if (!cache) cache = tokens(cm.getValue());
        const base = cm.indexFromPos({ line, ch: 0 });
        const lineEnd = base + stream.string.length;
        const token = tokenAt(cache, base + stream.pos);
        if (!token || token.from >= lineEnd) {
          stream.skipToEnd();
          return null;
        }
        if (token.from > base + stream.pos) {
          stream.pos = token.from - base;
          return null;
        }
        stream.pos = Math.min(token.to, lineEnd) - base;
        return PREFIX + token.kind;
      },
    };
  };

  // Shades of blue, darkest for tag names. Slate's codemirror.css gives its
  // Liquid tokens .cm-s-default span.cm-variable-2 and loads after our style,
  // so the selectors need one more class than that to win.
  const COLORS = {
    delim: 'color: #7f9cc4;',
    tag: 'color: #0b3a82; font-weight: bold;',
    variable: 'color: #1e63c4;',
    property: 'color: #5a8fd6;',
    filter: 'color: #0b8bc4;',
    operator: 'color: #607593;',
    string: 'color: #4652c9;',
    literal: 'color: #2d3a9e;',
    comment: 'color: #93a9c6; font-style: italic;',
  };

  SHP.registerFeature('source-liquid-colors', () => {
    SHP.injectStyle('source-liquid-colors', Object.entries(COLORS)
      .map(([kind, css]) => `.CodeMirror .CodeMirror-code span.cm-${PREFIX}${kind} { ${css} }`).join('\n'));

    SHP.onCodeMirror((cm) => {
      // Once per editor, even if another page runtime (tests reload it) sees it too.
      if (cm.state.slateHelperLiquidColors) return;
      cm.state.slateHelperLiquidColors = true;
      cm.addOverlay(overlayFor(cm));
    });
  });
})();
