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

  it('clears the highlight when text is selected', async () => {
    const cm = setupEditor(['source-element-highlight'], '<p>‸x</p>');
    await moveTo(cm, '<p>‸x‸</p>');
    expect(markedText(cm)).toEqual([]);
  });
});
