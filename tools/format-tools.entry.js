// Entry for src/vendor/format-tools.js (built by tools/build-vendor.mjs):
// Prettier with Shopify's Liquid plugin (HTML with {{ }} and {% %}, including
// the CSS in <style> and JavaScript in <script>) and Prettier's own CSS and
// JavaScript parsers. Used by the Format button (source-format). Injected
// into the page's MAIN world on demand (SHP.load('format-tools')).
import * as prettier from 'prettier/standalone';
import * as postcss from 'prettier/plugins/postcss';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import liquid from '@shopify/prettier-plugin-liquid/standalone.js';

window.SlateHelperPage.provide('format-tools', {
  prettier,
  plugins: [liquid, postcss, babel, estree],
});
