import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

// The record header as Slate writes it: status, then the number as a bare text node.
const setup = () => {
  document.body.innerHTML = `
    <h1>Test, Student</h1>
    <div style="position: absolute; right: 0; top: 0;">
      <span class="subheading"><span style="margin-right: 10px;"><span id="person_status"> Prospect</span><span id="person_status_edit" class="hidden"><select><option>Prospect</option></select></span></span> 934045071</span>
    </div>`;
};

const start = async () => {
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/features/record-copy-number.js');
  globalThis.SlateHelper.features.find((f) => f.id === 'record-copy-number').init({});
  await sleep(0);
};

const number = () => document.querySelector('.slate-helper-copy');

describe('click to copy record number', () => {
  let writeText;
  beforeEach(async () => {
    writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await start();
  });

  it('wraps the number without changing the header text', () => {
    expect(number().textContent).toBe('934045071');
    expect(document.querySelector('.subheading').textContent).toMatch(/Prospect\s+934045071$/);
  });

  it('copies the number on click, confirms it, and resets the hint after', async () => {
    const before = number().dataset.hint;
    number().click();
    await sleep(0);
    expect(writeText).toHaveBeenCalledWith('934045071');
    expect(number().dataset.hint).not.toBe(before);

    number().dispatchEvent(new MouseEvent('mouseleave'));
    await sleep(250);
    expect(number().dataset.hint).toBe(before);
  });

  it('copies with Enter for keyboard users', async () => {
    number().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(0);
    expect(writeText).toHaveBeenCalledWith('934045071');
  });
});
