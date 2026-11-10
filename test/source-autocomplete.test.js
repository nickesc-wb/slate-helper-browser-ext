import { describe, expect, it } from 'vitest';
import { provideSourceTools, setupEditor, show } from './helpers/codemirror.js';
import { docsBox, docsLevels, docsParts, shownDocs } from './helpers/docs.js';
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
  else if (!c.hint) cm.replaceRange(c.text, data.from, data.to, 'complete');
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
    expect(labels(cm)).toEqual(expect.arrayContaining(['href=""', 'target="_blank"']));
    accept(cm, 'href=""');
    expect(show(cm)).toBe('<a href="‸">');
  });

  it('skips attributes the tag already has', () => {
    const cm = editor('<a href="x" ‸>');
    expect(labels(cm)).toContain('target="_blank"');
    expect(labels(cm).filter((l) => l.startsWith('href'))).toEqual([]);
    // Attributes without a value count too.
    expect(labels(editor('<iframe allowfullscreen ‸>'))).not.toContain('allowfullscreen');
  });

  it('still completes an attribute name typed in full', () => {
    expect(labels(editor('<div class‸>'))).toEqual(['class=""']);
  });

  it('offers class, id and style on any tag once you start typing', () => {
    expect(labels(editor('<div ‸>'))).toEqual([]);
    expect(labels(editor('<div c‸>'))).toEqual(['class=""']);
    expect(labels(editor('<div i‸>'))).toEqual(['id=""']);
    expect(labels(editor('<div st‸>'))).toEqual(['style=""']);
    expect(labels(editor('<div class="x" data-id="y" c‸>'))).toEqual([]);
    expect(labels(editor('<div data-id="y" i‸>'))).toEqual(['id=""']);
  });

  it('completes a comment after <!', () => {
    const cm = editor('<p></p><!‸');
    accept(cm, '<!--  -->');
    expect(show(cm)).toBe('<p></p><!-- ‸ -->');
  });

  it('suggests entities after & in text, but not inside a tag', () => {
    const cm = editor('<p>Fall &md‸</p>');
    expect(labels(cm)).toHaveLength(1);
    accept(cm, labels(cm)[0]);
    expect(show(cm)).toBe('<p>Fall &mdash;‸</p>');
    expect(labels(editor('<a href="?a=1&‸">'))).toEqual([]);
    expect(labels(editor('<p>&‸</p>', { 'source-autocomplete.entities': false }))).toEqual([]);
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
    expect(labels(cm)).toEqual(expect.arrayContaining(['@media (min-width: 768px)', '@media (max-width: 767.98px)']));
    accept(cm, '@media (min-width: 768px)');
    expect(show(cm)).toBe('<style>\n  @media (min-width: 768px) {\n    ‸\n  }\n</style>');
  });

  it('suggests !important after !, adding a space if needed', () => {
    const cm = editor('<style>\n  .a { color: red!im‸ }\n</style>');
    accept(cm, '!important');
    expect(show(cm)).toBe('<style>\n  .a { color: red !important‸ }\n</style>');
    const spaced = editor('<style>\n  .a { color: red !‸ }\n</style>');
    accept(spaced, '!important');
    expect(show(spaced)).toBe('<style>\n  .a { color: red !important‸ }\n</style>');
  });

  // Property and value suggestions come from VS Code's CSS service.
  const cssEditor = async (value, options) => {
    const cm = editor(value, options);
    provideSourceTools();
    await sleep(0);
    return cm;
  };

  it('suggests properties as you type', async () => {
    const cm = await cssEditor('<style>\n  .a { backg‸ }\n</style>');
    expect(labels(cm)).toContain('background-color');
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
    return document.querySelector('.slate-helper-tooltip section').innerHTML;
  };

  it('shows the property\'s docs beside the list, at the level the Hover docs options say', async () => {
    const shown = (html) => docsLevels(docsBox(html)).find((l) => l.shown).name;
    const html = docsShownFor(await cssEditor('<style>\n  .a { backg‸ }\n</style>'), 'background-color');
    expect(shown(html)).toBe('standard');
    const docs = docsParts(shownDocs(docsBox(html)));
    expect(docs.description).not.toBe('');
    expect(docs.mdnLinks.some((href) => href.endsWith('/background-color'))).toBe(true);

    const compact = await cssEditor('<style>\n  .a { backg‸ }\n</style>', { 'source-docs.view': 'compact' });
    expect(shown(docsShownFor(compact, 'background-color'))).toBe('compact');
  });

  it('respects the cssProperties option', async () => {
    const cm = await cssEditor('<style>\n  .a { backg‸ }\n</style>', { 'source-autocomplete.cssProperties': false });
    expect(labels(cm)).toEqual([]);
  });
});

describe('source-autocomplete: JavaScript', () => {
  it('suggests snippets in <script> once two letters of a key are typed', () => {
    expect(labels(editor('<script>\n  f‸\n</script>'))).toEqual([]);
    const cm = editor("<script>\n  $('a').on('click', fn‸);\n</script>");
    expect(labels(cm)).toEqual(['() => {}']);
    accept(cm, '() => {}');
    expect(show(cm)).toBe("<script>\n  $('a').on('click', () => {\n    ‸\n  });\n</script>");
  });

  it('places the cursor inside a one-line snippet', () => {
    const cm = editor('<script>\n  lo‸\n</script>');
    accept(cm, 'console.log()');
    expect(show(cm)).toBe('<script>\n  console.log(‸);\n</script>');
  });

  it('does not suggest HTML tags or JS snippets after a dot', () => {
    expect(labels(editor('<script>\n  if (i <di‸\n</script>'))).toEqual([]);
    expect(labels(editor('<script>\n  x.fn‸\n</script>'))).toEqual([]);
  });

  it('respects the jsSnippets option', () => {
    expect(labels(editor('<script>\n  fn‸\n</script>', { 'source-autocomplete.jsSnippets': false }))).toEqual([]);
  });
});
