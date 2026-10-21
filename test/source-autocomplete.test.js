import { describe, expect, it } from 'vitest';
import { setupEditor, show } from './helpers/codemirror.js';

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
});
