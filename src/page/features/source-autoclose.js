// Source view auto-close pairs for ( [ { " '.
//  - Typing an opening character inserts its partner, cursor in between.
//  - Typing a closing character that's already next to the cursor skips it.
//  - Backspace on an empty pair deletes both.
//  - Typing an opening or closing character with text selected wraps it.
//  - Quotes only pair in code: inside tags, <style>, <script> and Liquid, so
//    apostrophes in body copy are left alone.
//  - Typing % right after an auto-closed { gives {%|%} for Liquid tags.
(() => {
  const SHP = window.SlateHelperPage;

  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
  const CLOSERS = { ')': '(', ']': '[', '}': '{' };
  const QUOTES = new Set(['"', "'"]);
  // Only auto-close when the next character is one of these (or end of line),
  // so typing "(" right before a word doesn't add a stray ")".
  const CLOSE_BEFORE = /^($|[\s)\]}'":;>,%])/;

  const single = (cm) => cm.listSelections().length === 1;
  const charAt = (cm, pos, offset) => {
    const line = cm.getLine(pos.line);
    const i = pos.ch + offset;
    return i >= 0 && i < line.length ? line[i] : '';
  };

  const wrap = (cm, open, close) => {
    const [from, to] = [cm.getCursor('from'), cm.getCursor('to')];
    const text = cm.getSelection();
    cm.replaceSelection(open + text + close, null, '+input');
    // Keep the original text selected inside the new pair.
    const startCh = from.ch + 1;
    const end = to.line === from.line ? { line: to.line, ch: to.ch + 1 } : to;
    cm.setSelection({ line: from.line, ch: startCh }, end);
  };

  const opening = (open) => (cm) => {
    if (!single(cm)) return window.CodeMirror.Pass;
    const close = PAIRS[open];
    if (cm.somethingSelected()) return wrap(cm, open, close);

    const cur = cm.getCursor();
    const next = charAt(cm, cur, 0);

    if (QUOTES.has(open)) {
      if (SHP.cm.context(cm, cur) === 'text') return window.CodeMirror.Pass;
      if (next === open) return cm.execCommand('goCharRight');
      if (/\w/.test(charAt(cm, cur, -1))) return window.CodeMirror.Pass;
    }

    if (!CLOSE_BEFORE.test(cm.getLine(cur.line).slice(cur.ch))) return window.CodeMirror.Pass;
    cm.replaceSelection(open + close, null, '+input');
    cm.setCursor({ line: cur.line, ch: cur.ch + 1 });
  };

  const closing = (close) => (cm) => {
    if (!single(cm)) return window.CodeMirror.Pass;
    if (cm.somethingSelected()) return wrap(cm, CLOSERS[close], close);
    if (charAt(cm, cm.getCursor(), 0) === close) return cm.execCommand('goCharRight');
    return window.CodeMirror.Pass;
  };

  const percent = (cm) => {
    if (!single(cm) || cm.somethingSelected()) return window.CodeMirror.Pass;
    const cur = cm.getCursor();
    if (charAt(cm, cur, -1) !== '{' || charAt(cm, cur, 0) !== '}') return window.CodeMirror.Pass;
    cm.replaceSelection('%%', null, '+input');
    cm.setCursor({ line: cur.line, ch: cur.ch + 1 });
  };

  const backspace = (cm) => {
    if (!single(cm) || cm.somethingSelected()) return window.CodeMirror.Pass;
    const cur = cm.getCursor();
    const prev = charAt(cm, cur, -1);
    const next = charAt(cm, cur, 0);
    if (!(PAIRS[prev] === next || (prev === '%' && next === '%'))) return window.CodeMirror.Pass;
    cm.replaceRange('', { line: cur.line, ch: cur.ch - 1 }, { line: cur.line, ch: cur.ch + 1 }, '+delete');
  };

  SHP.registerFeature('source-autoclose', () => {
    const brackets = SHP.option('source-autoclose', 'brackets');
    const quotes = SHP.option('source-autoclose', 'quotes');
    const keys = { name: 'slate-helper-autoclose', Backspace: backspace };
    if (brackets) {
      keys["'%'"] = percent;
      for (const open of '([{') keys[`'${open}'`] = opening(open);
      for (const close of Object.keys(CLOSERS)) keys[`'${close}'`] = closing(close);
    }
    if (quotes) for (const q of QUOTES) keys[`'${q}'`] = opening(q);

    SHP.onCodeMirror((cm) => {
      cm.setOption('autoCloseBrackets', false); // ours replaces CodeMirror's addon
      cm.addKeyMap(keys);
    });
  });
})();
