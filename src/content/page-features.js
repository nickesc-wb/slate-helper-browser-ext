// Popup/settings metadata for features that run in the page's MAIN world
// (src/page/features/). Their code registers separately via
// SlateHelperPage.registerFeature(id, init); main.js passes the enabled ids over.
(() => {
  const SH = globalThis.SlateHelper;
  const page = (meta) => SH.registerFeature({ ...meta, world: 'page' });

  page({
    id: 'editor-dialog-size',
    name: 'Editor dialog size',
    description: 'Keeps dialogs inside the window, and opens the WYSIWYG editor dialog taller.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'editor-keep-open',
    name: 'Keep editor open after Save',
    description: 'Save in a WYSIWYG editor dialog saves without closing the dialog. Use Cancel or × to close.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'link-dialog',
    name: 'Link dialog shortcuts',
    description: 'Adds an "Open in new tab" button, and Tab from the URL field opens the Target tab.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'source-indent',
    name: 'Source view: indentation',
    description: 'Tab inserts 2 spaces, Backspace removes a whole indent level, Enter between tags splits and indents, and pasted code is re-indented.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'source-autoclose',
    name: 'Source view: auto-close pairs',
    description: 'Typing ( [ { " \' adds the closing character. Quotes only pair inside tags, <style>, <script> and Liquid.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'source-autocomplete',
    name: 'Source view: autocomplete',
    description: 'Suggests HTML tags, attribute snippets, and Liquid keywords, filters and variables as you type.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'source-find-replace',
    name: 'Source view: find & replace',
    description: 'The Find/Replace toolbar buttons work in source view. Ctrl+F finds, Ctrl+H replaces.',
    defaultEnabled: true,
    areas: ['admin'],
  });

  page({
    id: 'source-element-highlight',
    name: 'Source view: highlight current element',
    description: 'Shades the element the cursor is in, from its opening tag to its closing tag.',
    defaultEnabled: true,
    areas: ['admin'],
  });
})();
