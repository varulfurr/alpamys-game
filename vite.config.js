import { defineConfig } from 'vite';
import { INITIAL } from './src/engine.js';
import { initialMarkup } from './src/presentation.js';

// The exported game also works under a preview's path prefix, not just a domain root.
export default defineConfig({
  base: './',
  build: { target: 'safari14', assetsInlineLimit: 0 },
  plugins: [{
    name: 'initial-dessert-board',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const csp = context.server ? '' : '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\'; connect-src \'self\'; object-src \'none\'; base-uri \'self\'">';
        return html.replace('<!-- INITIAL_BOARD -->', initialMarkup(INITIAL, './')).replace('<head>', `<head>\n${csp}`);
      },
    },
  }],
});
