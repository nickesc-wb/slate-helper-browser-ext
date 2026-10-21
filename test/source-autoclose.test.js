import { describe, expect, it } from 'vitest';
import { press, setupEditor, show, type } from './helpers/codemirror.js';

const editor = (value, options) => setupEditor(['source-autoclose'], value, options);

describe('source-autoclose', () => {
  it('closes brackets and puts the cursor between', () => {
    const cm = editor('x = ‸');
    type(cm, '(');
    expect(show(cm)).toBe('x = (‸)');
  });

  it('does not close before a word', () => {
    const cm = editor('‸word');
    type(cm, '(');
    expect(show(cm)).toBe('(‸word');
  });

  it('types over a closing character that is already there', () => {
    const cm = editor('‸');
    type(cm, '[x]');
    expect(show(cm)).toBe('[x]‸');
  });

  it('wraps a selection', () => {
    const cm = editor('‸abc‸');
    type(cm, '(');
    expect(show(cm)).toBe('(‸abc‸)');
  });

  it('backspace on an empty pair deletes both', () => {
    const cm = editor('{‸}');
    press(cm, 'Backspace');
    expect(show(cm)).toBe('‸');
  });

  it('turns {‸ into a Liquid tag when % is typed', () => {
    const cm = editor('‸');
    type(cm, '{%');
    expect(show(cm)).toBe('{%‸%}');
    press(cm, 'Backspace');
    expect(show(cm)).toBe('{‸}');
  });

  it('closes quotes inside a tag', () => {
    const cm = editor('<a href=‸>');
    type(cm, '"');
    expect(show(cm)).toBe('<a href="‸">');
  });

  it('leaves apostrophes in body copy alone', () => {
    const cm = editor('<p>don‸</p>');
    type(cm, "'");
    expect(show(cm)).toBe("<p>don'‸</p>");
    const cm2 = editor('<p>Say ‸</p>');
    type(cm2, '"');
    expect(show(cm2)).toBe('<p>Say "‸</p>');
  });

  it('closes quotes inside Liquid', () => {
    const cm = editor('{{ x | default: ‸ }}');
    type(cm, "'");
    expect(show(cm)).toBe("{{ x | default: '‸' }}");
  });

  it('respects the brackets and quotes options', () => {
    const cm = editor('<a href=‸>', { 'source-autoclose.brackets': false, 'source-autoclose.quotes': false });
    type(cm, '("');
    expect(show(cm)).toBe('<a href=("‸>');
  });
});
