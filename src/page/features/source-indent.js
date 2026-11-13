// Source view indentation:
//  - Tab inserts 2 spaces (Slate inserts a tab character shown 4 wide);
//    with a selection it indents the selected lines. Shift-Tab outdents.
//  - Backspace in a line's leading spaces removes a whole indent level.
//  - Enter between an opening and closing tag (or a Liquid block and its end
//    tag) splits it onto three lines with the middle one indented. Anywhere
//    else inside a Liquid block, the new line keeps the block's indent
//    (CodeMirror's own indenting only knows HTML, CSS and JS nesting), and
//    typing a closing tag there doesn't pull its line back out of the block.
//  - Pasted multi-line code is re-indented to line up with the cursor.
//  - Typing a block tag no longer splits it onto three lines (Slate default).
// Each is a separate option in the popup.
(() => {
  const SHP = window.SlateHelperPage;
  const { INDENT } = SHP;
  const UNIT = INDENT.length;

  const LIQUID_BLOCK = /\{%-?\s*(if|unless|for|case|capture|comment|raw|tablerow)\b[^%]*-?%\}$/;

  const BLOCKS = ['if', 'unless', 'for', 'case', 'capture', 'comment', 'raw', 'tablerow'];
  const BRANCHES = ['else', 'elsif', 'when'];
  // Blocks whose content isn't parsed as Liquid.
  const VERBATIM = ['comment', 'raw'];
  const TAG = /\{%-?\s*(\w+)[\s\S]*?-?%\}/g;

  const columns = (cm, text) => window.CodeMirror.countColumn(text, null, cm.getOption('tabSize'));
  const indentOf = (cm, line) => columns(cm, SHP.cm.leadingWhitespace(cm.getLine(line)));

  /**
   * The innermost Liquid block open at pos, as { line, indent, start }: the
   * line of its latest tag ({% if %} or a later {% else %} / {% when %}) and
   * that line's indent, and start, the same for its opening tag. null
   * outside any block.
   */
  const openBlock = (cm, pos) => {
    const text = cm.getRange({ line: 0, ch: 0 }, pos);
    const stack = []; // { name, start, latest }
    TAG.lastIndex = 0;
    let m;
    while ((m = TAG.exec(text))) {
      const name = m[1];
      const top = stack.at(-1);
      if (top && VERBATIM.includes(top.name)) {
        if (name === `end${top.name}`) stack.pop();
      } else if (BLOCKS.includes(name)) {
        stack.push({ name, start: m.index, latest: m.index });
      } else if (top && BRANCHES.includes(name)) {
        top.latest = m.index;
      } else if (name.startsWith('end')) {
        const i = stack.findLastIndex((t) => `end${t.name}` === name);
        if (i !== -1) stack.splice(i);
      }
    }
    const top = stack.at(-1);
    if (!top) return null;
    const at = (index) => {
      const line = cm.posFromIndex(index).line;
      return { line, indent: indentOf(cm, line) };
    };
    return { ...at(top.latest), start: at(top.start) };
  };

  /**
   * How far the line after pos should be indented for the Liquid block it's
   * in, or null outside one. One level in from the block's tag, but no deeper
   * than the line Enter is pressed on, so code that isn't indented inside its
   * blocks stays that way. Text after the cursor that starts with the block's
   * end or {% else %} lines up with the block instead.
   */
  const liquidIndent = (cm, pos) => {
    const block = openBlock(cm, pos);
    if (!block) return null;
    const after = cm.getLine(pos.line).slice(pos.ch);
    if (/^\s*\{%-?\s*end/.test(after)) return block.start.indent;
    if (/^\s*\{%-?\s*(else|elsif|when)\b/.test(after)) return block.indent;
    return enteredIndent(cm, pos, block);
  };

  const enteredIndent = (cm, pos, block) => {
    // A blank line says nothing about the indent: go by the one above.
    let ref = pos.line;
    while (ref > 0 && !cm.getLine(ref).trim()) ref--;
    const wanted = block.indent + UNIT;
    return ref === block.line ? wanted : Math.min(wanted, indentOf(cm, ref));
  };

  const tab = (cm) => {
    if (cm.somethingSelected()) return cm.execCommand('indentMore');
    const ch = cm.getCursor().ch;
    cm.replaceSelection(' '.repeat(UNIT - (ch % UNIT)));
  };

  const backspace = (cm) => {
    if (cm.somethingSelected()) return window.CodeMirror.Pass;
    const cur = cm.getCursor();
    const before = cm.getLine(cur.line).slice(0, cur.ch);
    if (cur.ch === 0 || !/^ +$/.test(before)) return window.CodeMirror.Pass;
    const target = Math.floor((cur.ch - 1) / UNIT) * UNIT;
    cm.replaceRange('', { line: cur.line, ch: target }, cur, '+delete');
  };

  const isBetweenPair = (before, after) => {
    const open = before.match(/<([\w:-]+)(?:\s[^<>]*)?>$/);
    if (open && !open[0].endsWith('/>')) {
      return new RegExp(`^</${open[1]}\\s*>`, 'i').test(after);
    }
    if (/[^{]\{$|^\{$/.test(before) && after.startsWith('}')) return true; // CSS/JS braces
    return LIQUID_BLOCK.test(before) && /^\{%-?\s*end/.test(after);
  };

  // CodeMirror's own Enter, then indented further if a Liquid block needs it.
  const enterInLiquid = (cm, cur) => {
    if (SHP.cm.context(cm, cur) === 'liquid') return window.CodeMirror.Pass;
    const target = liquidIndent(cm, cur);
    if (target === null) return window.CodeMirror.Pass;
    cm.operation(() => {
      cm.execCommand('newlineAndIndent');
      const line = cm.getCursor().line;
      const ws = SHP.cm.leadingWhitespace(cm.getLine(line));
      if (columns(cm, ws) < target) {
        cm.replaceRange(' '.repeat(target), { line, ch: 0 }, { line, ch: ws.length }, '+input');
      }
    });
  };

  // Typing a closing tag like </p> re-indents its line to where CodeMirror's
  // HTML indenting puts it (its "electric" input), which ignores Liquid
  // blocks: inside {% for %} that pulls the line back out of the block. Such
  // a dedent stops at the block's level, or where the line already was if
  // that's less. Shift-Tab still outdents freely.
  const keepLiquidDedent = (cm, change) => {
    if (change.origin !== '+input' || cm.state.slateHelperOutdent) return;
    const { from, to, text } = change;
    if (from.ch !== 0 || to.line !== from.line || text.length !== 1 || /\S/.test(text[0])) return;
    const lineText = cm.getLine(from.line);
    const ws = SHP.cm.leadingWhitespace(lineText);
    const rest = lineText.slice(ws.length);
    if (to.ch !== ws.length || !rest) return;
    const now = columns(cm, ws);
    const proposed = columns(cm, text[0]);
    if (proposed >= now) return;
    const target = liquidIndent(cm, from);
    if (target === null) return;
    const floor = Math.min(now, target);
    if (floor > proposed) change.update(from, to, [' '.repeat(floor)]);
  };

  const outdent = (cm) => {
    cm.state.slateHelperOutdent = true;
    try {
      cm.execCommand('indentLess');
    } finally {
      cm.state.slateHelperOutdent = false;
    }
  };

  const enter = (cm) => {
    if (cm.somethingSelected() || cm.listSelections().length > 1) return window.CodeMirror.Pass;
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    if (!isBetweenPair(line.slice(0, cur.ch), line.slice(cur.ch))) return enterInLiquid(cm, cur);
    const indent = SHP.cm.leadingWhitespace(line);
    cm.replaceRange(`\n${indent}${INDENT}\n${indent}`, cur, cur, '+input');
    cm.setCursor({ line: cur.line + 1, ch: indent.length + UNIT });
  };

  // Strip the indent the pasted lines share, then indent every line after the
  // first to match the line being pasted into.
  const reindentPaste = (cm, change) => {
    if (change.origin !== 'paste' || change.text.length < 2) return;
    const lines = change.text;
    const rest = lines.slice(1).filter((l) => l.trim());
    if (!rest.length) return;
    const common = Math.min(...rest.map((l) => SHP.cm.leadingWhitespace(l).length));

    const lineText = cm.getLine(change.from.line);
    const before = lineText.slice(0, change.from.ch);
    const base = SHP.cm.leadingWhitespace(lineText).slice(0, change.from.ch);
    // If the cursor sits in the indentation already, the first line doesn't
    // need its own leading whitespace.
    const first = /^\s*$/.test(before) ? lines[0].trimStart() : lines[0];

    change.update(change.from, change.to, [
      first,
      ...lines.slice(1).map((l) => (l.trim() ? base + l.slice(common) : '')),
    ]);
  };

  // Slate's editor splits block tags like <div> onto three lines the moment
  // you type the ">" (CodeMirror's closetag "indentTags"). Turning that list
  // off still auto-closes tags, just on one line: <div>|</div>.
  const stopSplitOnType = (cm) => {
    const current = cm.getOption('autoCloseTags');
    if (!current) return;
    cm.setOption('autoCloseTags', { ...(typeof current === 'object' ? current : {}), indentTags: [] });
  };

  SHP.registerFeature('source-indent', () => {
    const on = (option) => SHP.option('source-indent', option);
    SHP.onCodeMirror((cm) => {
      const keys = { name: 'slate-helper-indent' };
      if (on('tab')) Object.assign(keys, { Tab: tab, 'Shift-Tab': outdent });
      if (on('backspace')) keys.Backspace = backspace;
      if (on('enter')) keys.Enter = enter;
      cm.addKeyMap(keys, true);
      if (on('enter')) cm.on('beforeChange', keepLiquidDedent);
      if (on('paste')) cm.on('beforeChange', reindentPaste);
      if (!on('splitOnType')) stopSplitOnType(cm);
    });
  });
})();
