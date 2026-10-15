// WYSIWYG link dialog:
//  - An "Open in new tab" button on the Link Info tab sets the target to
//    _blank without visiting the Target tab. It only sets; it never clears.
//  - Tab on the last field of the Link Info tab (normally URL) opens the
//    Target tab instead of moving to the Browse Server button.
(() => {
  const SHP = window.SlateHelperPage;

  const BUTTON_ID = 'slateHelperNewTab';
  const LABEL = 'Open in new tab';
  const LABEL_SET = '✓ Opens in new tab';
  const FIELDS = 'input:not([type="hidden"]), select, textarea';

  const targetSelect = (dialog) => dialog.getContentElement('target', 'linkTargetType');

  const updateLabel = (dialog) => {
    const isBlank = targetSelect(dialog)?.getValue() === '_blank';
    const label = dialog.getContentElement('info', BUTTON_ID)?.getElement().findOne('.cke_dialog_ui_button');
    label?.setText(isBlank ? LABEL_SET : LABEL);
  };

  const lastInfoField = (dialog) => {
    const page = dialog._.tabs.info?.[1]?.$;
    const fields = page ? [...page.querySelectorAll(FIELDS)].filter((el) => el.offsetParent) : [];
    return fields[fields.length - 1];
  };

  const extendDefinition = (def) => {
    const newTabButton = SHP.option('link-dialog', 'newTabButton');
    const tabToTarget = SHP.option('link-dialog', 'tabToTarget');

    if (newTabButton) def.getContents('info').add({
      type: 'button',
      id: BUTTON_ID,
      label: LABEL,
      onClick() {
        const dialog = this.getDialog();
        targetSelect(dialog).setValue('_blank');
        updateLabel(dialog);
      },
    });

    const { onLoad, onShow } = def;
    def.onLoad = function (...args) {
      onLoad?.apply(this, args);
      const dialog = this;
      if (newTabButton) targetSelect(dialog)?.on('change', () => updateLabel(dialog));
      // Capture phase, so this runs before CKEditor's own Tab handling.
      if (tabToTarget) dialog.parts.dialog.$.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || e.shiftKey || dialog._.currentTabId !== 'info') return;
        if (e.target !== lastInfoField(dialog)) return;
        e.preventDefault();
        e.stopPropagation();
        dialog.selectPage('target');
        targetSelect(dialog)?.focus();
      }, true);
    };
    def.onShow = function (...args) {
      onShow?.apply(this, args);
      if (newTabButton) updateLabel(this);
    };
  };

  SHP.registerFeature('link-dialog', () => {
    // CKEditor is loaded with the first editor, so hook in once one appears.
    let hooked = false;
    SHP.onAdded('.cke', () => {
      if (hooked || !window.CKEDITOR) return;
      hooked = true;
      window.CKEDITOR.on('dialogDefinition', (ev) => {
        if (ev.data.name === 'link') extendDefinition(ev.data.definition);
      });
    });
  });
})();
