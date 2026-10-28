import { describe, expect, it } from 'vitest';
import { provideSourceTools, setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

const editor = async (value, options) => {
  const cm = setupEditor(['source-lint'], value, options);
  provideSourceTools();
  await sleep(0);
  return cm;
};

/** Problems as "Source severity [underlined text]: message". */
const problems = (cm) => {
  const text = cm.getValue();
  return window.SlateHelperPage.lint(cm).map((p) => `${p.source} ${p.severity} [${text.slice(p.from, p.to)}]: ${p.message}`);
};

const underlined = (cm) => cm.getAllMarks()
  .filter((m) => /slate-helper-lint-/.test(m.className))
  .map((m) => `${m.className.replace('slate-helper-lint-', '')}: ${cm.getRange(m.find().from, m.find().to)}`);

describe('source-lint', () => {
  it('finds HTML tags that do not pair up and empty src', async () => {
    const cm = await editor('<div>\n  <p>x\n</div>\n<img src="">');
    expect(problems(cm)).toEqual([
      expect.stringMatching(/^HTML error \[<p>\]: Tag must be paired, missing: \[ <\/p> \]/),
      'HTML error [src=""]: The attribute [ src ] of the tag [ img ] must have a value.',
    ]);
  });

  it('checks CSS in <style> the way VS Code does', async () => {
    const cm = await editor('<style>\n  .a { colr: red; }\n  .b {}\n</style>');
    expect(problems(cm)).toEqual([
      "CSS warning [colr]: Unknown property: 'colr'",
      'CSS warning [.b]: Do not use empty rulesets',
    ]);
  });

  it('accepts nested CSS', async () => {
    const cm = await editor('<style>\n  .a { color: red; &:hover { color: blue; } }\n</style>');
    expect(problems(cm)).toEqual([]);
  });

  it('finds JavaScript syntax errors and warnings in <script>', async () => {
    const cm = await editor('<script>\n  var a = 1\n  if (a) { foo( }\n</script>');
    expect(problems(cm)).toEqual([
      'JavaScript warning [1]: Missing semicolon.',
      "JavaScript error [}]: Expected an identifier and instead saw '}'.",
      "JavaScript error [}]: Expected ')' and instead saw ''.",
    ]);
  });

  it('skips scripts that are not JavaScript', async () => {
    const cm = await editor('<script type="text/x-template">\n  <div>{ not js\n</script>');
    expect(problems(cm)).toEqual([]);
  });

  it('ignores Liquid and problems it causes', async () => {
    const cm = await editor([
      '<a href="{{ url }}">{{ name | upcase }}</a>',
      '<style>\n  .a { color: {{ c }}; {% if x %}margin: 0;{% endif %} }\n</style>',
      '<script>\n  var n = {{ count }}\n  {% if x %}go();{% endif %}\n</script>',
    ].join('\n'));
    expect(problems(cm)).toEqual([]);
  });

  it('underlines problems in the editor, and says what is wrong on hover', async () => {
    const cm = await editor('<style>\n  .a { colr: red; }\n</style>\n<script>\n  foo(\n</script>');
    expect(underlined(cm)).toEqual(['warning: colr', 'error: (']);
    const hover = cm.state.slateHelperHover[0](cm, cm.posFromIndex(cm.getValue().indexOf('colr') + 1));
    expect(hover).toBe('<p><b class="slate-helper-lint-warning-label">CSS</b> Unknown property: \'colr\'</p>');
  });

  it('respects the html, css and js options', async () => {
    const cm = await editor('<p>x</div>\n<style>\n  .b {}\n</style>\n<script>\n  foo(\n</script>',
      { 'source-lint.html': false, 'source-lint.js': false });
    expect(problems(cm)).toEqual(['CSS warning [.b]: Do not use empty rulesets']);
  });
});
