import { describe, expect, it } from 'vitest';
import { setValue, setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

const LINE = 'slate-helper-element-line';
const MARK = 'slate-helper-element-mark';

const shadedLines = (cm) => {
  const out = [];
  cm.eachLine((h) => { if (h.bgClass?.includes(LINE)) out.push(cm.getLineNumber(h)); });
  return out;
};
const markedText = (cm) => cm.getAllMarks().filter((m) => m.className === MARK).map((m) => {
  const { from, to } = m.find();
  return cm.getRange(from, to);
});

const moveTo = async (cm, value) => {
  setValue(cm, value);
  await sleep(50); // the feature updates on a short timer
};

describe('source-element-highlight', () => {
  it('marks just the text of a single-line element', () => {
    const cm = setupEditor(['source-element-highlight'], '<div>\n  <p>x‸</p>\n</div>\n<hr>');
    expect(markedText(cm)).toEqual(['<p>x</p>']);
    expect(shadedLines(cm)).toEqual([]);
  });

  it('shades lines for the enclosing multi-line element', async () => {
    const cm = setupEditor(['source-element-highlight'], '');
    await moveTo(cm, '<div>\n  ‸text\n</div>\n<hr>');
    expect(shadedLines(cm)).toEqual([0, 1, 2]);
    expect(markedText(cm)).toEqual([]);
  });

  it('right after a closing tag highlights the element just closed', async () => {
    const cm = setupEditor(['source-element-highlight'], '');
    await moveTo(cm, '<div><span>a</span>‸</div>');
    expect(markedText(cm)).toEqual(['<span>a</span>']);
  });

  describe('inside <style>', () => {
    const css = (body) => `<style>\n${body}\n</style>`;

    it('marks a single-line rule instead of the style element', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, css('.a { color: red; }\n.b { color: ‸blue; }'));
      expect(markedText(cm)).toEqual(['.b { color: blue; }']);
      expect(shadedLines(cm)).toEqual([]);
    });

    it('shades only the innermost nested rule', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      const body = '@media (max-width: 768px) {\n  .a {\n    color: red;\n    &:hover {\n      color: ‸blue;\n    }\n  }\n}';
      await moveTo(cm, css(body));
      expect(shadedLines(cm)).toEqual([4, 5, 6]);
    });

    it('shades the outer rule when the cursor is between its nested rules', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, css('@media print {\n  .a { color: red; }\n  ‸\n  .b { color: blue; }\n}'));
      expect(shadedLines(cm)).toEqual([1, 2, 3, 4, 5]);
      expect(markedText(cm)).toEqual([]);
    });

    it('includes the selector and counts right after "}" as in the rule', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, css('.a { color: red; }\n.b,\n.c {\n  color: blue;\n}‸'));
      expect(shadedLines(cm)).toEqual([2, 3, 4, 5]);
    });

    it('ignores braces in comments, strings and Liquid', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, css('/* } */ .a { content: "}"; color: {{ c }}; {% if x %}top: 0;{% endif %} ‸}'));
      expect(markedText(cm)).toEqual(['.a { content: "}"; color: {{ c }}; {% if x %}top: 0;{% endif %} }']);
    });

    it('marks the rule when the cursor is inside a Liquid tag in it', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, css('.a { color: {{ bra‸nd }}; }'));
      expect(markedText(cm)).toEqual(['.a { color: {{ brand }}; }']);
    });

    it('leaves Liquid outside <style> to the element highlight', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, `${css('.a { color: red; }')}\n<p>{{ fir‸st }}</p>`);
      expect(markedText(cm)).toEqual(['<p>{{ first }}</p>']);
    });

    it('falls back to the style element between rules', async () => {
      const cm = setupEditor(['source-element-highlight'], '');
      await moveTo(cm, css('.a { color: red; }\n‸\n.b { color: blue; }'));
      expect(shadedLines(cm)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  it('clears the highlight when text is selected', async () => {
    const cm = setupEditor(['source-element-highlight'], '<p>‸x</p>');
    await moveTo(cm, '<p>‸x‸</p>');
    expect(markedText(cm)).toEqual([]);
  });
});
