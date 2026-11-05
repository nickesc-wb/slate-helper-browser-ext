import { describe, expect, it } from 'vitest';
import { setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

const tokenize = (text) => {
  setupEditor(['source-liquid-colors'], '');
  return window.SlateHelperPage.liquidTokens(text).map((t) => [text.slice(t.from, t.to), t.kind]);
};
// Just the tokens of one kind.
const ofKind = (text, kind) => tokenize(text).filter((t) => t[1] === kind).map((t) => t[0]);

describe('source-liquid-colors', () => {
  it('splits an output tag into variable, properties, filters and arguments', () => {
    expect(tokenize('<p>{{- student.first | default: "there" | upcase -}}</p>')).toEqual([
      ['{{-', 'delim'],
      ['student', 'variable'],
      ['.', 'operator'],
      ['first', 'property'],
      ['|', 'operator'],
      ['default', 'filter'],
      [':', 'operator'],
      ['"there"', 'string'],
      ['|', 'operator'],
      ['upcase', 'filter'],
      ['-}}', 'delim'],
    ]);
  });

  it('names the tag and classifies operators and literals', () => {
    expect(tokenize('{% if a.b == 3 and c contains "x" or d != nil %}')).toEqual([
      ['{%', 'delim'],
      ['if', 'tag'],
      ['a', 'variable'], ['.', 'operator'], ['b', 'property'],
      ['==', 'operator'], ['3', 'literal'],
      ['and', 'operator'], ['c', 'variable'], ['contains', 'operator'], ['"x"', 'string'],
      ['or', 'operator'], ['d', 'variable'], ['!=', 'operator'], ['nil', 'literal'],
      ['%}', 'delim'],
    ]);
  });

  it('treats {{ }} nested in a {% %} tag as delimiters', () => {
    expect(tokenize('{% if {{admit}} == "y" %}').slice(1, 6)).toEqual([
      ['if', 'tag'], ['{{', 'delim'], ['admit', 'variable'], ['}}', 'delim'], ['==', 'operator'],
    ]);
  });

  it('colors named arguments like properties', () => {
    expect(ofKind('{% for x in list limit: 5 offset: 2 %}', 'property')).toEqual(['limit', 'offset']);
  });

  it('grays out comments and leaves raw content alone', () => {
    const text = '{% comment %}\n{{ not.code }}\n{% endcomment %}{% raw %}{{ x }}{% endraw %}{% # note %}';
    expect(ofKind(text, 'comment')).toEqual(['\n{{ not.code }}\n', '# note ']);
    expect(ofKind(text, 'variable')).toEqual([]);
    expect(ofKind(text, 'tag')).toEqual(['comment', 'endcomment', 'raw', 'endraw']);
  });

  it('treats each line of {% liquid %} as a tag', () => {
    const text = '{% liquid\n  assign a = 1\n  # why\n  echo a\n%}';
    expect(ofKind(text, 'tag')).toEqual(['liquid', 'assign', 'echo']);
    expect(ofKind(text, 'comment')).toEqual(['# why']);
  });

  it('adds the classes in the editor, including tags that span lines', async () => {
    const cm = setupEditor(['source-liquid-colors'], '{% if a\n  and b %}\n{{ c | upcase }}');
    await sleep(50);
    // The line's styles, overlays included. getTokenTypeAt brings them up to
    // date but drops overlay styles from what it returns.
    const styleAt = (line, ch) => {
      cm.getTokenTypeAt({ line, ch });
      const st = cm.getLineHandle(line).styles;
      for (let i = 1; i < st.length; i += 2) if (st[i] > ch) return st[i + 1] ?? '';
      return '';
    };
    expect(styleAt(0, 4)).toContain('slate-helper-liquid-tag'); // if
    expect(styleAt(1, 3)).toContain('slate-helper-liquid-operator'); // and
    expect(styleAt(1, 6)).toContain('slate-helper-liquid-variable'); // b
    expect(styleAt(2, 8)).toContain('slate-helper-liquid-filter'); // upcase

    cm.replaceRange('{% comment %}', { line: 0, ch: 0 });
    cm.replaceRange('{% endcomment %}', { line: 2, ch: 0 });
    // In a browser CodeMirror re-highlights the lines below an edit; jsdom
    // has no viewport for that, so start highlighting over.
    cm.setOption('mode', 'liquid');
    expect(styleAt(1, 6)).toContain('slate-helper-liquid-comment');
  });
});
