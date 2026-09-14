const fs = require('fs');
const path = require('path');
const dir = __dirname;

const shell = fs.readFileSync(path.join(dir, 'shell.html'), 'utf8');
const chart = fs.readFileSync(path.join(dir, 'chart.umd.js'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

const safe = s => String(s).replace(/<\/script/gi, '<\\/script');

let out = shell
  .replace('/*__CHARTJS__*/', () => safe(chart))
  .replace('/*__APPJS__*/', () => safe(app));

const target = path.join(dir, '..', 'index.html');
fs.writeFileSync(target, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log('OK -> index.html', kb + ' KB');
console.log('placeholders left:', (out.match(/__CHARTJS__|__APPJS__/g) || []).length);
console.log('external refs (http/cdn):', (out.match(/https?:\/\/[^"'\s)]+/g) || []).filter(u => !u.includes('www.w3.org')).length);
