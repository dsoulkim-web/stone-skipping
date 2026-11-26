// dist/를 HTML 한 파일로 묶는다 (Claude 아티팩트 웹앱 게시용).
// 아티팩트는 문서 뼈대(doctype/html/head/body)를 직접 씌우므로 내용만 남긴다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
const js = [...html.matchAll(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g)].map((m) =>
  readFileSync(join(dist, m[1]), 'utf8').replace(/<\/script/gi, '<\\/script'),
);
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
const out = `<title>퐁당퐁당</title>
<meta name="theme-color" content="#0b1d2a">
<style>${css.join('\n')}</style>
${body}
<script type="module">${js.join('\n')}</script>
`;
mkdirSync('webapp', { recursive: true });
writeFileSync('webapp/index.html', out);
console.log(`webapp/index.html ${(out.length / 1024).toFixed(0)} KB`);
