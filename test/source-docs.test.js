import { describe, expect, it } from 'vitest';
import { provideSourceTools, setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

const editor = async (value, options) => {
  const cm = setupEditor(['source-docs'], value, options);
  provideSourceTools();
  await sleep(0);
  return cm;
};

/** The docs shown for the word starting at the first match of text. */
const docsFor = (cm, text) => {
  const index = cm.getValue().indexOf(text);
  return window.SlateHelperPage.docsAt(cm, cm.posFromIndex(index + 1));
};

const TEMPLATE = '<table width="100%">\n  <tr><td><a href="{{ url }}" target="_blank">Go</a></td></tr>\n</table>\n'
  + '<style>\n  .a { gap: 4px; color: {{ c }}; }\n</style>\n<script>\n  document.title = "x";\n</script>';

describe('source-docs', () => {
  it('describes HTML tags, with Baseline support and an MDN link', async () => {
    const html = docsFor(await editor(TEMPLATE), 'table');
    expect(html).toContain('The table element represents data');
    expect(html).toContain('<img alt="Baseline icon" src="data:image/svg+xml;base64,');
    expect(html).toContain('<a href="https://developer.mozilla.org/docs/Web/HTML/Reference/Elements/table" target="_blank" rel="noopener">MDN Reference</a>');
  });

  it('describes attributes, rendering lists and code', async () => {
    const html = docsFor(await editor(TEMPLATE), 'target');
    expect(html).toContain('<li><code>_self</code>: Load the URL');
  });

  it('describes CSS properties inside <style>', async () => {
    const html = docsFor(await editor(TEMPLATE), 'gap');
    expect(html).toContain('The gap CSS property is a shorthand property for row-gap and column-gap');
  });

  it('has nothing for Liquid, scripts or plain text', async () => {
    const cm = await editor(TEMPLATE);
    expect(docsFor(cm, 'url')).toBeNull();
    expect(docsFor(cm, 'title')).toBeNull();
    expect(docsFor(cm, 'Go')).toBeNull();
  });

  it('resolves links that have a title or code as their text', async () => {
    const cm = await editor('<p class="x">a</p>\n<body link="x"></body>');
    expect(docsFor(cm, 'class')).toContain('<a href="https://developer.mozilla.org/docs/Web/API/Document/getElementsByClassName" '
      + 'data-slate-helper-hint="returns an array-like object of all child elements which have all of the given class names." '
      + 'target="_blank" rel="noopener"><code>Document.getElementsByClassName()</code></a>');
    expect(docsFor(cm, 'link')).toMatch(/<a href="https:\/\/developer.mozilla.org\/en-US\/docs\/Web\/CSS\/color" data-slate-helper-hint="[^"]+" target="_blank" rel="noopener"><code>color<\/code><\/a>/);
    expect(docsFor(cm, 'class')).not.toMatch(/\]\(/);
  });

  it('shows CSS syntax as code', async () => {
    const html = docsFor(await editor(TEMPLATE), 'gap');
    expect(html).toContain('<span class="slate-helper-docs-label">Syntax</span> <code>&lt;\'row-gap\'&gt; &lt;\'column-gap\'&gt;?</code>');
  });

  // The levels in a docs box: [{ name, shown, html }].
  const levels = (html) => {
    const box = document.createElement('section');
    box.innerHTML = html;
    return [...box.querySelectorAll(':scope > .slate-helper-docs-level')]
      .map((el) => ({ name: el.dataset.level, shown: !el.hidden, html: el.innerHTML }));
  };
  const shownLevel = (html) => levels(html).find((l) => l.shown)?.name;

  it('opens at standard by default: the compact view plus the syntax line', async () => {
    const html = docsFor(await editor('<style>\n  .a { padding: 0; }\n</style>'), 'padding');
    const [compact, standard, verbose] = levels(html);
    expect(levels(html).map((l) => l.name)).toEqual(['compact', 'standard', 'verbose']);
    expect(shownLevel(html)).toBe('standard');
    expect(compact.html).toMatch(/^<p>Shorthand property to set values for the thickness of the padding area\.<\/p><p class="slate-helper-docs-meta">/);
    expect(compact.html).toMatch(/<span data-slate-helper-hint="Widely available across major browsers \(Baseline since \d+\)"><img [^>]+>Widely available<\/span> · <a [^>]+>MDN Reference<\/a><\/p>$/);
    const syntax = standard.html.match(/<p><span class="slate-helper-docs-label">Syntax<\/span>.*?<\/p>/)[0];
    expect(standard.html).toBe(compact.html.replace('<p class="slate-helper-docs-meta">', `${syntax}<p class="slate-helper-docs-meta">`));
    expect(verbose.html).toContain(syntax);
    // Up (more detail) on top, down (less) below.
    expect(html).toMatch(/<span class="slate-helper-docs-steps"><button [^>]*class="slate-helper-docs-more" aria-label="Show more"><svg[^>]*><path d="M4 10l4-4 4 4"[^>]*><\/svg><\/button><button [^>]*class="slate-helper-docs-less" aria-label="Show less"><svg[^>]*><path d="M4 6l4 4 4-4"/);
  });

  it('uses the compact styles at every level', async () => {
    const html = docsFor(await editor('<style>\n  .a { padding: 0; }\n</style>', { 'source-docs.view': 'verbose' }), 'padding');
    const verbose = levels(html).find((l) => l.name === 'verbose');
    expect(verbose.shown).toBe(true);
    // The support status stays the short label in the meta line, not an italic paragraph.
    expect(verbose.html).toMatch(/<p class="slate-helper-docs-meta"><span data-slate-helper-hint="[^"]+"><img [^>]+>Widely available<\/span> · /);
    expect(verbose.html).not.toContain('<i>');
  });

  it('opens at the level chosen in the options', async () => {
    const style = '<style>\n  .a { padding: 0; }\n</style>';
    expect(shownLevel(docsFor(await editor(style, { 'source-docs.view': 'compact' }), 'padding'))).toBe('compact');
    expect(shownLevel(docsFor(await editor(style, { 'source-docs.view': 'verbose' }), 'padding'))).toBe('verbose');
  });

  it('without a syntax line, compact and standard are one level', async () => {
    const cm = await editor('<p class="x">a</p>', { 'source-docs.view': 'compact' });
    const html = docsFor(cm, 'class');
    expect(levels(html).map((l) => l.name)).toEqual(['standard', 'verbose']);
    expect(shownLevel(html)).toBe('standard');
  });

  it('has no buttons when there is only one level', async () => {
    const html = docsFor(await editor(TEMPLATE), 'table');
    expect(html).not.toContain('slate-helper-docs-steps');
    expect(html).toMatch(/^<p>The table element represents data/);
  });

  it('hides the parts turned off', async () => {
    const cm = await editor(TEMPLATE, {
      'source-docs.view': 'verbose', 'source-docs.support': false, 'source-docs.syntax': false, 'source-docs.links': false,
    });
    const html = docsFor(cm, 'gap');
    expect(html).toContain('The gap CSS property');
    expect(html).not.toMatch(/Baseline|Syntax|MDN Reference/);
  });

  it('shows the tooltip above the line, or below it when there is no room', () => {
    setupEditor(['source-docs'], '');
    const { showTooltip } = window.SlateHelperPage.cm;
    const tip = () => document.querySelector('.slate-helper-tooltip');
    const size = (height) => { tip().getBoundingClientRect = () => ({ width: 200, height, top: 0, left: 0 }); };
    showTooltip('<p>x</p>', { x: 50, top: 300, bottom: 316 });
    size(100);
    showTooltip('<p>x</p>', { x: 50, top: 300, bottom: 316 });
    expect(tip().style.top).toBe('196px');
    showTooltip('<p>x</p>', { x: 50, top: 40, bottom: 56 });
    expect(tip().style.top).toBe('60px');
    showTooltip('<p>x</p>', { x: 50, top: 300, bottom: 316 }, 'right');
    expect(tip().style.top).toBe('300px');
  });

  const showDocs = (html, sticky = false) => {
    window.SlateHelperPage.cm.showTooltip(`<section>${html}</section>`, { x: 0, top: 300, bottom: 316 }, sticky ? 'right' : 'above', { sticky });
    const section = document.querySelector('.slate-helper-tooltip section');
    const less = section.querySelector('.slate-helper-docs-less');
    const more = section.querySelector('.slate-helper-docs-more');
    const state = () => `${levels(section.innerHTML).find((l) => l.shown).name} less:${!less.disabled} more:${!more.disabled}`;
    return { less, more, state };
  };

  it('less and more step through the levels, enabled only when there is a level that way', async () => {
    const html = docsFor(await editor('<style>\n  .a { padding: 0; }\n</style>'), 'padding');
    const { less, more, state } = showDocs(html);
    expect(state()).toBe('standard less:true more:true');
    less.click();
    expect(state()).toBe('compact less:false more:true');
    more.click();
    more.click();
    expect(state()).toBe('verbose less:true more:false');
    less.click();
    expect(state()).toBe('standard less:true more:true');
  });

  it('a box without a syntax line has two levels to step between', async () => {
    const { more, state } = showDocs(docsFor(await editor('<p class="x">a</p>'), 'class'));
    expect(state()).toBe('standard less:false more:true');
    more.click();
    expect(state()).toBe('verbose less:true more:false');
  });

  it('sticky tooltips open at the level the last one was left at', async () => {
    const html = docsFor(await editor('<style>\n  .a { padding: 0; }\n</style>'), 'padding');
    showDocs(html, true).more.click();
    expect(showDocs(html, true).state()).toBe('verbose less:true more:false');
    expect(showDocs(html).state()).toBe('standard less:true more:true'); // hovers open at the chosen level
  });

  it('shows hints for the support status and link titles in its own label', async () => {
    const cm = await editor(TEMPLATE);
    window.SlateHelperPage.cm.showTooltip(`<section>${docsFor(cm, 'gap')}</section>`, { x: 0, top: 300, bottom: 316 });
    const status = document.querySelector('.slate-helper-tooltip [data-slate-helper-hint]');
    status.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const hint = document.querySelector('.slate-helper-tooltip-hint');
    expect(hint.textContent).toMatch(/^Widely available across major browsers/);
    expect(hint.style.display).toBe('block');
    status.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(hint.style.display).toBe('none');
  });

  it('respects the html and css options', async () => {
    const cm = await editor(TEMPLATE, { 'source-docs.html': false });
    expect(docsFor(cm, 'table')).toBeNull();
    expect(docsFor(cm, 'gap')).not.toBeNull();
  });
});
