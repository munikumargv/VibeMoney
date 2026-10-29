// Builds the static site for GitHub Pages into dist/: the console from
// public/ plus the engine bundled for the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/browser/engine.js')],
  outfile: path.join(out, 'js/engine.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
});

const index = path.join(out, 'index.html');
fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('<html lang="en">', '<html lang="en" data-mode="static">'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
fs.copyFileSync(index, path.join(out, '404.html'));
console.log(`Static site written to ${path.relative(root, out)}/`);
