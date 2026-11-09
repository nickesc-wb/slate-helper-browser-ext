// Portal editor: insert a block between two others. Hovering the gap between
// two blocks (or above the first or below the last) shows a line with a "+";
// clicking it opens a copy of the editor's block palette, and picking a block
// adds it there.
//
// Slate's palette already adds a block on click: its handler appends a
// placeholder to the first .part_rows_container and opens the new block's
// editor dialog, which finds the placeholder by id. We click the real palette
// item and move that placeholder into the chosen gap. When the block is saved,
// Slate renders it in place of the placeholder and saves the part order from
// the page (save_part_order), so the new position sticks.
//
// Nothing here is tied to one layout: every .part_rows_container (one per
// column) gets gaps, so two-column and other layouts work the same way.
(() => {
  const SH = globalThis.SlateHelper;

  const GAP = 24; // px between blocks, and above the first / below the last (Slate: 15 between)
  const REACH = 6; // the hover zone also reaches this far into the blocks around a gap
  const CONTAINER = '.part_rows_container';
  const PALETTE_ITEM = '.toolbox_container > .toolbox_element[data-clickable="1"]';

  const visible = (rect) => rect.width > 0 && rect.height > 0;

  // The blocks in a container, without jQuery UI's drag helper and placeholder.
  const blocks = (container) =>
    [...container.children].filter((el) =>
      !el.matches('.ui-sortable-helper, .ui-sortable-placeholder') && visible(el.getBoundingClientRect()));

  // Every place a block can go: { container, before (null = at the end), top,
  // bottom, line, left, right }, in viewport px.
  const zones = () => {
    const out = [];
    for (const container of document.querySelectorAll(CONTAINER)) {
      if (container.closest('.dialog')) continue;
      const c = container.getBoundingClientRect();
      if (!visible(c)) continue;
      const zone = (before, top, bottom, line) => out.push({ container, before, top, bottom, line, left: c.left, right: c.right });
      const items = blocks(container);
      if (!items.length) {
        zone(null, c.top, c.bottom, (c.top + c.bottom) / 2);
        continue;
      }
      let above = c.top; // bottom of the block above, or the container's top
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        zone(el, i ? above - REACH : above, r.top + REACH, (above + r.top) / 2);
        above = r.bottom;
      });
      zone(null, above - REACH, c.bottom, (above + c.bottom) / 2);
    }
    return out;
  };

  const sameZone = (a, b) => a && b && a.container === b.container && a.before === b.before;

  const paletteItems = () =>
    [...document.querySelectorAll(PALETTE_ITEM)].filter((el) => !el.closest('.dialog, .slate-helper-insert-menu'));

  // Adds the palette item's block where the zone is: Slate's own click adds it
  // at the end of the first column, and we move it from there.
  const insert = (item, zone) => {
    const before = new Set(document.querySelectorAll(`${CONTAINER} > *`));
    item.click();
    const added = [...document.querySelectorAll(`${CONTAINER} > *`)].find((el) => !before.has(el));
    if (!added) {
      SH.log('portal-insert-block: no new block after clicking', item.dataset.type);
      return;
    }
    const next = zone.before?.parentElement === zone.container ? zone.before : null;
    zone.container.insertBefore(added, next);
    SH.log('portal-insert-block: added', item.dataset.type, 'before', next?.id || '(end)');
  };

  SH.registerFeature({
    id: 'portal-insert-block',
    group: 'Portal editor',
    name: 'Insert between blocks',
    description: 'Hover the space between two blocks (or above the first or below the last) for a + button. Click it to pick a block from the palette and add it right there. Also widens the gap between blocks a little.',
    defaultEnabled: true,
    areas: ['admin'],
    init() {
      SH.injectStyle('portal-insert-block', `
        html ${CONTAINER} { padding: ${GAP}px 0; }
        html ${CONTAINER} > div.part + div.part { margin-top: ${GAP}px; }
        /* The whole bar (the gap's height) is clickable. Hidden stays laid out
           so it can fade in. */
        .slate-helper-insert { --slate-helper-insert-color: #d0d0d0; position: fixed; z-index: 1000; display: flex; align-items: center; gap: 6px; height: ${GAP}px; margin-top: -${GAP / 2}px; cursor: pointer; opacity: 1; transition: opacity 0.15s ease-out; }
        .slate-helper-insert[hidden] { display: flex; visibility: hidden; opacity: 0; pointer-events: none; transition: none; }
        .slate-helper-insert:hover,
        .slate-helper-insert:has(> [aria-expanded="true"]) { --slate-helper-insert-color: #80a8da; }
        .slate-helper-insert::before, .slate-helper-insert::after { content: ''; flex: 1; height: 2px; background: var(--slate-helper-insert-color); transition: background-color 0.15s; }
        /* all: unset keeps Slate's button styles out. The + is two bars drawn
           with gradients rather than a text glyph, which fonts don't center:
           even sizes (18 box, 10 x 2 bars) keep them on whole pixels. */
        .slate-helper-insert button.slate-helper-insert-add { all: unset; box-sizing: border-box; flex: none; width: 18px; height: 18px; background: linear-gradient(#fff, #fff) center / 10px 2px no-repeat, linear-gradient(#fff, #fff) center / 2px 10px no-repeat, var(--slate-helper-insert-color); cursor: pointer; transition: background-color 0.15s; }
        .slate-helper-insert button.slate-helper-insert-add:focus-visible { outline: 2px solid #2a6ebb; outline-offset: 2px; }
        .slate-helper-insert-menu { position: fixed; z-index: 1001; padding: 8px; background: #fff; border: 1px solid #ccc; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); }
        .slate-helper-insert-menu[hidden] { display: none; }
        .slate-helper-insert-menu div.toolbox_container { position: static; }
        .slate-helper-insert-menu div.toolbox_element { cursor: pointer; white-space: nowrap; text-overflow: ellipsis; }
        .slate-helper-insert-menu div.toolbox_element:focus-visible { outline: 1px solid #2a6ebb; }
      `);

      const bar = document.createElement('div');
      bar.className = 'slate-helper-insert';
      bar.hidden = true;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'slate-helper-insert-add';
      add.setAttribute('aria-label', 'Insert a block here');
      add.setAttribute('aria-expanded', 'false');
      bar.append(add);

      const menu = document.createElement('div');
      menu.className = 'slate-helper-insert-menu';
      menu.hidden = true;
      menu.setAttribute('role', 'menu');
      const palette = document.createElement('div');
      palette.className = 'toolbox_container'; // Slate's palette grid and icons
      menu.append(palette);
      document.body.append(bar, menu);

      let zone = null; // where the bar is, while shown
      let mouse = null; // last pointer position, to re-check zones on scroll

      // Where the menu opened, relative to the bar so it follows it on scroll.
      let anchor = null;

      // The menu's top-left corner goes just southeast of the click, flipping to
      // the other side of it when it would run off the window.
      const placeMenu = () => {
        const b = bar.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        const x = b.left + anchor.x;
        const y = b.top + anchor.y;
        const OFFSET = 4;
        const MARGIN = 8;
        let left = x + OFFSET;
        if (left + m.width > window.innerWidth - MARGIN) left = Math.max(MARGIN, x - OFFSET - m.width);
        let top = y + OFFSET;
        if (top + m.height > window.innerHeight - MARGIN) top = Math.max(MARGIN, y - OFFSET - m.height);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
      };

      // Moves the bar to the zone's current geometry (the page may have scrolled
      // or changed); hides it when the zone is gone.
      const place = () => {
        const z = zone && zones().find((candidate) => sameZone(candidate, zone));
        if (!z) return hide();
        zone = z;
        // Whole pixels, so the lines and the + stay sharp; an even width keeps
        // the centered + on a whole pixel too.
        bar.style.left = `${Math.round(z.left)}px`;
        bar.style.width = `${Math.round((z.right - z.left) / 2) * 2}px`;
        bar.style.top = `${Math.round(z.line)}px`;
        bar.hidden = false;
        if (!menu.hidden) placeMenu();
      };

      const show = (z) => {
        if (!z) return hide();
        if (!sameZone(z, zone)) closeMenu();
        zone = z;
        place();
      };

      const hide = () => {
        closeMenu();
        zone = null;
        bar.hidden = true;
      };

      const closeMenu = () => {
        if (menu.hidden) return;
        menu.hidden = true;
        add.setAttribute('aria-expanded', 'false');
      };

      const choose = (item) => {
        const target = zone;
        hide();
        if (target) insert(item, target);
      };

      const openMenu = (e) => {
        const items = paletteItems();
        if (!items.length) return;
        const b = bar.getBoundingClientRect();
        // A keyboard click (Enter/Space on the +) has no pointer position.
        const fromPointer = e.detail > 0;
        const a = add.getBoundingClientRect();
        anchor = fromPointer
          ? { x: e.clientX - b.left, y: e.clientY - b.top }
          : { x: a.left + a.width / 2 - b.left, y: a.bottom - b.top };
        palette.replaceChildren(...items.map((item) => {
          const el = item.cloneNode(true);
          el.removeAttribute('id');
          el.classList.remove('ui-draggable', 'ui-draggable-handle', 'ui-draggable-dragging');
          el.setAttribute('role', 'menuitem');
          el.tabIndex = 0;
          el.title = item.textContent.trim();
          el.addEventListener('click', () => choose(item));
          el.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            choose(item);
          });
          return el;
        }));
        menu.hidden = false;
        add.setAttribute('aria-expanded', 'true');
        placeMenu();
        palette.firstElementChild?.focus({ preventScroll: true });
      };

      // The button's own clicks (and Enter/Space on it) bubble here too.
      bar.addEventListener('click', (e) => (menu.hidden ? openMenu(e) : closeMenu()));

      const dragging = (e) => e.buttons || document.querySelector('.ui-sortable-helper, .ui-draggable-dragging');

      // The bar follows the pointer from zone to zone, but stays put while the
      // menu is open. Only the editor's own columns (and the bar) count, so a
      // dialog over the page hides it.
      const track = (e) => {
        mouse = { x: e.clientX, y: e.clientY };
        if (!menu.hidden) return;
        const target = e.target;
        const over = target instanceof Element && (bar.contains(target) || target.closest(CONTAINER));
        if (!over || dragging(e) || !paletteItems().length) return hide();
        show(zones().find((z) => mouse.y >= z.top && mouse.y <= z.bottom && mouse.x >= z.left && mouse.x <= z.right));
      };
      document.addEventListener('mousemove', track, { passive: true });
      document.documentElement.addEventListener('mouseleave', () => { if (menu.hidden) hide(); });

      window.addEventListener('scroll', () => {
        if (!zone) return;
        if (menu.hidden && mouse) {
          const z = zones().find((c) => mouse.y >= c.top && mouse.y <= c.bottom && mouse.x >= c.left && mouse.x <= c.right);
          return show(z);
        }
        place();
      }, { capture: true, passive: true });
      window.addEventListener('resize', () => zone && place());

      document.addEventListener('mousedown', (e) => {
        if (!menu.hidden && !menu.contains(e.target) && !bar.contains(e.target)) hide();
      }, true);
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || menu.hidden) return;
        e.stopPropagation();
        closeMenu();
        add.focus({ preventScroll: true });
      }, true);
    },
  });
})();
