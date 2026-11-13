# Slate Helper

A browser extension that improves Technolutions Slate's admin UI. It works on any client's Slate instance, in Chrome, Brave and Edge.

## Install

### Windows

1. Open PowerShell and run:

   ```powershell
   irm https://raw.githubusercontent.com/nickesc-wb/slate-helper-browser-ext/main/updater/get.ps1 | iex
   ```

   This installs Slate Helper to `%USERPROFILE%\Slate Helper`, sets up one-click updates and automatically copies the folder path to your clipboard.
2. In your browser, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and paste the path that was copied by the install script.

To install somewhere else, set `$env:SLATE_HELPER_DIR` before step 1.

### By hand

1. Download `slate-helper-<version>.zip` from [Releases](https://github.com/nickesc-wb/slate-helper-browser-ext/releases).
2. Unzip it to a folder you'll keep.
3. Go to `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and pick the folder.

## Update

When a new release is out, Slate pages show a notice in the bottom-right corner.

- **Installed with the PowerShell command:** click **Update now** in the notice.
- **Installed by hand on Windows:** double-click `updater\install.cmd` in the extension folder once. The notice then has **Update now**.
- **Git clone:** run `git pull`.

If you move the folder, run `install.cmd` again. To remove the updater, run `updater\install.cmd -Uninstall`.

## Use

- Click the toolbar icon to switch features and their options on or off. Reload the Slate page to apply changes.
- A green dot on the icon means Slate Helper is active on the current page.
- If it misreads a site, set **This site** in the popup to **On** or **Off**. **Auto** goes back to detecting.

Every feature starts on. Your settings sync with your browser profile.

## Features

### Dialogs

| Feature | What it does |
|---|---|
| Dialog size | Keeps dialogs inside the window, opens editor dialogs at 85% of the window height, and lets you resize from any edge or corner |
| Keep editor open after Save | In a block's editor (like a portal's Static Content), Save and Ctrl+S save without closing it. A **Save & Close** button keeps the old behavior. Settings dialogs, like a portal's or form's Edit Details, still close on Save |
| Link dialog shortcuts | Adds an "Open in new tab" button. Tab from the URL field opens the Target tab |
| Impersonate on pick | Picking a record in an Impersonate dialog impersonates it |
| Recent impersonations | Lists every record you've impersonated on this Slate site under the Record box, newest first, in a scrolling list. Click one to pick it, or × to remove it |
| Double-click to pick query parts | In the query builder's Insert Query Part dialogs, double-click an export or filter to select it and continue |
| Delete registrations in one step | Adds **Delete** to a registered form response's popup, so you don't have to cancel it, switch tabs and reopen it |

### Editing

In an editor's source view.

| Feature | What it does |
|---|---|
| Find & replace | The Find and Replace toolbar buttons work in source view. Ctrl+F finds, Ctrl+H replaces |
| Format button | Tidies the HTML from the toolbar or with Shift+Alt+F, without saving or closing. Option: format with Prettier instead (the button then reads Prettier), which also lays out Liquid blocks, CSS and JavaScript (for working in the source view only; Slate re-formats the next time the editor opens), with your own Prettier settings as JSON in the box below it, and optionally every time the source view opens |
| Highlight current element | Shades the element around the cursor, or the CSS rule inside `<style>`. Also shades the Liquid statement around the cursor (`{% if %}` to `{% endif %}`, or one `{{ }}` tag) light blue |
| Color Liquid syntax | Colors the parts of `{{ }}` and `{% %}` tags (tag names, variables, filters, strings…) in shades of blue |
| Hover docs | Hover an HTML tag or attribute, a CSS property or value, or a JavaScript name for its MDN docs (for JavaScript, also its signature or type). Arrows in the box show more or less detail |
| Indentation | Tab inserts 2 spaces, Backspace removes an indent level, Enter between tags splits and indents, and pastes re-indent |
| Auto-close pairs | Typing `( [ { " '` adds the closing character. Quotes only close in tags, `<style>`, `<script>` and Liquid |
| Autocomplete | Suggests HTML tags, attribute snippets, comments and entities (`&nbsp;`, `&mdash;`, …), Liquid keywords, filters and variables, CSS properties and values with their docs, CSS snippets (`@media`, `@font-face`, `!important`), JavaScript snippets (`() => {}`, ready handlers, `console.log`), and JavaScript names with their docs: your own variables, the DOM, jQuery and built-ins, members after `.`, and event names in `addEventListener('…')` |
| Triple-click selects element text | Selects an element's text without its tags, or an attribute's value without its quotes |
| Lint | Underlines HTML tags that don't pair up, CSS errors and unknown properties, and JavaScript errors. Hover for details |
| Check Liquid tags | Underlines `{% if %}`, `{% for %}` and other block tags with no end tag, and end tags with nothing to close |

### Utilities

| Feature | What it does |
|---|---|
| Insert between blocks | In the portal editor, hover the space between two blocks, or above the first or below the last, for a **+** button. Click it and pick a block to add it right there. Also widens the gap between blocks a little |
| Click to copy record number | On a record, click the record number at the top right to copy it. A hint below it says when it's copied |
| Impersonate from portal pages | Adds the portal's **Impersonate** button to its view, method and query pages, so you can preview without going back to the portal. On Anonymous/Guest portals, which have no one to impersonate, it just opens the portal |
| Instance badge | A corner badge with the client's hostname and Slate area. Click it to hide it |
| Client favicon in header | Shows the client's favicon left of the Slate logo |

### Extension

| Feature | What it does |
|---|---|
| Update notice | Shows a notice when a new release is out |

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md).
