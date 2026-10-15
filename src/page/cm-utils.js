// Helpers shared by the source-view (CodeMirror) features.
//
// Slate's source view is CodeMirror 5 in a "liquid" mode: htmlmixed (HTML with
// embedded CSS/JS) plus a multiplexed inner mode for {{ }} and {% %}.
(() => {
  const SHP = window.SlateHelperPage;

  SHP.INDENT = '  ';

  const leadingWhitespace = (text) => text.match(/^[ \t]*/)[0];

  /**
   * What kind of text the cursor is in:
   *   'liquid' inside {{ }} or {% %}
   *   'tag'    inside HTML tag markup (<a href="...">)
   *   'css' / 'javascript' inside <style> / <script>
   *   'text'   body copy
   */
  const context = (cm, pos) => {
    const state = cm.getTokenAt(pos, true).state;
    if (state?.innerActive) return 'liquid';
    const inner = window.CodeMirror.innerMode(cm.getMode(), state);
    const name = inner.mode.name;
    if (name === 'css' || name === 'javascript') return name;
    if (name === 'xml') return inner.state.tagName ? 'tag' : 'text';
    return 'text';
  };

  SHP.cm = { leadingWhitespace, context };

  /** The CKEditor instance that owns a .cke element. */
  SHP.ckeditorFor = (ckeEl) =>
    Object.values(window.CKEDITOR?.instances || {}).find((inst) => inst.container?.$ === ckeEl);

  /** Run cb(editor) for every CKEditor once it's ready. */
  SHP.onCKEditor = (cb) => SHP.onAdded('.cke', (ckeEl) => {
    const editor = SHP.ckeditorFor(ckeEl);
    if (editor.status === 'ready') cb(editor);
    else editor.once('instanceReady', () => cb(editor));
  }, (ckeEl) => !!SHP.ckeditorFor(ckeEl));
})();
