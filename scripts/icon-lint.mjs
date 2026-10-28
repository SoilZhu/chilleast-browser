#!/usr/bin/env node
/**
 * 图标体检脚本
 * ----------------------------------------------------------------------------
 * 1. 收集全站 `<Icon name="…" />`、`icon: '…'`、各种动态绑定里出现的字面量；
 * 2. 逐个核对是否在 `icon-map.ts` 里声明；
 * 3. 核对声明的字形是否都在 `icon-glyphs.ts`（字体子集）里。
 *
 * 用法：node scripts/icon-lint.mjs
 * 退出码非 0 表示有未声明/缺字形的图标名，CI 可直接使用。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'web/src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(vue|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// ---------- 1. 已声明的图标名 ----------
const mapSrc = fs.readFileSync(path.join(SRC, 'components/icon-map.ts'), 'utf8');
const declared = new Map();
for (const m of mapSrc.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\{\s*glyph:\s*'([a-z0-9_]+)'/gm)) {
  declared.set(m[1], m[2]);
}

// ---------- 2. 字体里实际有的字形 ----------
const glyphSrc = fs.readFileSync(path.join(SRC, 'components/icon-glyphs.ts'), 'utf8');
const baked = new Set([...glyphSrc.matchAll(/^\s{2}([a-z0-9_]+):\s*0x/gm)].map((m) => m[1]));

// ---------- 3. 源码里用到的图标名 ----------
const used = new Map(); // name -> Set(files)
const usedFiles = walk(SRC).filter((f) => !f.endsWith('icon-map.ts') && !f.endsWith('icon-glyphs.ts'));

for (const file of usedFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const add = (name) => {
    if (!name) return;
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(rel);
  };

  // <Icon name="x" />（只认 Icon 组件的 name，避免误伤 <transition name="md-toast">）
  for (const m of src.matchAll(/<Icon[^>]*?\sname="([a-z0-9-]+)"/g)) add(m[1]);
  // <Icon :name="cond === 'ele' ? 'zap' : 'wallet'" />
  // 只取三元表达式「结果位置」上的字面量，避免把比较值当成图标名。
  // 先剥掉 `=== 'x'` / `!== 'x'` 这类比较条件：嵌套三元（`a ? 'x' : b === 'y' ? 'z' : 'w'`）
  // 里的 `'y'` 是判断值，不是图标名，不剥会误报。
  for (const m of src.matchAll(/:name="([^"]*)"/g)) {
    const expr = m[1].replace(/(?:===|!==|==|!=)\s*'[a-z0-9-]+'/g, '');
    if (!expr.includes('?')) {
      for (const lit of expr.matchAll(/'([a-z0-9-]+)'/g)) add(lit[1]);
      continue;
    }
    for (const lit of expr.split('?').slice(1).join('?').matchAll(/'([a-z0-9-]+)'/g)) add(lit[1]);
  }
  // 配置对象：icon: 'x'
  for (const m of src.matchAll(/\bicon:\s*'([a-z0-9-]+)'/g)) add(m[1]);
  // 组件属性：icon="x"
  for (const m of src.matchAll(/\sicon="([a-z0-9-]+)"/g)) add(m[1]);
  // 默认值：icon = 'x'
  for (const m of src.matchAll(/\bicon\s*=\s*'([a-z0-9-]+)'/g)) add(m[1]);
}

// 不是图标名的属性值（HTML/组件 props）白名单
const NOT_ICON = new Set(['icon', 'trailing', 'actions', 'detail']);
for (const k of NOT_ICON) used.delete(k);

// ---------- 4. 校验 ----------
const problems = [];

for (const [name, files] of [...used].sort()) {
  if (!declared.has(name)) {
    problems.push(`✗ 未声明：${name}　出现在 ${[...files].join(', ')}`);
    continue;
  }
  const glyph = declared.get(name);
  if (!baked.has(glyph)) {
    problems.push(`✗ 缺字形：${name} → ${glyph}　请运行 node scripts/build-icons.mjs`);
  }
}

const unused = [...declared.keys()].filter((n) => !used.has(n));

console.log(`已声明图标：${declared.size} 个　字体子集：${baked.size} 个字形`);
console.log(`代码里用到的名字：${used.size} 个`);

if (unused.length > 0) {
  console.log(`\n· 已声明但当前未使用（保留着不影响）：${unused.join(' ')}`);
}

if (problems.length > 0) {
  console.error('\n发现 ' + problems.length + ' 个问题：');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

console.log('\n✓ 图标检查通过');
