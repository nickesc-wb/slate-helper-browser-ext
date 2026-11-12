import { describe, expect, it, vi } from 'vitest';
import { sleep } from './helpers/load.js';
import { press, provideFormatTools, setupEditor } from './helpers/codemirror.js';

// No CKEditor here, so this is the plain-CodeMirror path (Shift+Alt+F); Slate's
// own tidying (a round trip through CKEditor) needs a real Slate editor.
const PRETTIER = { 'source-format.prettier': true };

const formatted = async (value) => {
  const cm = setupEditor(['source-format'], value, PRETTIER);
  provideFormatTools();
  press(cm, 'Shift-Alt-F');
  await vi.waitFor(() => expect(cm.getValue()).not.toBe(value.replace('‸', '')));
  return cm;
};

describe('source-format', () => {
  it("doesn't use Prettier unless its option is on", async () => {
    const loads = [];
    const listener = (e) => loads.push(e.detail);
    document.addEventListener('slate-helper:load', listener);
    const cm = setupEditor(['source-format'], '<div><p>x</p></div>');
    press(cm, 'Shift-Alt-F');
    await sleep(10);
    document.removeEventListener('slate-helper:load', listener);
    expect(loads).toEqual([]);
    expect(cm.getValue()).toBe('<div><p>x</p></div>');
  });

  it('with Prettier, formats HTML, CSS and JavaScript and keeps every Liquid tag exactly as written', async () => {
    const cm = await formatted(
      '<style>.a{color:red}</style><div><p>Hi {{first-name}}</p>'
      + "{% if {{status}} == \"Admit\" %}<a href=\"/x?id={{id}}\">‸Go</a>{% else %}<span>No</span>{% endif %}</div>"
      + '<script>var a=1;if(a){go()}</script>',
    );
    expect(cm.getValue()).toBe([
      '<style>',
      '  .a {',
      '    color: red;',
      '  }',
      '</style>',
      '<div>',
      '  <p>Hi {{first-name}}</p>',
      '  {% if {{status}} == "Admit" %}',
      '    <a href="/x?id={{id}}">Go</a>',
      '  {% else %}',
      '    <span>No</span>',
      '  {% endif %}',
      '</div>',
      '<script>',
      '  var a = 1;',
      '  if (a) {',
      '    go();',
      '  }',
      '</script>',
      '',
    ].join('\n'));
    // Prettier tracks the cursor by node: it stays on its line, not always on its character.
    expect(cm.getLine(cm.getCursor().line)).toContain('>Go<');
  });

  it('with Prettier, is one undo step', async () => {
    const value = '<div><p>x</p></div>';
    const cm = await formatted(value);
    cm.undo();
    expect(cm.getValue()).toBe(value);
  });

  it('with Prettier, leaves the code as it was, and says why, when it would change the Liquid', async () => {
    // Prettier's Liquid parser closes the {% if %} itself.
    const value = '<p>{% if x %}</p>';
    const cm = setupEditor(['source-format'], value, PRETTIER);
    provideFormatTools();
    press(cm, 'Shift-Alt-F');
    await vi.waitFor(() => expect(cm.getWrapperElement().querySelector('.slate-helper-format-notice')).not.toBeNull());
    expect(cm.getValue()).toBe(value);
  });
});
