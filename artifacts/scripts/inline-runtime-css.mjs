import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = path.resolve(here, '../dist/runtime');
const jsFile = path.join(dist, 'ryugi-ui.js');
const cssFiles = fs.readdirSync(dist).filter((file) => file.endsWith('.css'));
const css = cssFiles.map((file) => fs.readFileSync(path.join(dist, file), 'utf8')).join('\n');
const js = fs.readFileSync(jsFile, 'utf8');
const inject = `(function(){if(document.getElementById('ryugi-ui-style'))return;const s=document.createElement('style');s.id='ryugi-ui-style';s.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(s)})();\n`;
fs.writeFileSync(jsFile, inject + js);
for (const file of cssFiles) fs.rmSync(path.join(dist, file));
const local = path.resolve(here, '../../skills/artifacts/app/runtime');
fs.mkdirSync(local, { recursive: true });
fs.copyFileSync(jsFile, path.join(local, 'ryugi-ui.js'));
console.log(JSON.stringify({ runtime: jsFile, bytes: fs.statSync(jsFile).size }));
