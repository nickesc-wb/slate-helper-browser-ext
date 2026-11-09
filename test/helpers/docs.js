// Reading a docs box (SHP.cm.docsHtml, as hover docs and the suggestion list
// show it) by what it contains, so tests don't depend on MDN's wording or the
// exact markup.

/** The docs HTML as an element. */
export const docsBox = (html) => {
  const box = document.createElement('section');
  box.innerHTML = html ?? '';
  return box;
};

/** The levels of a box with more than one: [{ name, shown, el }]. */
export const docsLevels = (box) =>
  [...box.querySelectorAll(':scope > .slate-helper-docs-level')].map((el) => ({ name: el.dataset.level, shown: !el.hidden, el }));

/** The part of the box you see: its shown level, or the box itself when it has one level. */
export const shownDocs = (box) => docsLevels(box).find((l) => l.shown)?.el ?? box;

const MDN = /^https:\/\/developer\.mozilla\.org\//;

/** What an element of a docs box shows. */
export const docsParts = (el) => {
  const paragraphs = [...el.querySelectorAll('p')];
  const links = [...el.querySelectorAll('a')];
  return {
    // Description text: paragraphs and lists other than the syntax and meta lines.
    description: [...el.querySelectorAll('p, li')]
      .filter((p) => !p.matches('.slate-helper-docs-meta') && !p.querySelector('.slate-helper-docs-label'))
      .map((p) => p.textContent).join(' ').trim(),
    // The support status: an icon with its full wording as a hint.
    support: !!el.querySelector('.slate-helper-docs-meta [data-slate-helper-hint] img'),
    syntax: paragraphs.find((p) => p.querySelector('.slate-helper-docs-label'))?.querySelector('code')?.textContent ?? null,
    meta: !!el.querySelector('.slate-helper-docs-meta'),
    mdnLinks: links.filter((a) => MDN.test(a.href)).map((a) => a.href),
    links,
  };
};
