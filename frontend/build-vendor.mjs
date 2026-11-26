import { cp, mkdir } from 'node:fs/promises';

await mkdir('vendor', { recursive: true });
for (const [source, target] of [
  ['@fontsource-variable/plus-jakarta-sans/index.css', 'font/index.css'],
  ['@fontsource-variable/plus-jakarta-sans/files', 'font/files'],
  ['@fontsource-variable/plus-jakarta-sans/LICENSE', 'font/LICENSE'],
  ['sweetalert2/LICENSE', 'licenses/sweetalert2.txt'],
  ['bootstrap/LICENSE', 'licenses/bootstrap.txt'],
  ['chart.js/LICENSE.md', 'licenses/chart.txt'],
  ['@fortawesome/fontawesome-free/LICENSE.txt', 'licenses/fontawesome.txt'],
  ['bootstrap/dist/css/bootstrap.min.css', 'bootstrap.min.css'],
  ['bootstrap/dist/js/bootstrap.bundle.min.js', 'bootstrap.bundle.min.js'],
  ['sweetalert2/dist/sweetalert2.all.min.js', 'sweetalert2.min.js'],
  ['chart.js/dist/chart.umd.min.js', 'chart.min.js'],
  ['@fortawesome/fontawesome-free/css/all.min.css', 'css/all.min.css'],
  ['@fortawesome/fontawesome-free/webfonts', 'webfonts']
]) {
  await cp('node_modules/' + source, 'vendor/' + target, { recursive: true });
}
