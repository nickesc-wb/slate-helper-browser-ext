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

  it('is compact by default: first sentence, short support status, MDN link and a chevron', async () => {
    const html = docsFor(await editor('<style>\n  .a { display: grid; }\n</style>'), 'display');
    const [, compact, full, chevron] = html.match(
      /^<div class="slate-helper-tooltip-compact">(.*?)<\/div><div class="slate-helper-tooltip-full">(.*)<\/div>(<button.*<\/button>)$/);
    expect(compact).toMatch(/^<p>In combination with 'float' and 'position', determines the type of box[^<]*\.<\/p><p class/);
    expect(compact).toMatch(/<span data-slate-helper-hint="Widely available across major browsers \(Baseline since \d+\)"><img [^>]+>Widely available<\/span>/);
    expect(compact).toMatch(/>MDN Reference<\/a><\/p>$/);
    expect(full).toContain('<span class="slate-helper-docs-label">Syntax</span>');
    expect(chevron).toMatch(/^<button type="button" class="slate-helper-tooltip-more" aria-label="Show more" aria-expanded="false"><svg/);
  });

  it('has no chevron when the compact view already shows everything', async () => {
    const html = docsFor(await editor(TEMPLATE), 'table');
    expect(html).not.toContain('slate-helper-tooltip-more');
    expect(html).toMatch(/^<p>The table element represents data/);
  });

  it('can open verbose instead', async () => {
    const html = docsFor(await editor(TEMPLATE, { 'source-docs.compact': false }), 'gap');
    expect(html).not.toContain('slate-helper-tooltip-compact');
    expect(html).toMatch(/^<p>The gap CSS property.*Baseline icon.*Syntax.*MDN Reference/);
  });

  it('hides the parts turned off', async () => {
    const cm = await editor(TEMPLATE, {
      'source-docs.compact': false, 'source-docs.support': false, 'source-docs.syntax': false, 'source-docs.links': false,
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

  it('the chevron expands the compact view, and collapses it again', async () => {
    const cm = await editor(TEMPLATE);
    window.SlateHelperPage.cm.showTooltip(`<section>${docsFor(cm, 'gap')}</section>`, { x: 0, top: 300, bottom: 316 });
    const section = document.querySelector('.slate-helper-tooltip section');
    const chevron = section.querySelector('.slate-helper-tooltip-more');
    chevron.click();
    expect(section.classList.contains('slate-helper-expanded')).toBe(true);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    chevron.click();
    expect(section.classList.contains('slate-helper-expanded')).toBe(false);
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
  });

  it('sticky tooltips open expanded when the last one was left expanded', async () => {
    const cm = await editor(TEMPLATE);
    const { showTooltip } = window.SlateHelperPage.cm;
    const html = `<section>${docsFor(cm, 'gap')}</section>`;
    const expanded = () => document.querySelector('.slate-helper-tooltip section').classList.contains('slate-helper-expanded');
    showTooltip(html, { x: 0, top: 300, bottom: 316 }, 'right', { sticky: true });
    document.querySelector('.slate-helper-tooltip-more').click();
    showTooltip(html, { x: 0, top: 300, bottom: 316 }, 'right', { sticky: true });
    expect(expanded()).toBe(true);
    showTooltip(html, { x: 0, top: 300, bottom: 316 }); // hovers always open compact
    expect(expanded()).toBe(false);
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
