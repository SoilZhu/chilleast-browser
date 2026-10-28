#!/usr/bin/env node
/**
 * 文案体检脚本
 *
 * 只检查「用户能看到的文字」，跳过注释、console.*、<option value>、内部字段。
 * 用法：node scripts/copy-lint.mjs [--strict]
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../web/src');

// 用户可见文本里禁止出现的词
const BANNED = [
  '零状态', '中转', 'Worker', 'Cloudflare', 'AES', 'GCM',
  '对齐', '手机端', 'App 端', '原版', '超星', '融合门户',
  '直连', '一键', '无缝', '零延迟', '实时连接', '备考无忧',
  '双向互通', '大功告成', '不再重复配置',
];

// 允许的长文案白名单（文件:关键词）
const LONG_OK = [
  // 登录页安全说明（COPY.md §8 允许 ≤40 字）
  { file: 'LoginView.vue', max: 40 },
];

const CJK = /[\u4e00-\u9fa5]/g;

function stripCommentsAndCode(src) {
  // 去掉 <!-- --> 注释
  let out = src.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
  // 去掉 /* */ 注释
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  // 去掉 // 行注释（不处理字符串里的 //，够用）
  out = out.replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));
  return out;
}

function visibleStrings(src, file) {
  const clean = stripCommentsAndCode(src);
  const results = [];
  const lines = clean.split('\n');
  lines.forEach((line, i) => {
    // 跳过 console.* 行
    if (/console\.(log|warn|error|info|debug)/.test(line)) return;
    // 跳过 import 行
    if (/^\s*import\s/.test(line)) return;
    // 跳过纯 HTML 标签属性行里的 aria-label/title 之外不关心
    const trimmed = line.trim();
    if (!trimmed) return;

    // 提取可能的中文串：模板里的裸文本、引号字符串、模板字符串
    const candidates = [];
    // 裸文本（在 > 和 < 之间）
    for (const m of trimmed.matchAll(/>([^<>]+)</g)) {
      if (CJK.test(m[1])) candidates.push(m[1].trim());
      CJK.lastIndex = 0;
    }
    // 单/双引号字符串
    for (const m of trimmed.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*?)\1/g)) {
      if (CJK.test(m[2])) candidates.push(m[2]);
      CJK.lastIndex = 0;
    }
    // 反引号模板字符串
    for (const m of trimmed.matchAll(/`([^`]*)`/g)) {
      if (CJK.test(m[1])) candidates.push(m[1]);
      CJK.lastIndex = 0;
    }

    // 裸文本行：整行没有标签、没有引号、没有赋值，就是模板里的纯文字
    if (!/[<>{}=;]/.test(trimmed) && !/^['"`]/.test(trimmed) && CJK.test(trimmed)) {
      CJK.lastIndex = 0;
      candidates.push(trimmed);
    }
    CJK.lastIndex = 0;

    for (const c of candidates) {
      // 纯数据字段（value/url/id/class）跳过
      if (/^https?:/.test(c)) continue;
      results.push({ file, line: i + 1, text: c, raw: trimmed });
    }
  });
  return results;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(vue|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT);
let problems = 0;
let longProblems = 0;

console.log('=== 禁用词扫描 ===');
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const s of visibleStrings(src, rel)) {
    for (const bad of BANNED) {
      if (s.text.includes(bad)) {
        console.log(`  ${rel}:${s.line}  「${bad}」→ ${s.text.slice(0, 80)}`);
        problems++;
      }
    }
  }
}
if (problems === 0) console.log('  ✓ 干净');

console.log('\n=== 超长文案扫描（>24 字）===');
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  const allow = LONG_OK.find((x) => rel.endsWith(x.file));
  const limit = allow ? allow.max : 24;
  for (const s of visibleStrings(src, rel)) {
    const len = (s.text.match(CJK) || []).length;
    if (len > limit) {
      console.log(`  ${rel}:${s.line}  ${len}字 → ${s.text.slice(0, 100)}`);
      longProblems++;
    }
  }
}
if (longProblems === 0) console.log('  ✓ 干净');

console.log(`\n合计：禁用词 ${problems} 处，超长 ${longProblems} 处`);
process.exit(problems + longProblems > 0 ? 1 : 0);
