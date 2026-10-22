// Source view: underline Liquid block tags that don't pair up: an {% if %}
// with no {% endif %}, an {% endfor %} with nothing to close, or an
// {% else %} / {% when %} outside the block it belongs to. Hovering an
// underline says what's wrong. Nothing stops a save; it's only a hint.
(() => {
  const SHP = window.SlateHelperPage;
  const MARK_CLASS = 'slate-helper-liquid-error';

  const BLOCKS = ['if', 'unless', 'case', 'for', 'capture', 'comment', 'raw', 'tablerow'];
  // Tags allowed only directly inside certain blocks.
  const BRANCHES = {
    elsif: ['if', 'unless'],
    else: ['if', 'unless', 'case', 'for'],
    when: ['case'],
  };
  // Blocks whose content isn't parsed as Liquid.
  const VERBATIM = ['comment', 'raw'];

  const TAG = /\{%-?\s*(\w+)[\s\S]*?-?%\}/g;
  const tagText = (name) => `{% ${name} %}`;

  /**
   * Problems in a template's Liquid block structure, as
   * [{ from, to, message }] with from/to as string offsets.
   */
  const check = (text) => {
    const problems = [];
    const stack = []; // { name, from, to }
    TAG.lastIndex = 0;
    let m;
    while ((m = TAG.exec(text))) {
      const name = m[1];
      const tag = { name, from: m.index, to: m.index + m[0].length };
      const top = stack.at(-1);

      if (top && VERBATIM.includes(top.name)) {
        // Inside {% raw %} / {% comment %} only its own end tag counts.
        if (name === `end${top.name}`) stack.pop();
        continue;
      }

      if (BLOCKS.includes(name)) {
        stack.push(tag);
      } else if (BRANCHES[name]) {
        if (!top || !BRANCHES[name].includes(top.name)) {
          const where = BRANCHES[name].map(tagText).join(' or ');
          problems.push({ ...tag, message: `${tagText(name)} outside ${where}` });
        }
      } else if (name.startsWith('end') && BLOCKS.includes(name.slice(3))) {
        const opener = name.slice(3);
        const i = stack.findLastIndex((t) => t.name === opener);
        if (i === -1) {
          problems.push({ ...tag, message: `${tagText(name)} with no ${tagText(opener)} to close` });
          continue;
        }
        // Anything opened after the matching tag was never closed.
        for (const open of stack.splice(i)) {
          if (open.name !== opener) {
            problems.push({ ...open, message: `${tagText(open.name)} is not closed before ${tagText(name)}` });
          }
        }
      }
    }
    for (const open of stack) {
      problems.push({ ...open, message: `${tagText(open.name)} has no ${tagText(`end${open.name}`)}` });
    }
    return problems.sort((a, b) => a.from - b.from);
  };

  SHP.liquidCheck = check;

  const update = (cm) => {
    cm.operation(() => {
      (cm.state.slateHelperLiquidMarks || []).forEach((mark) => mark.clear());
      cm.state.slateHelperLiquidMarks = check(cm.getValue()).map((p) =>
        cm.markText(cm.posFromIndex(p.from), cm.posFromIndex(p.to), {
          className: MARK_CLASS,
          attributes: { title: p.message },
        }));
    });
  };

  SHP.registerFeature('source-liquid-check', () => {
    SHP.injectStyle('source-liquid-check', `
      .CodeMirror .${MARK_CLASS} {
        text-decoration: underline wavy #d93025;
        text-decoration-skip-ink: none;
        text-underline-offset: 3px;
      }
    `);

    SHP.onCodeMirror((cm) => {
      let timer = null;
      cm.on('changes', () => {
        clearTimeout(timer);
        timer = setTimeout(() => update(cm), 300);
      });
      update(cm);
    });
  });
})();
