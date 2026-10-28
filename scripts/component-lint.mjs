/**
 * 组件导入检查（防「忘了 import 导致组件静默降级成原生标签」）
 *
 * 背景：改造过程中出现过一次真实事故——模板里写了 `<NoteCard>` 但忘了 import，
 * Vue 把它当成未知的自定义元素渲染，**不报错、不警告、样式全丢**，
 * 页面上只是「卡片边框凭空消失」，靠肉眼很容易漏。
 *
 * 用法：node scripts/component-lint.mjs
 * 退出码非 0 表示有未导入的组件。
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve('web/src');

/** HTML 原生标签 + Vue 内置组件，不需要 import */
const BUILTIN = new Set([
  'template', 'div', 'span', 'button', 'section', 'article', 'header', 'footer', 'main',
  'nav', 'aside', 'form', 'input', 'select', 'option', 'optgroup', 'textarea', 'label',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'img', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use',
  'br', 'hr', 'strong', 'em', 'small', 'b', 'i', 'u', 's', 'sub', 'sup', 'abbr', 'mark',
  'time', 'code', 'pre', 'blockquote', 'figure', 'figcaption', 'cite', 'q', 'kbd',
  'canvas', 'video', 'audio', 'source', 'track', 'iframe', 'object', 'embed',
  'details', 'summary', 'dialog', 'fieldset', 'legend', 'progress', 'meter', 'output',
  'slot', 'component', 'transition', 'transition-group', 'keep-alive', 'teleport',
  'suspense', 'template',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}

const problems = [];

for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');

  // 取模板主体（第一个 <template> ... 最后一个 </template> 之前的部分）
  const tmplMatch = text.match(/^<template>([\s\S]*)<\/template>/m);
  if (!tmplMatch) continue;
  const template = tmplMatch[1];

  // 收集模板里用到的 PascalCase 组件
  const used = new Set();
  for (const m of template.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) used.add(m[1]);

  // 取 <script> 内容
  // 一个 SFC 可能有多个 <script> 块（如 <script> + <script setup>），全部拼起来判断
  const script = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .join('\n');

  // 组件自己文件名就是该组件（如 Alert.vue 里写 <Alert> 属于自引用说明/文档注释）
  const selfName = path.basename(file, '.vue');

  for (const name of used) {
    if (BUILTIN.has(name)) continue;
    if (name === selfName) continue;
    // 匹配 import X from '...' / import { X } / import X, { Y }
    // 注意：`import Icon from '@/components/Icon.vue'` 这类别名导入也要算数，
    // 所以先按「import ... <name> ... from」的宽松形态判断，再兜底几种写法。
    const re = new RegExp(`import\\s+[^;]*\\b${name}\\b[^;]*from`);
    const declared =
      re.test(script) ||
      new RegExp(`\\bas\\s+${name}\\b`).test(script) ||
      // defineAsyncComponent(() => import(...)) 赋给同名变量
      new RegExp(`const\\s+${name}\\s*=`).test(script);
    if (!declared) {
      const rel = path.relative(process.cwd(), file);
      problems.push(`${rel} → <${name}> 未导入（会被当成原生标签静默渲染）`);
    }
  }
}

if (problems.length === 0) {
  console.log('✓ 组件导入检查通过（模板里的自定义组件都已 import）');
  process.exit(0);
}

console.log(`发现 ${problems.length} 个未导入的组件：`);
for (const p of problems) console.log('  ✗', p);
process.exit(1);
