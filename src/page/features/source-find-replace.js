// Find & replace in source view. CodeMirror already has search built in
// (Ctrl+F find, Shift+Ctrl+F replace, Shift+Ctrl+R replace all), but CKEditor
// greys out its Find/Replace toolbar buttons in source view. This:
//  - enables those buttons in source view and routes them to CodeMirror
//  - adds Ctrl+H for replace
//  - keeps Esc in the search bar from also closing the Slate dialog
(() => {
  const SHP = window.SlateHelperPage;
  const COMMANDS = { find: 'find', replace: 'replace' };

  SHP.registerFeature('source-find-replace', () => {
    SHP.onCKEditor((editor) => {
      for (const name of Object.keys(COMMANDS)) {
        const command = editor.getCommand(name);
        if (command) command.modes = { ...command.modes, source: 1 };
      }
      editor.on('beforeCommandExec', (ev) => {
        const cmCommand = COMMANDS[ev.data.name];
        if (editor.mode !== 'source' || !cmCommand) return;
        const cm = editor.container.$.querySelector('.CodeMirror')?.CodeMirror;
        if (!cm) return;
        ev.cancel();
        // After the toolbar click finishes: CKEditor refocuses its button,
        // and CodeMirror's search bar closes as soon as it loses focus.
        setTimeout(() => {
          cm.focus();
          cm.execCommand(cmCommand);
        }, 0);
      });
    });

    SHP.onCodeMirror((cm) => {
      cm.addKeyMap({ name: 'slate-helper-find', 'Ctrl-H': 'replace' });
      // CodeMirror's search bar closes itself on Esc; stop the key there so
      // Slate doesn't close the whole dialog too.
      cm.getWrapperElement().addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.target.closest?.('.CodeMirror-dialog')) e.stopPropagation();
      });
    });
  });
})();
