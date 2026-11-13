// Popup/settings metadata for features that run in the page's MAIN world
// (src/page/features/). Their code registers separately via
// SlateHelperPage.registerFeature(id, init); main.js passes the enabled ids
// and options over.
(() => {
  const SH = globalThis.SlateHelper;
  const page = (meta) => SH.registerFeature({ areas: ['admin'], defaultEnabled: true, ...meta, world: 'page' });
  // extra.note: a smaller line under the option's name in the popup (a caveat).
  // extra.requires: the id of another checkbox option it only applies with
  // (greyed out while that one is off).
  const opt = (id, name, defaultEnabled = true, extra = {}) => ({ id, name, defaultEnabled, ...extra });
  const choice = (id, name, choices, defaultValue) => ({
    id, name, defaultValue, choices: choices.map(([value, label]) => ({ value, label })),
  });
  // A text box (its value is a string, '' when empty). requires: the id of a
  // checkbox option it only applies with. json: the value must be a JSON
  // object whose keys are in json.keys, each 'number' (a positive whole
  // number), 'boolean' or a list of allowed strings; json.warn flags allowed
  // values that need a caveat: [{ key, value, message }].
  const text = (id, name, extra) => ({ id, name, text: true, defaultValue: '', ...extra });

  // The Prettier options Format lets you set: the ones that change layout.
  // parser and plugins are always Format's own.
  const PRETTIER_CONFIG = {
    keys: {
      printWidth: 'number',
      tabWidth: 'number',
      useTabs: 'boolean',
      semi: 'boolean',
      singleQuote: 'boolean',
      quoteProps: ['as-needed', 'consistent', 'preserve'],
      trailingComma: ['all', 'es5', 'none'],
      bracketSpacing: 'boolean',
      objectWrap: ['preserve', 'collapse'],
      bracketSameLine: 'boolean',
      arrowParens: ['always', 'avoid'],
      singleAttributePerLine: 'boolean',
      htmlWhitespaceSensitivity: ['css', 'strict', 'ignore'],
      embeddedLanguageFormatting: ['auto', 'off'],
      // Shopify's Liquid plugin
      embeddedSingleQuote: 'boolean',
      singleLineLinkTags: 'boolean',
      captureWhitespaceSensitivity: ['strict', 'ignore'],
    },
    warn: [{
      key: 'htmlWhitespaceSensitivity',
      value: 'ignore',
      message: '"ignore" can add or remove spaces that show in the email or page, like "visit ." where a line breaks between a link and a period.',
    }],
  };

  page({
    id: 'editor-dialog-size',
    group: 'Dialogs',
    subgroup: 'Editors',
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
    subgroup: 'Editors',
    name: 'Keep editor open after Save',
    description: 'Save in a block\'s editor (like a portal\'s Static Content) saves without closing it. Adds a Save & Close button for the old behavior. Settings dialogs still close on Save.',
  });

  page({
    id: 'link-dialog',
    group: 'Dialogs',
    subgroup: 'Editors',
    name: 'Link dialog shortcuts',
    description: 'Shortcuts in the WYSIWYG link dialog.',
    options: [
      opt('newTabButton', '"Open in new tab" button'),
      opt('tabToTarget', 'Tab from the URL field opens the Target tab'),
    ],
  });

  page({
    id: 'form-response-delete',
    group: 'Dialogs',
    subgroup: 'Forms & queries',
    name: 'Delete registrations in one step',
    description: 'A Delete button in a registered form response\'s popup cancels and deletes it, without switching to the Cancelled tab and reopening it.',
  });

  page({
    id: 'source-indent',
    group: 'Editing',
    subgroup: 'Coding',
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
    group: 'Editing',
    subgroup: 'Coding',
    name: 'Auto-close pairs',
    description: 'Typing an opening character adds the closing one.',
    options: [
      opt('brackets', 'Brackets ( [ {'),
      opt('quotes', 'Quotes " \' (only inside tags, <style>, <script> and Liquid)'),
    ],
  });

  page({
    id: 'source-autocomplete',
    group: 'Editing',
    subgroup: 'Coding',
    name: 'Autocomplete',
    description: 'Suggestions as you type. Tab or Enter accepts, Esc closes.',
    options: [
      opt('tags', 'HTML tag names (adds the closing tag)'),
      opt('snippets', 'Attribute snippets'),
      opt('entities', 'HTML entities after & (&nbsp;, &mdash;, …)'),
      opt('liquidKeywords', 'Liquid keywords and filters'),
      opt('liquidEndTags', 'Add the end tag when accepting if, for, …'),
      opt('liquidVariables', 'Liquid variables used in this editor'),
      opt('cssProperties', 'CSS properties and values in <style>, with docs'),
      opt('cssSnippets', 'CSS snippets in <style> (@media queries, @font-face, !important)'),
      opt('jsSnippets', 'JavaScript snippets in <script> (arrow function, ready, console.log)'),
      opt('jsSuggestions', 'JavaScript in <script>: variables, DOM, jQuery and built-ins, with docs'),
    ],
  });

  page({
    id: 'source-find-replace',
    group: 'Editing',
    subgroup: 'Tools',
    name: 'Find & replace',
    description: 'The Find/Replace toolbar buttons work in source view. Ctrl+F finds, Ctrl+H replaces.',
  });

  page({
    id: 'source-format',
    group: 'Editing',
    subgroup: 'Tools',
    name: 'Format button',
    description: 'A Format button in the editor toolbar (and Shift+Alt+F) tidies the HTML the same way reopening the editor does, without saving or closing.',
    options: [
      opt(
        'prettier',
        'Format with Prettier instead: also lays out {% if %} / {% for %} blocks, <style> and <script>',
        false,
        { note: 'For working in the source view only. Slate re-formats the code its own way the next time the editor opens, so Prettier\'s layout isn\'t kept.' },
      ),
      opt('onOpen', 'Also format with Prettier every time the source view opens', false, {
        requires: 'prettier',
        note: 'Skipped if you start typing before it\'s done, and Ctrl+Z undoes it.',
      }),
      text('prettierConfig', 'Prettier config (JSON, like .prettierrc)', {
        requires: 'prettier',
        placeholder: '{ "printWidth": 100, "singleAttributePerLine": true }',
        maxLength: 2000,
        json: PRETTIER_CONFIG,
      }),
    ],
  });

  page({
    id: 'source-element-highlight',
    group: 'Editing',
    subgroup: 'Tools',
    name: 'Highlight current element',
    description: 'Shades the element the cursor is in, from its opening tag to its closing tag. Inside <style>, shades the innermost CSS rule instead. The Liquid statement the cursor is in ({% if %} through {% endif %}, or a single {{ }} / {% %} tag) is also shaded light blue.',
    options: [
      opt('liquid', 'Also shade the current Liquid statement light blue'),
    ],
  });

  page({
    id: 'source-liquid-colors',
    group: 'Editing',
    subgroup: 'Tools',
    name: 'Color Liquid syntax',
    description: 'Colors the parts of {{ }} and {% %} tags in shades of blue: tag names, variables, properties, filters, operators, strings, literals and comments.',
  });

  page({
    id: 'source-triple-click',
    group: 'Editing',
    subgroup: 'Coding',
    name: 'Triple-click selects element text',
    description: 'Triple-clicking text selects everything inside the element it\'s in (a paragraph, heading, <strong>, <a>…) but not that element\'s tags, even when they\'re on the same line. In a tag, triple-clicking an attribute\'s value selects the value without its quotes.',
  });

  page({
    id: 'source-lint',
    group: 'Editing',
    subgroup: 'Checks',
    name: 'Lint HTML, CSS and JavaScript',
    description: 'Underlines problems: HTML tags that don\'t pair up, CSS syntax errors and unknown properties, JavaScript syntax errors. Hover an underline for details. Liquid is skipped.',
    options: [
      opt('html', 'HTML (HTMLHint)'),
      opt('css', 'CSS in <style> (VS Code\'s checks)'),
      opt('js', 'JavaScript in <script> (JSHint)'),
    ],
  });

  page({
    id: 'source-docs',
    group: 'Editing',
    subgroup: 'Tools',
    name: 'Hover docs',
    description: 'Rest the mouse on an HTML tag or attribute, a CSS property or value, or a JavaScript name, to see its MDN description, browser support and a link to MDN.',
    options: [
      opt('html', 'HTML tags and attributes'),
      opt('css', 'CSS in <style>'),
      opt('js', 'JavaScript in <script> (its signature or type, and docs)'),
      choice('view', 'Detail (also beside the suggestion list)', [
        ['compact', 'Compact: first sentence'],
        ['standard', 'Standard: plus syntax'],
        ['verbose', 'Verbose: everything'],
      ], 'standard'),
      opt('description', 'Description'),
      opt('support', 'Browser support (Baseline)'),
      opt('syntax', 'Syntax (CSS value grammar, JavaScript signatures)'),
      opt('selector', 'CSS selector specificity'),
      opt('links', 'Links to MDN and other references'),
    ],
  });

  page({
    id: 'source-liquid-check',
    group: 'Editing',
    subgroup: 'Checks',
    name: 'Check Liquid tags',
    description: 'Underlines Liquid block tags that don\'t pair up, like an {% if %} with no {% endif %}. Hover an underline for details.',
  });
})();
