// Entry for src/vendor/source-tools.js (built by tools/build-vendor.mjs). The
// bundle is injected into the page's MAIN world on demand (SHP.load) and hands
// these over to the source-view features.
import { getCSSLanguageService } from 'vscode-css-languageservice';
import { getLanguageService as getHTMLLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HTMLHint } from 'htmlhint/dist/htmlhint.js';
import { JSHINT } from 'jshint/dist/jshint.js';

window.SlateHelperPage.provide('source-tools', {
  css: getCSSLanguageService(),
  html: getHTMLLanguageService(),
  TextDocument,
  HTMLHint,
  JSHINT,
});
