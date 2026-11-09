import { beforeEach, describe, expect, it } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

// A Slate-like portal editor: one column with blocks A and B, and a palette
// whose click handler does what Slate's does: append a placeholder to the
// first column (the dialog would then open and find it by id).
const setup = () => {
  document.body.innerHTML = `
    <table class="fixed view"><tr><td>
      <div class="part_rows_container ui-sortable">
        <div class="part" id="div_a" data-id="a"></div>
        <div class="part" id="div_b" data-id="b"></div>
      </div>
    </td><td>
      <div class="toolbox_container" id="view_toolbox_container">
        <div class="toolbox_element ui-draggable-handle" data-type="html" data-clickable="1" role="button" tabindex="0">Static Content</div>
        <div class="toolbox_element ui-draggable-handle" data-type="form" data-clickable="1" role="button" tabindex="0">Form</div>
      </div>
    </td></tr></table>`;
  for (const item of document.querySelectorAll('.toolbox_element')) {
    item.addEventListener('click', () => {
      const div = document.createElement('div');
      div.id = `part_${item.dataset.type}`;
      div.dataset.type = item.dataset.type;
      document.querySelector('.part_rows_container').appendChild(div);
    });
  }
};

// jsdom has no layout: a 600px-wide column at y 100–400 with A at 124–224 and
// B at 248–348, so gaps are 100–124 (top), 224–248 (between), 348–400 (bottom).
const RECTS = { container: [100, 400], div_a: [124, 224], div_b: [248, 348] };
const layout = () => {
  const rect = (top, bottom) => ({ top, bottom, left: 0, right: 600, width: 600, height: bottom - top, x: 0, y: top });
  const zero = rect(0, 0);
  Element.prototype.getBoundingClientRect = function () {
    if (this.matches('.part_rows_container')) return rect(...RECTS.container);
    const r = RECTS[this.id];
    return r ? rect(...r) : { ...zero, width: 0 };
  };
};

const start = async () => {
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/features/portal-insert-block.js');
  globalThis.SlateHelper.features.find((f) => f.id === 'portal-insert-block').init({});
  await sleep(0);
};

const container = () => document.querySelector('.part_rows_container');
const bar = () => document.querySelector('.slate-helper-insert');
const menu = () => document.querySelector('.slate-helper-insert-menu');
const order = () => [...container().children].map((el) => el.id);

const hover = (target, y) =>
  target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: y }));

const insertAt = (y, type) => {
  hover(container(), y);
  bar().click(); // anywhere on the line, not just the +
  [...menu().querySelectorAll('.toolbox_element')].find((el) => el.dataset.type === type).click();
};

describe('insert between blocks', () => {
  beforeEach(async () => {
    setup();
    layout();
    await start();
  });

  it('shows the + only over a gap', () => {
    hover(container(), 236);
    expect(bar().hidden).toBe(false);
    hover(document.getElementById('div_a'), 170);
    expect(bar().hidden).toBe(true);
    hover(document.getElementById('div_a'), 220); // the zone reaches a little into the block
    expect(bar().hidden).toBe(false);
  });

  it('lists the palette and adds the picked block in the hovered gap', () => {
    hover(container(), 236);
    document.querySelector('.slate-helper-insert-add').click();
    expect(menu().hidden).toBe(false);
    expect([...menu().querySelectorAll('.toolbox_element')].map((el) => el.dataset.type)).toEqual(['html', 'form']);

    menu().querySelector('[data-type="form"]').click();
    expect(order()).toEqual(['div_a', 'part_form', 'div_b']);
    expect(menu().hidden).toBe(true);
  });

  it('adds above the first block and below the last', () => {
    insertAt(110, 'html');
    expect(order()).toEqual(['part_html', 'div_a', 'div_b']);
    insertAt(380, 'form');
    expect(order()).toEqual(['part_html', 'div_a', 'div_b', 'part_form']);
  });

  it('closes the menu on Escape without adding anything', () => {
    hover(container(), 236);
    document.querySelector('.slate-helper-insert-add').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu().hidden).toBe(true);
    expect(order()).toEqual(['div_a', 'div_b']);
  });
});
