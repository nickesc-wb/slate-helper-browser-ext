// Query builder "Insert Query Part" dialogs (exports, filters, ...): double-
// click an item to select it and press Continue in one go.
//
// Items are .search_part elements that toggle on each click, so the two clicks
// of a double-click select and then deselect the item. On dblclick we make sure
// the item ends up selected (keeping anything else already selected) and then
// press Continue.
(() => {
  const SH = globalThis.SlateHelper;

  const ITEM = '.query_search_form .search_part';

  const continueButton = (form) =>
    [...(form.closest('.dialog') || form).querySelectorAll('.action button')]
      .find((b) => /querySearchCommit/.test(b.getAttribute('onclick') || '') || b.textContent.trim() === 'Continue');

  SH.registerFeature({
    id: 'dblclick-picker',
    name: 'Double-click to pick',
    description: 'In the query builder, double-click an export or filter to select it and continue.',
    defaultEnabled: true,
    areas: ['admin'],
    init() {
      document.addEventListener('dblclick', (e) => {
        const item = e.target.closest?.(ITEM);
        if (!item) return;
        const button = continueButton(item.closest('form'));
        if (!button) return SH.log('dblclick-picker: no Continue button found');
        if (!item.classList.contains('selected')) item.click();
        SH.log('dblclick-picker: continuing with', item.getAttribute('title'));
        button.click();
      }, true);
    },
  });
})();
