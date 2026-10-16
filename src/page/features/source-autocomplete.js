// Source view autocomplete, using CodeMirror's show-hint dropdown (Up/Down to
// move, Tab or Enter to accept, Esc to close). Suggests:
//  - HTML element names after "<" (accepting adds the closing tag; <style>
//    and <script> also get their type attribute)
//  - attribute snippets after a space inside an opening tag
//  - Liquid keywords inside {% %} (block keywords add their end tag; the end
//    tag for the innermost unclosed block is ranked first)
//  - Liquid filters after "|"
//  - Liquid variables already used in this editor, one dotted segment at a
//    time, including loop variables
//  - CSS block snippets after "@" inside <style> (e.g. a 768px media query)
(() => {
  const SHP = window.SlateHelperPage;

  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

  // Attributes added when a tag name is accepted: <sty → <style type="text/css">|</style>
  const TAG_ATTRIBUTES = {
    style: ' type="text/css"',
    script: ' type="text/javascript"',
  };

  // Built-in attribute snippets per tag. "|" marks where the cursor goes.
  const SNIPPETS = {
    a: ['href="|"', 'target="_blank"'],
    img: ['src="|"', 'alt="|"'],
    style: ['type="text/css"'],
    script: ['type="text/javascript"'],
    link: ['rel="stylesheet"'],
    table: ['role="presentation" cellpadding="0" cellspacing="0" border="0"', 'width="100%"'],
    td: ['align="|"', 'valign="top"'],
  };
  // Offered inside every opening tag (once you start typing the name), after
  // that tag's own snippets.
  const ANY_TAG_SNIPPETS = ['style="|"'];

  const BLOCK_KEYWORDS = ['if', 'unless', 'case', 'for', 'capture', 'comment', 'raw', 'tablerow'];
  const KEYWORDS = [
    'if', 'elsif', 'else', 'endif', 'unless', 'endunless', 'case', 'when', 'endcase',
    'for', 'endfor', 'break', 'continue', 'assign', 'capture', 'endcapture',
    'comment', 'endcomment', 'raw', 'endraw', 'tablerow', 'endtablerow', 'cycle', 'increment', 'decrement',
  ];
  // Keywords that take no argument, so accepting one doesn't leave room for one.
  const BARE_KEYWORDS = new Set(['else', 'break', 'continue', 'comment', 'raw', ...KEYWORDS.filter((k) => k.startsWith('end'))]);

  const FILTERS = [
    'abs', 'append', 'at_least', 'at_most', 'capitalize', 'ceil', 'compact', 'concat', 'date', 'default',
    'divided_by', 'downcase', 'escape', 'escape_once', 'first', 'floor', 'join', 'last', 'lstrip', 'map',
    'minus', 'modulo', 'newline_to_br', 'plus', 'prepend', 'remove', 'remove_first', 'replace',
    'replace_first', 'reverse', 'round', 'rstrip', 'size', 'slice', 'sort', 'sort_natural', 'split',
    'strip', 'strip_html', 'strip_newlines', 'times', 'truncate', 'truncatewords', 'uniq', 'upcase',
    'url_decode', 'url_encode', 'where',
  ];

  // Words inside Liquid that are never variables.
  const NOT_VARIABLES = new Set([...KEYWORDS, 'in', 'and', 'or', 'not', 'contains', 'with', 'as',
    'true', 'false', 'nil', 'null', 'empty', 'blank', 'limit', 'offset', 'reversed', 'forloop']);

  const Pos = (line, ch) => window.CodeMirror.Pos(line, ch);
  const on = (option) => SHP.option('source-autocomplete', option);

  // --- Liquid helpers ----------------------------------------------------------

  // Every dotted name used inside {{ }} / {% %} in the document.
  const collectVariables = (text) => {
    const paths = new Set();
    for (const m of text.matchAll(/\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g)) {
      let inner = (m[1] ?? m[2])
        .replace(/"[^"]*"|'[^']*'/g, ' ')  // string literals
        .replace(/\|\s*[\w]+/g, ' ');      // filter names
      if (m[2] !== undefined) inner = inner.replace(/^\s*-?\s*\w+/, ' '); // the tag keyword
      for (const p of inner.matchAll(/[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*/g)) {
        const path = p[0];
        if (NOT_VARIABLES.has(path.split('.')[0])) continue;
        paths.add(path);
      }
    }
    return paths;
  };

  // Next-segment suggestions for a partly typed path like "events.s".
  const variableSuggestions = (paths, typed) => {
    const dot = typed.lastIndexOf('.');
    const base = dot === -1 ? '' : typed.slice(0, dot + 1);
    const partial = typed.slice(dot + 1);
    const out = new Set();
    for (const path of paths) {
      if (!path.startsWith(base)) continue;
      const seg = path.slice(base.length).split('.')[0];
      if (seg && seg.startsWith(partial) && seg !== partial) out.add(seg);
    }
    return { list: [...out].sort(), partial };
  };

  // Block keywords opened above the cursor and not yet closed, innermost last.
  const openBlocks = (textBefore) => {
    const stack = [];
    for (const m of textBefore.matchAll(/\{%-?\s*(\w+)/g)) {
      const kw = m[1];
      if (BLOCK_KEYWORDS.includes(kw)) stack.push(kw);
      else if (kw.startsWith('end') && stack[stack.length - 1] === kw.slice(3)) stack.pop();
    }
    return stack;
  };

  const keywordCompletion = (kw) => ({
    text: kw,
    displayText: kw,
    hint(cm, data) {
      const before = cm.getRange(Pos(data.from.line, 0), data.from);
      const lead = /%$/.test(before) ? ' ' : '';
      const line = cm.getLine(data.to.line);
      const after = line.slice(data.to.ch);
      const closesNext = /^\s*-?%\}/.test(after);
      const text = lead + kw + (BARE_KEYWORDS.has(kw) ? '' : ' ');
      const trail = closesNext && !/^\s/.test(after) ? ' ' : '';
      cm.replaceRange(text + trail, data.from, data.to, 'complete');
      const cursor = Pos(data.from.line, data.from.ch + text.length);

      if (BLOCK_KEYWORDS.includes(kw) && on('liquidEndTags')) {
        // Add the end tag right after this tag's %}.
        const rest = cm.getLine(cursor.line).slice(cursor.ch);
        const close = rest.match(/-?%\}/);
        const endTag = `{% end${kw} %}`;
        if (close) {
          const at = Pos(cursor.line, cursor.ch + close.index + close[0].length);
          cm.replaceRange(endTag, at, at, 'complete');
        } else {
          cm.replaceRange(` %}${endTag}`, cursor, cursor, 'complete');
        }
      }
      cm.setCursor(cursor);
    },
  });

  const liquidHint = (cm, cur, line) => {
    const before = line.slice(0, cur.ch);
    const openAt = Math.max(before.lastIndexOf('{{'), before.lastIndexOf('{%'));
    if (openAt === -1) return null;
    const isTag = before[openAt + 1] === '%';
    const inner = before.slice(openAt + 2);

    // Filter after "|"
    const filter = inner.match(/\|\s*(\w*)$/);
    if (filter) {
      if (!on('liquidKeywords')) return null;
      const partial = filter[1];
      const list = FILTERS.filter((f) => f.startsWith(partial) && f !== partial);
      return { list, from: Pos(cur.line, cur.ch - partial.length), to: cur };
    }

    // Keyword right after {%
    const keyword = isTag && inner.match(/^\s*-?\s*(\w*)$/);
    if (keyword) {
      if (!on('liquidKeywords')) return null;
      const partial = keyword[1];
      const docBefore = cm.getRange(Pos(0, 0), Pos(cur.line, openAt));
      const open = openBlocks(docBefore);
      const preferred = open.length ? `end${open[open.length - 1]}` : null;
      let list = KEYWORDS.filter((k) => k.startsWith(partial) && k !== partial);
      if (preferred && list.includes(preferred)) list = [preferred, ...list.filter((k) => k !== preferred)];
      return { list: list.map(keywordCompletion), from: Pos(cur.line, cur.ch - partial.length), to: cur };
    }

    // Variable path
    const path = inner.match(/(^|[\s(=<>!,:])([A-Za-z_][\w.-]*|)$/);
    if (!path || !on('liquidVariables')) return null;
    const { list, partial } = variableSuggestions(collectVariables(cm.getValue()), path[2]);
    return { list, from: Pos(cur.line, cur.ch - partial.length), to: cur };
  };

  // --- HTML helpers --------------------------------------------------------------

  const elementCompletion = (tag) => {
    const open = tag + (TAG_ATTRIBUTES[tag] || '');
    return {
      text: open,
      displayText: open,
      hint(cm, data) {
        if (VOID_TAGS.has(tag)) {
          cm.replaceRange(`${open} />`, data.from, data.to, 'complete');
          return;
        }
        cm.replaceRange(`${open}></${tag}>`, data.from, data.to, 'complete');
        cm.setCursor(Pos(data.from.line, data.from.ch + open.length + 1));
      },
    };
  };

  const snippetCompletion = (snippet) => ({
    text: snippet.replace('|', ''),
    displayText: snippet.replace('|', ''),
    hint(cm, data) {
      const caret = snippet.indexOf('|');
      const text = snippet.replace('|', '');
      cm.replaceRange(text, data.from, data.to, 'complete');
      cm.setCursor(Pos(data.from.line, data.from.ch + (caret === -1 ? text.length : caret)));
    },
  });

  const htmlHint = (cm, cur, line) => {
    const before = line.slice(0, cur.ch);

    // Element name after "<"
    const tag = before.match(/<([\w-]*)$/);
    if (tag) {
      if (!on('tags')) return null;
      const partial = tag[1].toLowerCase();
      const tags = Object.keys(window.CodeMirror.htmlSchema || {}).filter((t) => t.startsWith(partial) && (t !== partial || TAG_ATTRIBUTES[t]));
      return { list: tags.map(elementCompletion), from: Pos(cur.line, cur.ch - partial.length), to: cur };
    }

    // Attribute snippet after a space inside an opening tag (not inside a value)
    const attr = before.match(/<([\w-]+)\s([^<>]*\s)?([\w-]*)$/);
    if (attr && on('snippets') && ((attr[2] || '').match(/"/g) || []).length % 2 === 0) {
      const name = attr[1].toLowerCase();
      const partial = attr[3];
      const tagEnd = line.indexOf('>', cur.ch);
      const tagText = line.slice(before.lastIndexOf('<'), tagEnd === -1 ? line.length : tagEnd);
      // Every-tag snippets wait for a typed prefix, so a space in any tag
      // doesn't pop up a list.
      const list = [...(SNIPPETS[name] || []), ...(partial ? ANY_TAG_SNIPPETS : [])]
        .filter((s) => s.startsWith(partial))
        .filter((s) => !s.match(/[\w-]+(?==)/g).some((a) => new RegExp(`\\s${a}=`).test(tagText)))
        .map(snippetCompletion);
      return { list, from: Pos(cur.line, cur.ch - partial.length), to: cur };
    }
    return null;
  };

  // --- CSS helpers -----------------------------------------------------------------

  // Block snippets for <style>. "|" marks where the cursor goes; each line after
  // the first gets the current line's indent.
  const CSS_SNIPPETS = [
    { label: '@media (min-width: 768px)', body: '@media (min-width: 768px) {\n  |\n}' },
    // 767.98px, not 768px, so it never overlaps the min-width query above (and
    // still covers fractional widths like 767.5px on zoomed or HiDPI screens).
    { label: '@media (max-width: 767.98px)', body: '@media (max-width: 767.98px) {\n  |\n}' },
  ];

  const cssBlockCompletion = ({ label, body }) => ({
    text: label,
    displayText: label,
    hint(cm, data) {
      const indent = SHP.cm.leadingWhitespace(cm.getLine(data.from.line));
      const text = body.replace(/\n/g, `\n${indent}`);
      const caret = text.indexOf('|');
      const before = text.slice(0, caret).split('\n');
      cm.replaceRange(text.replace('|', ''), data.from, data.to, 'complete');
      cm.setCursor(Pos(data.from.line + before.length - 1,
        (before.length === 1 ? data.from.ch : 0) + before[before.length - 1].length));
    },
  });

  const cssHint = (cm, cur, line) => {
    if (!on('cssSnippets')) return null;
    const at = line.slice(0, cur.ch).match(/(^|[\s;{}])(@[\w-]*)$/);
    if (!at) return null;
    const typed = at[2];
    const list = CSS_SNIPPETS.filter((s) => s.label.startsWith(typed) && s.label !== typed).map(cssBlockCompletion);
    return { list, from: Pos(cur.line, cur.ch - typed.length), to: cur };
  };

  // --- Wiring ----------------------------------------------------------------------

  const hint = (cm) => {
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const ctx = SHP.cm.context(cm, cur);
    let result;
    if (ctx === 'liquid' || /\{[{%][^}]*$/.test(line.slice(0, cur.ch))) result = liquidHint(cm, cur, line);
    else if (ctx === 'css') result = cssHint(cm, cur, line);
    else result = htmlHint(cm, cur, line);
    return result && result.list.length ? result : null;
  };

  SHP.autocompleteHint = hint; // for debugging from the console

  SHP.registerFeature('source-autocomplete', () => {
    SHP.onCodeMirror((cm) => {
      // Not 'inputRead': that skips characters other key handlers insert
      // (e.g. auto-closed {{ }}). Check once the typing operation has
      // finished and the cursor has settled.
      // Slate closes the whole dialog on Esc. When the dropdown is open, Esc
      // should only close the dropdown, so it must not reach Slate.
      cm.getWrapperElement().addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !cm.state.completionActive) return;
        cm.state.completionActive.close();
        e.preventDefault();
        e.stopPropagation();
      }, true);

      let typed = false;
      cm.on('change', (cm, change) => {
        if (change.origin === '+input') typed = true;
      });
      cm.on('cursorActivity', () => {
        if (!typed) return;
        typed = false;
        if (cm.state.completionActive || cm.listSelections().length > 1 || cm.somethingSelected()) return;
        if (hint(cm)) cm.showHint({ hint, completeSingle: false });
      });
    });
  });
})();
