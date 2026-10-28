import { describe, expect, it } from 'vitest';
import { provideSourceTools, setupEditor, show } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

const editor = (value, options) => setupEditor(['source-autocomplete'], value, options);

const hints = (cm) => window.SlateHelperPage.autocompleteHint(cm);
const labels = (cm) => hints(cm)?.list.map((c) => (typeof c === 'string' ? c : c.displayText)) ?? [];

/** Accept the suggestion labelled label, as show-hint would. */
const accept = (cm, label) => {
  const data = hints(cm);
  const c = data.list.find((x) => (typeof x === 'string' ? x : x.displayText) === label);
  if (!c) throw new Error(`No suggestion "${label}" in ${labels(cm).join(', ')}`);
  if (typeof c === 'string') cm.replaceRange(c, data.from, data.to, 'complete');
  else c.hint(cm, data, c);
};

describe('source-autocomplete: HTML', () => {
  it('suggests tag names after <', () => {
    const cm = editor('<di‸');
    expect(labels(cm)).toContain('div');
  });

  it('adds the closing tag when a tag is accepted', () => {
    const cm = editor('<di‸');
    accept(cm, 'div');
    expect(show(cm)).toBe('<div>‸</div>');
  });

  it('self-closes void tags', () => {
    const cm = editor('<im‸');
    accept(cm, 'img');
    expect(cm.getValue()).toBe('<img />');
  });

  it('adds the type attribute to <style>', () => {
    const cm = editor('<sty‸');
    accept(cm, 'style type="text/css"');
    expect(show(cm)).toBe('<style type="text/css">‸</style>');
  });

  it('suggests attribute snippets inside a tag and places the cursor', () => {
    const cm = editor('<a ‸>');
    expect(labels(cm)).toEqual(['href=""', 'target="_blank"']);
    accept(cm, 'href=""');
    expect(show(cm)).toBe('<a href="‸">');
  });

  it('skips attributes the tag already has', () => {
    const cm = editor('<a href="x" ‸>');
    expect(labels(cm)).toEqual(['target="_blank"']);
  });

  it('offers style="" on any tag once you start typing', () => {
    expect(labels(editor('<div ‸>'))).toEqual([]);
    expect(labels(editor('<div st‸>'))).toEqual(['style=""']);
  });

  it('respects the tags option', () => {
    const cm = editor('<di‸', { 'source-autocomplete.tags': false });
    expect(hints(cm)).toBeNull();
  });
});

describe('source-autocomplete: Liquid', () => {
  it('suggests keywords after {%', () => {
    const cm = editor('{% e‸ %}');
    expect(labels(cm)).toEqual(expect.arrayContaining(['else', 'elsif', 'endif']));
  });

  it('ranks the end tag for the innermost open block first', () => {
    const cm = editor('{% for x in y %}{% if x %}{% en‸ %}');
    expect(labels(cm)[0]).toBe('endif');
  });

  it('adds the end tag when a block keyword is accepted', () => {
    const cm = editor('{% i‸%}');
    accept(cm, 'if');
    expect(show(cm)).toBe('{% if ‸ %}{% endif %}');
  });

  it('does not add end tags when that option is off', () => {
    const cm = editor('{% i‸%}', { 'source-autocomplete.liquidEndTags': false });
    accept(cm, 'if');
    expect(cm.getValue()).toBe('{% if  %}');
  });

  it('suggests filters after |', () => {
    const cm = editor('{{ name | up‸ }}');
    expect(labels(cm)).toEqual(['upcase']);
  });

  it('suggests variables used elsewhere, one segment at a time', () => {
    const used = '{{ person.first }} {{ person.last | upcase }} {% for e in events %}{% endfor %}\n';
    expect(labels(editor(`${used}{{ ‸`))).toEqual(['e', 'events', 'person']);
    expect(labels(editor(`${used}{{ person.‸`))).toEqual(['first', 'last']);
  });
});

describe('source-autocomplete: CSS', () => {
  it('suggests media query blocks after @ in <style>', () => {
    const cm = editor('<style>\n  @‸\n</style>');
    expect(labels(cm)).toEqual(['@media (min-width: 768px)', '@media (max-width: 767.98px)']);
    accept(cm, '@media (min-width: 768px)');
    expect(show(cm)).toBe('<style>\n  @media (min-width: 768px) {\n    ‸\n  }\n</style>');
  });

  // Property and value suggestions come from VS Code's CSS service.
  const cssEditor = async (value, options) => {
    const cm = editor(value, options);
    provideSourceTools();
    await sleep(0);
    return cm;
  };

  it('suggests properties as you type, with docs', async () => {
    const cm = await cssEditor('<style>\n  .a { backg‸ }\n</style>');
    expect(labels(cm)).toContain('background-color');
    expect(hints(cm).list.find((c) => c.displayText === 'background-color').docs.value).toContain('MDN Reference');
  });

  it('accepting a property adds the colon and semicolon and puts the cursor between', async () => {
    const cm = await cssEditor('<style>\n  .a { backg‸ }\n</style>');
    accept(cm, 'background-color');
    expect(show(cm)).toBe('<style>\n  .a { background-color: ‸; }\n</style>');
  });

  it('suggests values right after the colon', async () => {
    const cm = await cssEditor('<style>\n  .a { display: ‸ }\n</style>');
    expect(labels(cm)).toEqual(expect.arrayContaining(['block', 'flex', 'none']));
    accept(cm, 'flex');
    expect(show(cm)).toBe('<style>\n  .a { display: flex‸ }\n</style>');
  });

  it('does not open on whitespace alone, or for a finished word', async () => {
    expect(labels(await cssEditor('<style>\n  .a { color: red; ‸ }\n</style>'))).toEqual([]);
    expect(labels(await cssEditor('<style>\n  .a { display: block‸ }\n</style>'))).not.toContain('block');
  });

  it('works around Liquid in the same rule', async () => {
    const cm = await cssEditor('<style>\n  .a { color: {{ c }}; backg‸ }\n</style>');
    expect(labels(cm)).toContain('background-color');
  });

  // The docs beside the list, as show-hint shows them when an item is highlighted.
  const docsShownFor = (cm, label) => {
    const data = hints(cm);
    const list = document.createElement('ul');
    const item = list.appendChild(document.createElement('li'));
    document.body.appendChild(list);
    window.CodeMirror.signal(data, 'select', data.list.find((c) => c.displayText === label), item);
    return document.querySelector('.slate-helper-tooltip').innerHTML;
  };

  it('shows docs beside the list, compact or verbose as the Hover docs options say', async () => {
    expect(docsShownFor(await cssEditor('<style>\n  .a { backg‸ }\n</style>'), 'background-color'))
      .toContain('slate-helper-tooltip-compact');
    const verbose = await cssEditor('<style>\n  .a { backg‸ }\n</style>', { 'source-docs.compact': false });
    expect(docsShownFor(verbose, 'background-color')).not.toContain('slate-helper-tooltip-compact');
  });

  it('respects the cssProperties option', async () => {
    const cm = await cssEditor('<style>\n  .a { backg‸ }\n</style>', { 'source-autocomplete.cssProperties': false });
    expect(labels(cm)).toEqual([]);
  });
});
