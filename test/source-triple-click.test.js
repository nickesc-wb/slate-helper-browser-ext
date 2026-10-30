import { describe, expect, it } from 'vitest';
import { setValue, setupEditor, show } from './helpers/codemirror.js';

// jsdom has no layout, so clicks can't be dispatched; instead ask the feature's
// configureMouse for the triple-click unit and select what it gives for the
// cursor position, as CodeMirror does on mousedown.
const tripleClick = (cm, value, event = {}) => {
  setValue(cm, value);
  const { unit } = cm.getOption('configureMouse')(cm, 'triple', event);
  if (typeof unit !== 'function') return unit;
  const range = unit(cm, cm.getCursor());
  cm.setSelection(range.from, range.to);
  return show(cm);
};

describe('source-triple-click', () => {
  const cm = setupEditor(['source-triple-click'], '');

  it('selects the text inside a one-line element, not its tags', () => {
    expect(tripleClick(cm, '<div>\n  <p>Some te‸xt here</p>\n</div>'))
      .toBe('<div>\n  <p>‸Some text here‸</p>\n</div>');
  });

  it('works with several elements on one line', () => {
    expect(tripleClick(cm, '<h2>Title</h2><p>Bo‸dy</p><p>More</p>'))
      .toBe('<h2>Title</h2><p>‸Body‸</p><p>More</p>');
  });

  it('counts the edges of the text as inside it', () => {
    expect(tripleClick(cm, '<p>‸Body</p>')).toBe('<p>‸Body‸</p>');
    expect(tripleClick(cm, '<p>Body‸</p>')).toBe('<p>‸Body‸</p>');
  });

  it('selects the text of the innermost element, inline ones included', () => {
    const html = '<p>Hello <strong>bold <a href="#">link</a></strong> there</p>';
    const at = (word) => html.replace(word, `${word[0]}‸${word.slice(1)}`);
    expect(tripleClick(cm, at('link'))).toBe('<p>Hello <strong>bold <a href="#">‸link‸</a></strong> there</p>');
    expect(tripleClick(cm, at('bold'))).toBe('<p>Hello <strong>‸bold <a href="#">link</a>‸</strong> there</p>');
    expect(tripleClick(cm, at('Hello'))).toBe('<p>‸Hello <strong>bold <a href="#">link</a></strong> there‸</p>');
  });

  it('leaves out whitespace around multi-line text', () => {
    expect(tripleClick(cm, '<p>\n  First line\n  sec‸ond line\n</p>'))
      .toBe('<p>\n  ‸First line\n  second line‸\n</p>');
  });

  it('includes Liquid in the text and ignores ">" inside it', () => {
    expect(tripleClick(cm, '<p>Hi {{ first‸ }}{% if a > b %}!{% endif %}</p>'))
      .toBe('<p>‸Hi {{ first }}{% if a > b %}!{% endif %}‸</p>');
  });

  it('skips void elements like <br>', () => {
    expect(tripleClick(cm, '<p>one<br>tw‸o</p>')).toBe('<p>‸one<br>two‸</p>');
  });

  describe('in a tag', () => {
    it('selects an attribute value without its quotes', () => {
      expect(tripleClick(cm, '<p style="color: r‸ed; margin: 0" class="x">Body</p>'))
        .toBe('<p style="‸color: red; margin: 0‸" class="x">Body</p>');
      expect(tripleClick(cm, "<p class='a b‸'>Body</p>")).toBe("<p class='‸a b‸'>Body</p>");
    });

    it('counts the quotes as part of the value', () => {
      expect(tripleClick(cm, '<p class=‸"x" id="y">')).toBe('<p class="‸x‸" id="y">');
      expect(tripleClick(cm, '<p class="x"‸ id="y">')).toBe('<p class="‸x‸" id="y">');
    });

    it('selects an unquoted value', () => {
      expect(tripleClick(cm, '<td colspan=2‸>x</td>')).toBe('<td colspan=‸2‸>x</td>');
    });

    it('handles ">" and "=" in values, Liquid and multi-line tags', () => {
      expect(tripleClick(cm, '<a title="a=b" href="{{ u‸rl }}">x</a>')).toBe('<a title="a=b" href="‸{{ url }}‸">x</a>');
      expect(tripleClick(cm, '<p {% if a > b %}class="w‸ide"{% endif %}>x</p>'))
        .toBe('<p {% if a > b %}class="‸wide‸"{% endif %}>x</p>');
      expect(tripleClick(cm, '<div\n  id="m"\n  style="col‸or: red"\n>')).toBe('<div\n  id="m"\n  style="‸color: red‸"\n>');
    });

    it('selects the line on the tag name, an attribute name or an empty value', () => {
      expect(tripleClick(cm, '<p cla‸ss="x">Body</p>\n<hr>')).toBe('‸<p class="x">Body</p>\n‸<hr>');
      expect(tripleClick(cm, '<d‸iv class="x">')).toBe('‸<div class="x">‸');
      expect(tripleClick(cm, '<p class="‸">')).toBe('‸<p class="">‸');
    });
  });

  it('selects the line between tags', () => {
    expect(tripleClick(cm, '<div>\n  <p>a</p>‸\n</div>')).toBe('<div>\n‸  <p>a</p>\n‸</div>');
  });

  it('selects the line in <style>', () => {
    expect(tripleClick(cm, '<style>\n.a { col‸or: red; }\n</style>')).toBe('<style>\n‸.a { color: red; }\n‸</style>');
  });

  it('selects the line for text with no element around it', () => {
    expect(tripleClick(cm, 'loose te‸xt')).toBe('‸loose text‸');
  });

  it('leaves Alt+triple-click (rectangle selection) and other clicks alone', () => {
    expect(tripleClick(cm, '<p>Bo‸dy</p>', { altKey: true })).toBeUndefined();
    expect(cm.getOption('configureMouse')(cm, 'double', {}).unit).toBeUndefined();
  });
});
