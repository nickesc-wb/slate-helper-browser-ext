// Helpers shared by the source-view (CodeMirror) features.
//
// Slate's source view is CodeMirror 5 in a "liquid" mode: htmlmixed (HTML with
// embedded CSS/JS) plus a multiplexed inner mode for {{ }} and {% %}.
(() => {
  const SHP = window.SlateHelperPage;

  SHP.INDENT = '  ';

  const leadingWhitespace = (text) => text.match(/^[ \t]*/)[0];

  /**
   * What kind of text the cursor is in:
   *   'liquid' inside {{ }} or {% %}
   *   'tag'    inside HTML tag markup (<a href="...">)
   *   'css' / 'javascript' inside <style> / <script>
   *   'text'   body copy
   */
  const context = (cm, pos) => {
    const state = cm.getTokenAt(pos, true).state;
    if (state?.innerActive) return 'liquid';
    const inner = window.CodeMirror.innerMode(cm.getMode(), state);
    const name = inner.mode.name;
    if (name === 'css' || name === 'javascript') return name;
    if (name === 'xml') return inner.state.tagName ? 'tag' : 'text';
    return 'text';
  };

  // --- Templates as CSS / JS / HTML documents ----------------------------------------
  // The language tools (VS Code's CSS/HTML services, HTMLHint, JSHint) don't
  // know Liquid, so they get same-length copies of the text with Liquid masked
  // and, for CSS and JS, everything outside <style> / <script> blanked.
  // Newlines are kept, so line/column positions don't move.

  const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
  const blank = (s) => s.replace(/[^\n]/g, ' ');

  /** Where Liquid tags are: [{ from, to }] as offsets. */
  const liquidSpans = (text) => [...text.matchAll(LIQUID)].map((m) => ({ from: m.index, to: m.index + m[0].length }));

  /** {{ }} becomes underscores (reads as a name in CSS and JS), {% %} becomes spaces. */
  const maskLiquid = (text) => text.replace(LIQUID, (s) => (s[1] === '{' ? s.replace(/[^\n]/g, '_') : blank(s)));

  /**
   * <style> and <script> contents: [{ lang: 'css' | 'javascript', from, to }]
   * as offsets. Scripts with a non-JavaScript type (templates, JSON) are left out.
   */
  const regions = (text) => {
    const out = [];
    const open = /<(style|script)\b([^>]*)>/gi;
    let m;
    while ((m = open.exec(text))) {
      const tag = m[1].toLowerCase();
      const from = m.index + m[0].length;
      const close = text.slice(from).search(new RegExp(`</${tag}\\b`, 'i'));
      const to = close < 0 ? text.length : from + close;
      const type = m[2].match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1].toLowerCase();
      if (tag === 'style') out.push({ lang: 'css', from, to });
      else if (!type || /javascript|ecmascript|module/.test(type)) out.push({ lang: 'javascript', from, to });
      open.lastIndex = to;
    }
    return out;
  };

  /** text with everything outside ranges blanked. */
  const embed = (text, ranges) => {
    let out = '';
    let last = 0;
    for (const r of ranges) {
      out += blank(text.slice(last, r.from)) + text.slice(r.from, r.to);
      last = r.to;
    }
    return out + blank(text.slice(last));
  };

  // --- Docs tooltips -----------------------------------------------------------------

  const escapeHtml = (s) => s.replace(/[<>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // The markdown the language services use for docs: paragraphs, "*" lists,
  // `code`, **bold**, _italics_, links (some with a "title", some with code
  // as their text) and Baseline icons (inline SVG data). The text has HTML
  // entities (&lt;) but no tags, so it's escaped except for "&".
  const MDN = 'https://developer.mozilla.org';
  const emphasis = (s) => s
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s).,:;])/g, '$1<i>$2</i>');

  const inline = (s) => {
    // Pieces already turned into HTML are held as placeholders, so later
    // steps (escaping, emphasis) don't touch them.
    const held = [];
    const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
    const restore = (t) => t.replace(/\u0000(\d+)\u0000/g, (_, i) => restore(held[i]));
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!<>|])/g, (_, c) => hold(escapeHtml(c)))
      .replace(/`([^`]+)`/g, (_, c) => hold(`<code>${escapeHtml(c)}</code>`))
      .replace(/!\[([^\]]*)\]\((data:image\/svg\+xml;base64,[\w+/=]+)\)/g, (_, alt, src) => hold(`<img alt="${escapeHtml(alt)}" src="${src}">`))
      .replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\)/g, (_, text, url, title) => {
        const label = emphasis(escapeHtml(text));
        // MDN paths are site-relative; "#anchor" links point into a page we
        // don't have, so they stay plain text.
        const href = /^https?:\/\//.test(url) ? url : url.startsWith('/') ? MDN + url : null;
        if (!href) return hold(label);
        const tip = title ? ` data-slate-helper-hint="${escapeHtml(restore(title).replace(/<[^>]*>/g, ''))}"` : '';
        return hold(`<a href="${escapeHtml(href)}"${tip} target="_blank" rel="noopener">${label}</a>`);
      });
    return restore(emphasis(escapeHtml(s)));
  };

  const markdown = (md) => md.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[*-]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[*-]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('');

  // --- Docs from the language services ---------------------------------------------
  // Hover and completion docs come as markdown blocks in a fixed order. They're
  // split into parts that can be shown or hidden:
  //   description  what it is (paragraphs, lists, notes)
  //   selector     for CSS selectors: an element it matches and its specificity
  //   support      the Baseline browser-support line
  //   syntax       the CSS value grammar
  //   links        MDN and other references
  const DOC_PARTS = ['description', 'selector', 'support', 'syntax', 'links'];
  const LINKS_ONLY = /^\[[^\]]+\]\([^)]*\)(\s*\|\s*\[[^\]]+\]\([^)]*\))*\s*$/;
  const FIRST_LINK = /\[[^\]]+\]\([^)]*\)/;

  const docParts = (contents) => {
    const parts = Object.fromEntries(DOC_PARTS.map((p) => [p, []]));
    for (const c of [contents].flat()) {
      if (c?.language) {
        parts.selector.push(`<pre><code>${escapeHtml(c.value)}</code></pre>`);
        continue;
      }
      const md = typeof c === 'string' ? c : c?.value ?? '';
      for (const block of md.trim().split(/\n\s*\n/)) {
        if (/^!\[Baseline/.test(block)) parts.support.push(markdown(block));
        else if (/^Syntax:/.test(block)) {
          // Grammar like <'row-gap'> [ <length> ]? is code, not markdown.
          const grammar = block.replace(/^Syntax:\s*/, '').replace(/\\(.)/g, '$1');
          parts.syntax.push(`<p><span class="slate-helper-docs-label">Syntax</span> <code>${escapeHtml(grammar)}</code></p>`);
        } else if (/^\[Selector Specificity\]/.test(block)) parts.selector.push(markdown(block));
        else if (LINKS_ONLY.test(block)) parts.links.push(block);
        else if (block) parts.description.push(block);
      }
    }
    return parts;
  };

  // The first sentence of a markdown paragraph (periods inside link titles or
  // code don't end it).
  const firstSentence = (md) => md.match(/^[\s\S]*?[.!?](?=\s+[A-Z`_*[(]|\s*$)/)?.[0] ?? md;

  /** The Hover docs feature's view options, used for every docs view (hover and suggestion list). */
  const docsSettings = () => ({
    compact: SHP.option('source-docs', 'compact'),
    show: Object.fromEntries(DOC_PARTS.map((p) => [p, SHP.option('source-docs', p)])),
  });

  const CHEVRON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
    + '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /**
   * HTML for a hover's contents. show: { part: false } hides parts. compact:
   * the first sentence, a short support status and the MDN link, with a
   * chevron in the corner that toggles the full view (when there's more to see).
   */
  const docsHtml = (contents, { compact = false, show = {} } = {}) => {
    const on = (part) => show[part] !== false;
    const parts = docParts(contents);
    const full = [
      ...(on('description') ? parts.description.map(markdown) : []),
      ...(on('selector') ? parts.selector : []),
      ...(on('support') ? parts.support : []),
      ...(on('syntax') ? parts.syntax : []),
      ...(on('links') ? parts.links.map(markdown) : []),
    ].join('');
    if (!compact) return full;

    const description = on('description') ? parts.description : [];
    const first = description[0] ? firstSentence(description[0].trim()) : '';
    const meta = [];
    if (on('support') && parts.support[0]) {
      // "<img> <i>Widely available across major browsers (Baseline since 2015)</i>"
      const icon = parts.support[0].match(/<img[^>]*>/)?.[0] ?? '';
      const status = parts.support[0].match(/<i>([^<]*)<\/i>/)?.[1] ?? '';
      meta.push(`<span data-slate-helper-hint="${status}">${icon}${status.replace(/ across major browsers.*/, '')}</span>`);
    }
    const link = on('links') && parts.links[0]?.match(FIRST_LINK)?.[0];
    if (link) meta.push(inline(link));
    const more = (description.length > 1 || first.length < (description[0]?.trim().length ?? 0))
      || (on('selector') && parts.selector.length > 0)
      || (on('syntax') && parts.syntax.length > 0)
      || (on('links') && (parts.links.length > 1 || parts.links[0]?.includes('|')));
    if (!first && !meta.length) return full;
    const summary = (first ? `<p>${inline(first)}</p>` : '')
      + (meta.length ? `<p class="slate-helper-docs-meta">${meta.join(' · ')}</p>` : '');
    if (!more) return summary;
    return `<div class="slate-helper-tooltip-compact">${summary}</div><div class="slate-helper-tooltip-full">${full}</div>`
      + `<button type="button" class="slate-helper-tooltip-more" aria-label="Show more" aria-expanded="false">${CHEVRON}</button>`;
  };

  // --- Tooltip -----------------------------------------------------------------------

  const TOOLTIP_CLASS = 'slate-helper-tooltip';
  let tooltip = null;
  let hint = null; // small label for [data-slate-helper-hint] inside the tooltip
  let placement = null; // { anchor, side, below, sticky } of what's shown, for re-placing after a toggle
  let expandedBefore = false; // for sticky tooltips: the last one was left expanded
  let toggledAt = null; // where the pointer was when the chevron was last clicked

  const hideHint = () => { if (hint) hint.style.display = 'none'; };
  const hideTooltip = () => {
    hideHint();
    if (tooltip) tooltip.style.display = 'none';
  };

  // Our own label for titles inside the tooltip: native title tooltips can end
  // up behind it.
  const showHint = (el) => {
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'slate-helper-tooltip-hint';
      document.body.appendChild(hint);
    }
    hint.textContent = el.dataset.slateHelperHint;
    hint.style.display = 'block';
    const box = el.getBoundingClientRect();
    const { width, height } = hint.getBoundingClientRect();
    hint.style.left = `${Math.max(4, Math.min(box.left, window.innerWidth - width - 4))}px`;
    hint.style.top = `${box.top - height - 4 >= 4 ? box.top - height - 4 : box.bottom + 4}px`;
  };

  const setExpanded = (section, expanded) => {
    section.classList.toggle('slate-helper-expanded', expanded);
    section.querySelector(':scope > .slate-helper-tooltip-more')?.setAttribute('aria-expanded', String(expanded));
  };

  // Above the anchor's line (below it if there's no room), or to its right.
  // Re-placing after More keeps the side it opened on, growing away from the
  // line, so it doesn't jump out from under the mouse.
  const place = (again = false) => {
    const { anchor, side } = placement;
    const { width, height } = tooltip.getBoundingClientRect();
    const fits = (top) => top >= 4 && top + height <= window.innerHeight - 4;
    if (!again) placement.below = !fits(anchor.top - height - 4) && fits(anchor.bottom + 4);
    let top;
    if (side === 'right') top = Math.max(4, Math.min(anchor.top, window.innerHeight - height - 4));
    else if (placement.below) top = anchor.bottom + 4;
    else top = Math.max(4, anchor.top - height - 4);
    tooltip.style.left = `${Math.max(4, Math.min(anchor.x, window.innerWidth - width - 4))}px`;
    tooltip.style.top = `${top}px`;
  };

  /**
   * Show html in the shared tooltip, kept inside the window. anchor is
   * { x, top, bottom } (window coordinates): with side 'above' the tooltip sits
   * just above top (or below bottom if it doesn't fit), with 'right' its top
   * lines up with top. A .slate-helper-tooltip-more chevron inside toggles
   * its section between the -compact and -full views. sticky: open expanded
   * if the last sticky tooltip was left expanded (for the suggestion list,
   * where each highlighted item shows a new one).
   */
  const showTooltip = (html, anchor, side = 'above', { sticky = false } = {}) => {
    if (!tooltip) {
      SHP.injectStyle('tooltip', `
        .${TOOLTIP_CLASS} {
          position: fixed; z-index: 2147483000; box-sizing: border-box; max-width: 480px; max-height: 320px; overflow: auto;
          padding: 4px 7px; background: #fff; color: #222; border: 1px solid #ccc; border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); font: 13px/1.4 system-ui, sans-serif;
        }
        .${TOOLTIP_CLASS} p, .${TOOLTIP_CLASS} ul, .${TOOLTIP_CLASS} pre { margin: 0 0 4px; }
        .${TOOLTIP_CLASS} :is(section, div) > :last-child, .${TOOLTIP_CLASS} > :last-child { margin-bottom: 0; }
        .${TOOLTIP_CLASS} ul { padding-left: 18px; }
        .${TOOLTIP_CLASS} pre { white-space: pre-wrap; }
        .${TOOLTIP_CLASS} section + section { border-top: 1px solid #e5e5e5; margin-top: 4px; padding-top: 4px; }
        .${TOOLTIP_CLASS} code { font: 12px monospace; background: #f3f3f3; padding: 0 2px; border-radius: 2px; }
        .${TOOLTIP_CLASS} img { vertical-align: middle; margin-right: 4px; }
        .${TOOLTIP_CLASS} a { color: #1a73e8; }
        .${TOOLTIP_CLASS} .slate-helper-docs-label { color: #666; margin-right: 2px; }
        .${TOOLTIP_CLASS} .slate-helper-docs-meta { color: #555; font-size: 12px; }
        .${TOOLTIP_CLASS} section:has(> .slate-helper-tooltip-more) { position: relative; padding-right: 16px; }
        .${TOOLTIP_CLASS} .slate-helper-tooltip-more {
          position: absolute; right: -3px; bottom: 0; display: flex; padding: 0; border: 0; border-radius: 3px;
          background: none; color: #666; cursor: pointer; transition: transform 0.15s;
        }
        .${TOOLTIP_CLASS} .slate-helper-tooltip-more:hover { background: #eee; color: #222; }
        .${TOOLTIP_CLASS} .slate-helper-tooltip-full,
        .${TOOLTIP_CLASS} .slate-helper-expanded > .slate-helper-tooltip-compact { display: none; }
        .${TOOLTIP_CLASS} .slate-helper-expanded > .slate-helper-tooltip-full { display: block; }
        .${TOOLTIP_CLASS} .slate-helper-expanded > .slate-helper-tooltip-more { transform: rotate(180deg); }
        .${TOOLTIP_CLASS} [data-slate-helper-hint] { cursor: help; }
        .slate-helper-tooltip-hint {
          position: fixed; z-index: 2147483001; max-width: 360px; padding: 2px 6px; border-radius: 3px;
          background: #333; color: #fff; font: 12px/1.35 system-ui, sans-serif; pointer-events: none;
        }
      `);
      tooltip = document.createElement('div');
      tooltip.className = TOOLTIP_CLASS;
      tooltip.addEventListener('mouseleave', (e) => {
        // Toggling resizes the tooltip, which can move it from under a still
        // pointer; only leaving by moving the mouse counts.
        if (toggledAt && e.clientX === toggledAt.x && e.clientY === toggledAt.y) return;
        hideTooltip();
      });
      // Keep the editor focused, so the suggestion list stays open.
      tooltip.addEventListener('mousedown', (e) => {
        if (e.target.closest('.slate-helper-tooltip-more')) e.preventDefault();
      });
      tooltip.addEventListener('click', (e) => {
        const more = e.target.closest('.slate-helper-tooltip-more');
        if (!more) return;
        const expanded = !more.parentNode.classList.contains('slate-helper-expanded');
        // Don't get narrower, so the chevron stays under the mouse.
        tooltip.style.minWidth = `${tooltip.getBoundingClientRect().width}px`;
        toggledAt = { x: e.clientX, y: e.clientY };
        setExpanded(more.parentNode, expanded);
        if (placement.sticky) expandedBefore = expanded;
        place(true);
      });
      tooltip.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-slate-helper-hint]');
        if (target) showHint(target);
      });
      tooltip.addEventListener('mouseout', (e) => {
        if (e.target.closest('[data-slate-helper-hint]')) hideHint();
      });
      document.body.appendChild(tooltip);
    }
    hideHint();
    tooltip.innerHTML = html;
    if (sticky && expandedBefore) {
      tooltip.querySelectorAll('.slate-helper-tooltip-more').forEach((more) => setExpanded(more.parentNode, true));
    }
    tooltip.style.display = 'block';
    tooltip.style.minWidth = '';
    tooltip.scrollTop = 0;
    toggledAt = null;
    placement = { anchor, side, sticky };
    place();
  };

  /**
   * Show a tooltip above the line when the mouse rests on the editor's text.
   * provider(cm, pos) returns HTML for that position, or null; several
   * features can add one, and their sections are shown together in the order
   * they were added. The tooltip stays while the mouse is on it.
   */
  const onHover = (cm, provider) => {
    if (cm.state.slateHelperHover) {
      cm.state.slateHelperHover.push(provider);
      return;
    }
    const providers = (cm.state.slateHelperHover = [provider]);
    const wrapper = cm.getWrapperElement();
    let timer = null;
    let last = null;
    wrapper.addEventListener('mousemove', (e) => {
      // Chrome also fires mousemove when the page moves under a still pointer
      // (e.g. the tooltip resizing); only real movement counts.
      if (last && last.x === e.clientX && last.y === e.clientY) return;
      last = { x: e.clientX, y: e.clientY };
      clearTimeout(timer);
      timer = setTimeout(() => {
        const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, 'window');
        // Past the end of a line, or not over text at all.
        const box = cm.charCoords(pos, 'window');
        const overText = !pos.outside && e.clientY >= box.top && e.clientY <= box.bottom;
        const sections = overText ? providers.map((p) => p(cm, pos)).filter(Boolean) : [];
        if (!sections.length) return hideTooltip();
        const html = sections.map((h) => `<section>${h}</section>`).join('');
        showTooltip(html, { x: e.clientX - 12, top: box.top, bottom: box.bottom });
      }, 350);
    });
    wrapper.addEventListener('mouseleave', (e) => {
      clearTimeout(timer);
      last = null;
      if (!tooltip?.contains(e.relatedTarget)) hideTooltip();
    });
    cm.on('keydown', hideTooltip);
    cm.on('scroll', hideTooltip);
  };

  /**
   * VS Code's CSS and HTML language services, HTMLHint and JSHint
   * (src/vendor/source-tools.js), loaded the first time a feature asks.
   * SHP.cm.tools is set once they're in.
   */
  const loadTools = () => SHP.load('source-tools').then((tools) => {
    SHP.cm.tools = tools;
    return tools;
  });

  SHP.cm = {
    leadingWhitespace, context,
    liquidSpans, maskLiquid, regions, embed,
    markdown, escapeHtml, docsHtml, docsSettings, showTooltip, hideTooltip, onHover,
    tools: null, loadTools,
  };

  /** The CKEditor instance that owns a .cke element. */
  SHP.ckeditorFor = (ckeEl) =>
    Object.values(window.CKEDITOR?.instances || {}).find((inst) => inst.container?.$ === ckeEl);

  /** Run cb(editor) for every CKEditor once it's ready. */
  SHP.onCKEditor = (cb) => SHP.onAdded('.cke', (ckeEl) => {
    const editor = SHP.ckeditorFor(ckeEl);
    if (editor.status === 'ready') cb(editor);
    else editor.once('instanceReady', () => cb(editor));
  }, (ckeEl) => !!SHP.ckeditorFor(ckeEl));
})();
