// The runtimes watch the DOM and rescan on a short timer. Clear the page and
// let any pending rescan run before Vitest tears jsdom down, or the timer
// fires with no document.
import { afterAll } from 'vitest';
import { sleep } from './load.js';

afterAll(async () => {
  document.body.innerHTML = '';
  await sleep(100);
});
