import { describe, expect, it } from 'vitest';
import { CodeMirror, setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

describe('source-no-wrap', () => {
  it('turns off line wrapping in an editor that wraps', async () => {
    const cm = setupEditor(['source-no-wrap'], '<p>text</p>', {}, { lineWrapping: true });
    await sleep(40);
    expect(cm.getOption('lineWrapping')).toBe(false);
    expect(cm.getWrapperElement().classList.contains('CodeMirror-wrap')).toBe(false);
  });

  it('also catches editors added later, like a reopened source view', async () => {
    setupEditor(['source-no-wrap'], '');
    const later = CodeMirror(document.body, { mode: 'liquid', lineWrapping: true });
    await sleep(40);
    expect(later.getOption('lineWrapping')).toBe(false);
  });
});
