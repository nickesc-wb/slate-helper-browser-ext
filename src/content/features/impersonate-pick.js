// Impersonate dialogs (portals, forms, ...): picking a record from the Record
// lookup impersonates right away instead of waiting for the Impersonate button.
//
// Slate's lookup (Suggest) picks on mousedown or Enter in its dropdown, or on a
// link click in its "Continued..." dialog, and writes the record id into the
// dialog's hidden record input with jQuery, which fires no events. So we note
// the value before each of those events and, once Slate has handled it, press
// Impersonate if it changed to a record.
(() => {
  const SH = globalThis.SlateHelper;

  const impersonateButton = (dialog) =>
    [...dialog.querySelectorAll('.action button')].find((b) => b.textContent.trim() === 'Impersonate');

  // [dialog, record input, button] for each open Impersonate dialog.
  const dialogs = () =>
    [...document.querySelectorAll('.dialog')]
      .map((dialog) => [dialog, dialog.querySelector('input[name="record"]'), impersonateButton(dialog)])
      .filter(([, input, button]) => input && button);

  SH.registerFeature({
    id: 'impersonate-pick',
    group: 'Dialogs',
    name: 'Impersonate on pick',
    description: 'In an Impersonate dialog, picking a record impersonates it without pressing Impersonate.',
    defaultEnabled: true,
    areas: ['admin'],
    init() {
      const before = (e) => {
        const open = dialogs();
        if (!open.length) return;
        const values = new Map(open.map(([, input]) => [input, input.value]));
        setTimeout(() => {
          for (const [, input, button] of dialogs()) {
            if (!values.has(input) || !input.value || input.value === values.get(input)) continue;
            SH.log('impersonate-pick: impersonating after', e.type);
            button.click();
          }
        }, 0);
      };
      for (const type of ['mousedown', 'keydown', 'click']) document.addEventListener(type, before, true);
    },
  });
})();
