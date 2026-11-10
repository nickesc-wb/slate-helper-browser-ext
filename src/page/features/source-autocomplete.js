// Source view autocomplete, using CodeMirror's show-hint dropdown (Up/Down to
// move, Tab or Enter to accept, Esc to close). Suggests:
//  - HTML element names after "<" (accepting adds the closing tag; <style>
//    and <script> also get their type attribute)
//  - attribute snippets after a space inside an opening tag, "<!--" after
//    "<!", and HTML entities after "&" in text
//  - Liquid keywords inside {% %} (block keywords add their end tag; the end
//    tag for the innermost unclosed block is ranked first)
//  - Liquid filters after "|"
//  - Liquid variables already used in this editor, one dotted segment at a
//    time, including loop variables
//  - CSS block snippets after "@" inside <style> (e.g. a 768px media query),
//    and "!important" after "!"
//  - JavaScript snippets inside <script> (arrow function, ready handlers,
//    console.log) once two letters of their key are typed
//  - JavaScript names inside <script>: the page's own variables, the DOM,
//    built-ins and jQuery, members after ".", event names and other string
//    values, with docs beside the dropdown (TypeScript's language service,
//    src/vendor/js-tools.js)
//  - CSS properties, values, pseudo-classes etc. inside <style>, with their
//    docs beside the dropdown (VS Code's CSS service, src/vendor/)
(() => {
  const SHP = window.SlateHelperPage;

  const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

  // Attributes added when a tag name is accepted: <sty → <style type="text/css">|</style>
  const TAG_ATTRIBUTES = {
    style: ' type="text/css"',
    script: ' type="text/javascript"',
  };

  // Built-in attribute snippets per tag. "|" marks where the cursor goes.
  const CELL_SNIPPETS = ['align="|"', 'valign="top"', 'colspan="|"', 'width="|"'];
  const SNIPPETS = {
    a: ['href="|"', 'href="mailto:|"', 'href="tel:|"', 'target="_blank"'],
    img: ['src="|"', 'alt="|"', 'width="|"', 'border="0"', 'style="display: block;"'],
    style: ['type="text/css"'],
    script: ['type="text/javascript"'],
    link: ['rel="stylesheet"'],
    table: ['role="presentation" cellpadding="0" cellspacing="0" border="0"', 'width="100%"'],
    td: CELL_SNIPPETS,
    th: CELL_SNIPPETS,
    // A <button> in a Slate form submits it unless it's type="button".
    button: ['type="button"'],
    input: ['type="|"', 'name="|"', 'placeholder="|"'],
    label: ['for="|"'],
    iframe: ['src="|"', 'title="|"', 'width="100%"', 'allowfullscreen'],
  };
  // Offered inside every opening tag (once you start typing the name), after
  // that tag's own snippets.
  const ANY_TAG_SNIPPETS = ['class="|"', 'id="|"', 'style="|"', 'title="|"', 'role="|"', 'aria-label="|"', 'data-|=""'];

  // Attribute names in a snippet: 'role="x" border="0"' → ['role', 'border'].
  const snippetAttributes = (snippet) => snippet.replace(/="[^"]*"/g, '').trim().split(/\s+/);

  // Entities offered after "&" in text, with the character each one shows.
  const ENTITIES = [
    ['nbsp', 'non-breaking space'], ['amp', '&'], ['mdash', '—'], ['ndash', '–'],
    ['rsquo', '’'], ['lsquo', '‘'], ['ldquo', '“'], ['rdquo', '”'], ['hellip', '…'],
    ['bull', '•'], ['copy', '©'], ['reg', '®'], ['trade', '™'],
    ['zwnj', 'zero-width non-joiner, for email preheaders'],
  ];

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

  const entityCompletion = ([name, shows]) => ({
    text: `&${name};`,
    displayText: `&${name};  ${shows}`,
  });

  const htmlHint = (cm, cur, line) => {
    const before = line.slice(0, cur.ch);

    // Comment after "<!"
    if (/<!-{0,2}$/.test(before)) {
      if (!on('tags')) return null;
      const from = Pos(cur.line, before.lastIndexOf('<'));
      return { list: [snippetCompletion('<!-- | -->')], from, to: cur };
    }

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
      // The tag's text without the word being typed, to see which attributes it has.
      const tagText = before.slice(before.lastIndexOf('<'), cur.ch - partial.length)
        + line.slice(cur.ch, tagEnd === -1 ? line.length : tagEnd);
      const has = (a) => new RegExp(`\\s${a}(?=[\\s=/>]|$)`).test(tagText);
      // Every-tag snippets wait for a typed prefix, so a space in any tag
      // doesn't pop up a list.
      const list = [...new Set([...(SNIPPETS[name] || []), ...(partial ? ANY_TAG_SNIPPETS : [])])]
        .filter((s) => s.startsWith(partial))
        .filter((s) => !snippetAttributes(s).some(has))
        .map(snippetCompletion);
      return { list, from: Pos(cur.line, cur.ch - partial.length), to: cur };
    }

    // Entity after "&" in text (not inside a tag, where "&" is usually in a URL)
    const amp = before.match(/&([a-z]*)$/);
    if (amp && on('entities') && before.lastIndexOf('<') <= before.lastIndexOf('>')) {
      const partial = amp[1];
      const list = ENTITIES.filter(([name]) => name.startsWith(partial)).map(entityCompletion);
      return { list, from: Pos(cur.line, cur.ch - amp[0].length), to: cur };
    }
    return null;
  };

  // --- CSS helpers -----------------------------------------------------------------

  // Block snippets for <style>, offered after "@".
  const CSS_SNIPPETS = [
    { label: '@media (min-width: 768px)', body: '@media (min-width: 768px) {\n  |\n}' },
    // 767.98px, not 768px, so it never overlaps the min-width query above (and
    // still covers fractional widths like 767.5px on zoomed or HiDPI screens).
    { label: '@media (max-width: 767.98px)', body: '@media (max-width: 767.98px) {\n  |\n}' },
    { label: '@media (prefers-color-scheme: dark)', body: '@media (prefers-color-scheme: dark) {\n  |\n}' },
    { label: '@media print', body: '@media print {\n  |\n}' },
    { label: '@media (prefers-reduced-motion: reduce)', body: '@media (prefers-reduced-motion: reduce) {\n  |\n}' },
    { label: '@font-face', body: '@font-face {\n  font-family: "|";\n  src: url("");\n}' },
    { label: '@import url("")', body: '@import url("|");' },
    { label: '@keyframes', body: '@keyframes | {\n  from {}\n  to {}\n}' },
  ];

  // Multi-line snippet ({ label, body }) for <style> and <script>. "|" marks
  // where the cursor goes; each line after the first gets the current line's indent.
  const blockCompletion = ({ label, body }) => ({
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

  // A completion from VS Code's CSS service. Its insert text can hold snippet
  // fields ("color: $0;"): the cursor goes to the first one. Accepting a
  // property opens the list again for its values.
  const cssServiceCompletion = (item, from, to) => ({
    text: item.label,
    displayText: item.label,
    docs: item.documentation,
    hint(cm) {
      const raw = item.textEdit?.newText ?? item.insertText ?? item.label;
      let caret = -1;
      const text = raw.replace(/\$\{\d+(?::([^}]*))?\}|\$\d+/g, (m, value = '', offset) => {
        if (caret === -1) caret = offset;
        return value;
      });
      cm.replaceRange(text, from, to, 'complete');
      const start = cm.indexFromPos(from);
      cm.setCursor(cm.posFromIndex(start + (caret === -1 ? text.length : caret)));
      if (item.command?.command === 'editor.action.triggerSuggest') {
        setTimeout(() => cm.showHint({ hint, completeSingle: false }), 0);
      }
    },
  });

  // Property names, values, pseudo-classes etc. from VS Code's CSS service.
  // Opens once something is typed, or right after a ":".
  const cssServiceHint = (cm, cur) => {
    const tools = SHP.cm.tools;
    if (!tools || !on('cssProperties')) return null;
    const text = cm.getValue();
    const index = cm.indexFromPos(cur);
    const region = SHP.cm.regions(text).find((r) => r.lang === 'css' && r.from <= index && index <= r.to);
    if (!region) return null;
    const doc = tools.TextDocument.create('slate.css', 'css', 1, SHP.cm.embed(SHP.cm.maskLiquid(text), [region]));
    const { items } = tools.css.doComplete(doc, doc.positionAt(index), tools.css.parseStylesheet(doc));
    const range = items.find((i) => i.textEdit?.range)?.textEdit.range;
    const from = range ? Pos(range.start.line, range.start.character) : cur;
    const typed = cm.getRange(from, cur).toLowerCase();
    if (!typed && !/:\s*$/.test(cm.getRange(Pos(cur.line, 0), from))) return null;
    const list = items
      .filter((i) => i.label.toLowerCase().startsWith(typed) && i.label.toLowerCase() !== typed)
      .sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label))
      .map((i) => cssServiceCompletion(i, from, cur));
    return { list, from, to: cur };
  };

  const cssHint = (cm, cur, line) => {
    const before = line.slice(0, cur.ch);
    const at = before.match(/(^|[\s;{}])(@[\w-]*)$/);
    if (at && on('cssSnippets')) {
      const typed = at[2];
      const list = CSS_SNIPPETS.filter((s) => s.label.startsWith(typed) && s.label !== typed).map(blockCompletion);
      if (list.length) return { list, from: Pos(cur.line, cur.ch - typed.length), to: cur };
    }
    // "!important" after "!", with a space before it if there isn't one
    const bang = before.match(/(\S?)!(\w*)$/);
    if (bang && on('cssSnippets') && 'important'.startsWith(bang[2]) && bang[2] !== 'important') {
      const from = Pos(cur.line, cur.ch - bang[2].length - 1);
      const text = (bang[1] && !/[\s:]/.test(bang[1]) ? ' ' : '') + '!important';
      return { list: [{ text, displayText: '!important' }], from, to: cur };
    }
    return cssServiceHint(cm, cur);
  };

  // --- JavaScript helpers ------------------------------------------------------------

  // Snippets for <script>, offered once two letters of one of their keys are typed.
  const JS_SNIPPETS = [
    { label: '() => {}', keys: ['arrow', 'fn'], body: '() => {\n  |\n}' },
    { label: '$(function () {})', keys: ['ready', 'jquery'], body: '$(function () {\n  |\n});' },
    {
      label: "document.addEventListener('DOMContentLoaded', …)",
      keys: ['ready', 'domcontentloaded'],
      body: "document.addEventListener('DOMContentLoaded', () => {\n  |\n});",
    },
    { label: 'console.log()', keys: ['log', 'console'], body: 'console.log(|);' },
  ];

  const jsSnippetHint = (cur, before) => {
    if (!on('jsSnippets')) return [];
    const word = before.match(/(^|[^\w$.])(\w{2,})$/);
    if (!word) return [];
    const typed = word[2].toLowerCase();
    return JS_SNIPPETS.filter((s) => s.keys.some((k) => k.startsWith(typed))).map(blockCompletion);
  };

  // A completion from TypeScript's service: the name, with its kind (method,
  // property, …) on the right and its docs beside the list. Some replace more
  // than the typed word (obj["a-b"] for obj.a-b, the rest of a string).
  const jsServiceCompletion = (entry, text, index, from, to) => {
    let docs;
    return {
      text: entry.insertText ?? entry.name,
      displayText: entry.name,
      render(el) {
        el.append(entry.name);
        const kind = document.createElement('span');
        kind.className = 'slate-helper-hint-kind';
        kind.textContent = entry.kind;
        el.append(kind);
      },
      docs: () => (docs === undefined ? (docs = SHP.cm.js.entryDocs(text, index, entry)) : docs),
      hint(cm) {
        const span = entry.replacementSpan;
        const start = span ? cm.posFromIndex(span.start) : from;
        const end = span ? cm.posFromIndex(span.start + span.length) : to;
        cm.replaceRange(entry.insertText ?? entry.name, start, end, 'complete');
      },
    };
  };

  // Names TypeScript knows at the cursor: the page's own variables and
  // functions, the DOM, built-ins and jQuery; members after "."; string values
  // like event names in addEventListener(''). Opens after "." or a quote, or
  // once two letters of a name are typed (one letter and Enter would too often
  // pick a suggestion instead of a new line).
  const jsServiceHint = (cm, cur, before) => {
    if (!on('jsSuggestions')) return [];
    if (!SHP.cm.js) {
      SHP.cm.loadJsTools();
      return [];
    }
    const word = before.match(/[\w$]*$/)[0];
    const prev = before[before.length - word.length - 1];
    const trigger = prev === '.' || /['"`]/.test(prev ?? '');
    if (/^\d/.test(word) || (word.length < 2 && !trigger)) return [];
    const text = cm.getValue();
    const index = cm.indexFromPos(cur);
    const result = SHP.cm.js.completions(text, index);
    if (!result) return [];
    const typed = word.toLowerCase();
    const rank = (e) => [
      e.name.toLowerCase() === typed ? 0 : 1,
      e.kindModifiers?.includes('deprecated') ? 1 : 0,
      e.sortText,
      e.name.startsWith(word) ? 0 : 1,
      e.name.toLowerCase(),
    ];
    const compare = (a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      const i = ra.findIndex((v, j) => v !== rb[j]);
      return i === -1 ? 0 : ra[i] < rb[i] ? -1 : 1;
    };
    const entries = result.entries
      // "warning" entries are just words seen elsewhere in the file;
      // underscores are masked {{ }}.
      .filter((e) => e.kind !== 'warning' && !/^_+$/.test(e.name))
      .filter((e) => e.name.toLowerCase().startsWith(typed))
      .sort(compare);
    // Typing a whole name keeps it at the top, so Enter on it changes nothing,
    // but with nothing else to offer the list stays closed.
    if (entries.length === 1 && entries[0].name === word) return [];
    const from = Pos(cur.line, cur.ch - word.length);
    return entries.map((e) => jsServiceCompletion(e, text, index, from, cur));
  };

  const jsHint = (cm, cur, line) => {
    const before = line.slice(0, cur.ch);
    const list = [...jsSnippetHint(cur, before), ...jsServiceHint(cm, cur, before)];
    const word = before.match(/[\w$]*$/)[0];
    return { list, from: Pos(cur.line, cur.ch - word.length), to: cur };
  };

  // --- Wiring ----------------------------------------------------------------------

  const hint = (cm) => {
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    const ctx = SHP.cm.context(cm, cur);
    let result;
    if (ctx === 'liquid' || /\{[{%][^}]*$/.test(line.slice(0, cur.ch))) result = liquidHint(cm, cur, line);
    else if (ctx === 'css') result = cssHint(cm, cur, line);
    else if (ctx === 'javascript') result = jsHint(cm, cur, line);
    else result = htmlHint(cm, cur, line);
    if (!result || !result.list.length) return null;
    showDocsForSelection(result);
    return result;
  };

  // Show the highlighted suggestion's docs (CSS and JavaScript service ones
  // have them) next to the dropdown, at the detail the Hover docs options say.
  // docs can be a function, for docs that are only looked up when highlighted.
  const docsHtml = (docs) => (typeof docs === 'string'
    ? `<p>${SHP.cm.escapeHtml(docs)}</p>`
    : SHP.cm.docsHtml(docs, SHP.cm.docsSettings()));
  const showDocsForSelection = (result) => {
    if (!result.list.some((c) => c.docs)) return;
    const CM = window.CodeMirror;
    CM.on(result, 'select', (c, el) => {
      const completion = { docs: typeof c.docs === 'function' ? c.docs() : c.docs };
      if (!completion.docs) return SHP.cm.hideTooltip();
      const list = el.parentNode.getBoundingClientRect();
      const item = el.getBoundingClientRect();
      SHP.cm.showTooltip(`<section>${docsHtml(completion.docs)}</section>`,
        { x: list.right + 4, top: item.top, bottom: item.bottom }, 'right', { sticky: true });
    });
    CM.on(result, 'close', SHP.cm.hideTooltip);
  };

  SHP.autocompleteHint = hint; // for debugging from the console

  SHP.registerFeature('source-autocomplete', () => {
    SHP.injectStyle('autocomplete-kind', `
      .CodeMirror-hint .slate-helper-hint-kind { float: right; margin-left: 16px; color: #999; font-size: 0.85em; }
      .CodeMirror-hint-active .slate-helper-hint-kind { color: inherit; opacity: 0.8; }
    `);
    SHP.onCodeMirror((cm) => {
      if (on('cssProperties')) SHP.cm.loadTools();
      // The JavaScript service is big; load it only for editors with a <script>
      // (or, in jsServiceHint, once someone types in one).
      if (on('jsSuggestions') && SHP.cm.regions(cm.getValue()).some((r) => r.lang === 'javascript')) SHP.cm.loadJsTools();

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
