import { describe, expect, it } from 'vitest';
import { setValue, setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

const MARK = 'slate-helper-liquid-error';

// The underlined text and its hover message, in document order.
const underlines = (cm) => cm.getAllMarks()
  .filter((m) => m.className === MARK)
  .map((m) => {
    const { from, to } = m.find();
    return [cm.getRange(from, to), m.attributes.title];
  })
  .sort((a, b) => cm.getValue().indexOf(a[0]) - cm.getValue().indexOf(b[0]));

const check = (value) => underlines(setupEditor(['source-liquid-check'], value));

describe('source-liquid-check', () => {
  it('leaves balanced blocks alone', () => {
    expect(check(`
      {% if a %}x{% elsif b %}y{% else %}z{% endif %}
      {% for i in list %}{{ i }}{% else %}none{% endfor %}
      {% case c %}{% when 1 %}one{% else %}other{% endcase %}
      {%- unless d -%}{% capture e %}f{% endcapture %}{%- endunless -%}
      {% assign g = 1 %}{% include 'x' %}
    `)).toEqual([]);
  });

  it('underlines a block with no end tag', () => {
    expect(check('<p>{% if a %}x</p>')).toEqual([['{% if a %}', '{% if %} has no {% endif %}']]);
  });

  it('underlines an end tag with nothing to close', () => {
    expect(check('x{% endfor %}')).toEqual([['{% endfor %}', '{% endfor %} with no {% for %} to close']]);
  });

  it('underlines a block left open inside another', () => {
    expect(check('{% for i in l %}{% if i %}x{% endfor %}')).toEqual([
      ['{% if i %}', '{% if %} is not closed before {% endfor %}'],
    ]);
  });

  it('underlines branch tags outside their block', () => {
    expect(check('{% else %}{% for i in l %}{% when 1 %}{% endfor %}')).toEqual([
      ['{% else %}', '{% else %} outside {% if %} or {% unless %} or {% case %} or {% for %}'],
      ['{% when 1 %}', '{% when %} outside {% case %}'],
    ]);
  });

  it('ignores tags inside raw and comment blocks', () => {
    expect(check('{% raw %}{% if %}{% endraw %}{% comment %}{% endfor %}{% endcomment %}')).toEqual([]);
  });

  it('handles tags split across lines', () => {
    expect(check('{% if a\n   and b %}\nx\n{% endif %}')).toEqual([]);
  });

  it('updates after edits', async () => {
    const cm = setupEditor(['source-liquid-check'], '{% if a %}x');
    expect(underlines(cm)).toHaveLength(1);
    setValue(cm, '{% if a %}x{% endif %}');
    await sleep(350); // the check runs on a short timer
    expect(underlines(cm)).toEqual([]);
  });
});
