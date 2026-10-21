import { describe, expect, it } from 'vitest';
import { press, setupEditor, show } from './helpers/codemirror.js';

const editor = (value, options) => setupEditor(['source-indent'], value, options);

describe('source-indent', () => {
  it('Tab inserts spaces up to the next 2-space stop', () => {
    const cm = editor('‸x');
    press(cm, 'Tab');
    expect(show(cm)).toBe('  ‸x');
    const cm2 = editor(' ‸x');
    press(cm2, 'Tab');
    expect(show(cm2)).toBe('  ‸x');
  });

  it('Tab with a selection indents the lines', () => {
    const cm = editor('‸a\nb‸');
    press(cm, 'Tab');
    expect(cm.getValue()).toBe('  a\n  b');
  });

  it('Backspace in leading spaces removes a whole level', () => {
    const cm = editor('    ‸x');
    press(cm, 'Backspace');
    expect(show(cm)).toBe('  ‸x');
    const cm2 = editor('   ‸x');
    press(cm2, 'Backspace');
    expect(show(cm2)).toBe('  ‸x');
  });

  it('Backspace after text deletes one character', () => {
    const cm = editor('ab  ‸');
    press(cm, 'Backspace');
    expect(show(cm)).toBe('ab ‸');
  });

  it('Enter between a tag pair splits and indents', () => {
    const cm = editor('  <div class="a">‸</div>');
    press(cm, 'Enter');
    expect(show(cm)).toBe('  <div class="a">\n    ‸\n  </div>');
  });

  it('Enter between a Liquid block and its end tag splits and indents', () => {
    const cm = editor('{% if x %}‸{% endif %}');
    press(cm, 'Enter');
    expect(show(cm)).toBe('{% if x %}\n  ‸\n{% endif %}');
  });

  it('Enter between CSS braces splits and indents', () => {
    const cm = editor('<style>.a {‸}</style>');
    press(cm, 'Enter');
    expect(show(cm)).toBe('<style>.a {\n  ‸\n}</style>');
  });

  it('Enter between mismatched tags is left to CodeMirror', () => {
    const cm = editor('<div>‸</span>');
    press(cm, 'Enter');
    expect(cm.getValue().split('\n')).toHaveLength(2);
  });

  it('re-indents pasted lines to the cursor', () => {
    const cm = editor('    ‸');
    cm.replaceSelection('<ul>\n      <li>a</li>\n    </ul>', null, 'paste');
    expect(cm.getValue()).toBe('    <ul>\n      <li>a</li>\n    </ul>');
  });

  it('options switch keys off', () => {
    const cm = editor('‸x', { 'source-indent.tab': false });
    expect(cm.state.keyMaps.some((m) => m.Tab)).toBe(false);
  });

  it('stops Slate splitting block tags as you type, unless asked to', () => {
    const slate = { autoCloseTags: { whenClosing: true, indentTags: ['div', 'p'] } };
    const cm = setupEditor(['source-indent'], '', {}, slate);
    expect(cm.getOption('autoCloseTags')).toEqual({ whenClosing: true, indentTags: [] });

    const kept = setupEditor(['source-indent'], '', { 'source-indent.splitOnType': true }, slate);
    expect(kept.getOption('autoCloseTags').indentTags).toEqual(['div', 'p']);
  });
});
