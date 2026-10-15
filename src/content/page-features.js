// Popup/settings metadata for features that run in the page's MAIN world
// (src/page/features/). Their code registers separately via
// SlateHelperPage.registerFeature(id, init); main.js passes the enabled ids
// and options over.
(() => {
  const SH = globalThis.SlateHelper;
  const page = (meta) => SH.registerFeature({ areas: ['admin'], defaultEnabled: true, ...meta, world: 'page' });
  const opt = (id, name, defaultEnabled = true) => ({ id, name, defaultEnabled });

  page({
    id: 'editor-dialog-size',
    group: 'Dialogs',
    name: 'Dialog size',
    description: 'Better sizing for Slate dialogs.',
    options: [
      opt('fit', 'Keep dialogs inside the window'),
      opt('taller', 'Open editor dialogs taller (85% of the window)'),
      opt('resize', 'Resize dialogs by dragging an edge or corner'),
    ],
  });

  page({
    id: 'editor-keep-open',
    group: 'Dialogs',
    name: 'Keep editor open after Save',
    description: 'Save in a WYSIWYG editor dialog saves without closing it. Adds a Save & Close button for the old behavior.',
  });

  page({
    id: 'link-dialog',
    group: 'Dialogs',
    name: 'Link dialog shortcuts',
    description: 'Shortcuts in the WYSIWYG link dialog.',
    options: [
      opt('newTabButton', '"Open in new tab" button'),
      opt('tabToTarget', 'Tab from the URL field opens the Target tab'),
    ],
  });

  page({
    id: 'source-indent',
    group: 'Source view',
    name: 'Indentation',
    description: 'How Tab, Backspace, Enter and paste handle indentation.',
    options: [
      opt('tab', 'Tab inserts 2 spaces (Shift+Tab outdents)'),
      opt('backspace', 'Backspace removes a whole indent level'),
      opt('enter', 'Enter between tags splits and indents'),
      opt('paste', 'Re-indent pasted code'),
      opt('splitOnType', 'Split block tags onto 3 lines as you type them (Slate default)', false),
    ],
  });

  page({
    id: 'source-autoclose',
    group: 'Source view',
    name: 'Auto-close pairs',
    description: 'Typing an opening character adds the closing one.',
    options: [
      opt('brackets', 'Brackets ( [ {'),
      opt('quotes', 'Quotes " \' (only inside tags, <style>, <script> and Liquid)'),
    ],
  });

  page({
    id: 'source-autocomplete',
    group: 'Source view',
    name: 'Autocomplete',
    description: 'Suggestions as you type. Tab or Enter accepts, Esc closes.',
    options: [
      opt('tags', 'HTML tag names (adds the closing tag)'),
      opt('snippets', 'Attribute snippets'),
      opt('liquidKeywords', 'Liquid keywords and filters'),
      opt('liquidEndTags', 'Add the end tag when accepting if, for, …'),
      opt('liquidVariables', 'Liquid variables used in this editor'),
      opt('cssSnippets', 'CSS snippets in <style> (@media min-width 768px)'),
    ],
  });

  page({
    id: 'source-find-replace',
    group: 'Source view',
    name: 'Find & replace',
    description: 'The Find/Replace toolbar buttons work in source view. Ctrl+F finds, Ctrl+H replaces.',
  });

  page({
    id: 'source-format',
    group: 'Source view',
    name: 'Format button',
    description: 'A Format button in the editor toolbar (and Shift+Alt+F) tidies the HTML the same way reopening the editor does, without saving or closing.',
  });

  page({
    id: 'source-element-highlight',
    group: 'Source view',
    name: 'Highlight current element',
    description: 'Shades the element the cursor is in, from its opening tag to its closing tag.',
  });
})();
