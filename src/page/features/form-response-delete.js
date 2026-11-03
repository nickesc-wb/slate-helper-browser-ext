// Delete a form registration straight from the Registered tab's popup.
//
// Slate only offers Delete once a registration is cancelled, so deleting one
// means Cancel Registration, switching to the Cancelled tab, reopening the
// popup and pressing Delete. Both buttons run the same thing,
// FW.Lazy.Commit(this.form, { 'cmd': 'delete' }), which posts the popup's form
// to /manage/form/response?id=…: the server cancels a registered response and
// deletes a cancelled one. The Delete button added next to Cancel Registration
// sends the first post with fetch (its response is only a script to close the
// popup, which we skip), then the second through FW.Lazy.Commit like Slate's
// own Delete, whose response closes the popup and removes the table row.
(() => {
  const SHP = window.SlateHelperPage;

  const COMMIT = /FW\.Lazy\.Commit\(this\.form,\s*\{\s*'?cmd'?\s*:\s*'(\w+)'\s*\}\)/;
  const command = (button) => (button.getAttribute('onclick') || '').match(COMMIT)?.[1];

  const isResponseForm = (form) => /\/manage\/form\/response\?/.test(form.getAttribute('action') || '');

  // A registered response's popup has Cancel Registration ('delete'); a
  // cancelled one's has Restore ('restore') next to Slate's own Delete.
  const cancelButton = (form) => {
    const buttons = [...form.querySelectorAll('.action button')];
    if (buttons.some((b) => command(b) === 'restore')) return null;
    return buttons.find((b) => command(b) === 'delete') || null;
  };

  // Posts the form the way FW.Lazy.Commit does (multipart, values as extra
  // fields) and checks for the response that closes the popup, which Slate
  // only sends when the command went through.
  const cancel = async (form) => {
    const body = new FormData(form);
    body.set('cmd', 'delete');
    const res = await fetch(form.getAttribute('action'), { method: 'POST', body, credentials: 'same-origin' });
    const text = await res.text();
    if (!res.ok || !/Dialog\.Unload/.test(text)) throw new Error(`cancel failed (${res.status})`);
  };

  const remove = async (form, button) => {
    if (!confirm('Are you sure you want to delete this form response? It will be cancelled and then deleted.')) return;
    const FW = window.FW;
    button.disabled = true;
    FW.Progress?.Load();
    try {
      await cancel(form);
    } catch (err) {
      console.error('[Slate Helper]', err);
      alert('The registration could not be cancelled, so it was not deleted.');
      button.disabled = false;
      return;
    } finally {
      FW.Progress?.Unload();
    }
    SHP.log('form-response-delete: cancelled, deleting');
    FW.Lazy.Commit(form, { cmd: 'delete' });
  };

  const addDelete = (form) => {
    const cancelRegistration = cancelButton(form);
    if (!cancelRegistration || form.querySelector('.slate-helper-response-delete')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slate-helper-response-delete';
    button.textContent = 'Delete';
    button.addEventListener('click', () => remove(form, button));
    cancelRegistration.after(' ', button); // Slate separates its buttons with a space
  };

  SHP.registerFeature('form-response-delete', () => {
    SHP.onAdded('form', addDelete, (form) => isResponseForm(form) && !!form.querySelector('.action button'));
  });
})();
