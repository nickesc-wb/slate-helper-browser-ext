// Source view indentation:
//  - Tab inserts 2 spaces (Slate inserts a tab character shown 4 wide);
//    with a selection it indents the selected lines. Shift-Tab outdents.
//  - Backspace in a line's leading spaces removes a whole indent level.
//  - Enter between an opening and closing tag (or a Liquid block and its end
//    tag) splits it onto three lines with the middle one indented.
//  - Pasted multi-line code is re-indented to line up with the cursor.
//  - Typing a block tag no longer splits it onto three lines (Slate default).
// Each is a separate option in the popup.
(() => {
  const SHP = window.SlateHelperPage;
  const { INDENT } = SHP;
  const UNIT = INDENT.length;

  const LIQUID_BLOCK = /\{%-?\s*(if|unless|for|case|capture|comment|raw|tablerow)\b[^%]*-?%\}$/;

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

  const enter = (cm) => {
    if (cm.somethingSelected()) return window.CodeMirror.Pass;
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    if (!isBetweenPair(line.slice(0, cur.ch), line.slice(cur.ch))) return window.CodeMirror.Pass;
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
      if (on('tab')) Object.assign(keys, { Tab: tab, 'Shift-Tab': 'indentLess' });
      if (on('backspace')) keys.Backspace = backspace;
      if (on('enter')) keys.Enter = enter;
      cm.addKeyMap(keys, true);
      if (on('paste')) cm.on('beforeChange', reindentPaste);
      if (!on('splitOnType')) stopSplitOnType(cm);
    });
  });
})();
