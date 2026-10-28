#!/usr/bin/env node
/**
 * Material Icons 字体子集生成器
 * ----------------------------------------------------------------------------
 * 从 Google 官方 Material Icons 字体里，只挑 `web/src/components/icon-map.ts`
 * 用到的字形，裁成两个极小的 woff2（outlined / filled），输出到
 * `web/src/assets/material-icons/`，并生成字形 → 码点表
 * `web/src/components/icon-glyphs.ts`。
 *
 * 用法：node scripts/build-icons.mjs
 *
 * 依赖：python3 + fonttools（pyftsubset）。字体首次运行时会下载到
 * `.cache/material-icons/`（已在 .gitignore 中忽略）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const WEB = path.join(ROOT, 'web');
const CACHE = path.join(ROOT, '.cache/material-icons');
const OUT_DIR = path.join(WEB, 'src/assets/material-icons');
const MAP_FILE = path.join(WEB, 'src/components/icon-map.ts');
const GLYPH_FILE = path.join(WEB, 'src/components/icon-glyphs.ts');

const FONTS = {
  outlined: {
    family: 'Material Icons Outlined',
    url: 'https://fonts.gstatic.com/s/materialiconsoutlined/v110/gok-H7zzDkdnRel8-DQ6KAXJ69wP1tGnf4ZGhUce.woff2',
    file: 'material-icons-outlined-full.woff2',
    out: 'material-icons-outlined.woff2',
  },
  filled: {
    family: 'Material Icons',
    url: 'https://fonts.gstatic.com/s/materialicons/v145/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2',
    file: 'material-icons-filled-full.woff2',
    out: 'material-icons-filled.woff2',
  },
};

// ---------------------------------------------------------------------------
// 1. 从 icon-map.ts 里读出所有字形名
// ---------------------------------------------------------------------------

function readGlyphs() {
  const src = fs.readFileSync(MAP_FILE, 'utf8');
  const glyphs = new Set();
  for (const m of src.matchAll(/glyph:\s*'([a-z0-9_]+)'/g)) glyphs.add(m[1]);
  if (glyphs.size === 0) throw new Error('icon-map.ts 里没读到任何 glyph');
  return [...glyphs].sort();
}

// ---------------------------------------------------------------------------
// 2. 下载完整字体（带缓存）
// ---------------------------------------------------------------------------

async function ensureFont(spec) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, spec.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024) return dest;
  process.stdout.write(`  下载 ${spec.family} … `);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`下载失败 ${res.status} ${spec.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`${(buf.length / 1024).toFixed(0)} KB`);
  return dest;
}

// ---------------------------------------------------------------------------
// 3. 用 python/fonttools 读码点 + 裁子集
// ---------------------------------------------------------------------------

/**
 * 解析字形名 → 码点，且只返回「两个变体都有」的那个码点。
 *
 * Material Icons 家族有两个坑：
 *   1. 只有 outlined 变体保留了语义字形名，filled 的字形名是 `uniE88A`；
 *   2. 同一字形可能有多个码点（`favorite_border` 同时是 0xE07F 和 0xE87E），
 *      而 filled 只收录了新版码点。
 * 所以这里以 outlined 建「名字 → 候选码点」表，再用 filled 的 cmap 逐个核对，
 * 取两边都存在的码点，保证同一语义名在两个变体里指向同一字形。
 */
function resolveCodepoints(outlinedFont, filledFont, glyphs) {
  const py = `
import json, sys
from fontTools.ttLib import TTFont

outlined = TTFont(sys.argv[1]).getBestCmap()
filled = TTFont(sys.argv[2]).getBestCmap()

by_name = {}
for cp, name in sorted(outlined.items()):
    by_name.setdefault(name, []).append(cp)

wanted = json.loads(sys.argv[3])
out, missing, ambiguous = {}, [], {}
for g in wanted:
    cands = by_name.get(g)
    if not cands:
        missing.append(g)
        continue
    shared = [cp for cp in cands if cp in filled]
    if shared:
        out[g] = shared[0]
    else:
        out[g] = cands[0]
        ambiguous[g] = [c for c in cands]
print(json.dumps({"codepoints": out, "missing": missing, "ambiguous": ambiguous}))
`;
  const res = execFileSync(
    'python3',
    ['-c', py, outlinedFont, filledFont, JSON.stringify(glyphs)],
    { encoding: 'utf8' },
  );
  return JSON.parse(res);
}

function subset(fullFont, codepoints, outFile) {
  const unicodes = codepoints.map((cp) => `U+${cp.toString(16).toUpperCase()}`).join(',');
  execFileSync(
    'pyftsubset',
    [
      fullFont,
      `--unicodes=${unicodes}`,
      '--flavor=woff2',
      `--output-file=${outFile}`,
      '--no-hinting',
      '--desubroutinize',
      '--layout-features=',
      '--name-IDs=',
      '--drop-tables+=GSUB,GPOS,GDEF',
    ],
    { stdio: 'pipe' },
  );
}

// ---------------------------------------------------------------------------
// 4. 主流程
// ---------------------------------------------------------------------------

const glyphs = readGlyphs();
console.log(`图标字形：${glyphs.length} 个`);

fs.mkdirSync(OUT_DIR, { recursive: true });

// 先下载两份完整字体，再取「两个变体都支持」的码点
const fontPaths = {};
for (const [variant, spec] of Object.entries(FONTS)) {
  fontPaths[variant] = await ensureFont(spec);
}

const { codepoints, missing, ambiguous } = resolveCodepoints(
  fontPaths.outlined,
  fontPaths.filled,
  glyphs,
);
if (missing.length > 0) {
  console.error('\n✗ 以下字形在 Material Icons 字体里不存在：');
  for (const m of missing) console.error('   ', m);
  console.error('  请修改 web/src/components/icon-map.ts 里的 glyph 名。');
  process.exit(1);
}
if (Object.keys(ambiguous).length > 0) {
  console.warn('  ! 以下字形两个变体无公共码点，已按 outlined 处理：');
  for (const [g, cps] of Object.entries(ambiguous)) {
    console.warn(`     ${g}: ${cps.map((c) => '0x' + c.toString(16)).join(' / ')}`);
  }
}

const entries = Object.entries(codepoints).sort((a, b) => a[0].localeCompare(b[0]));
const codepointList = entries.map(([, cp]) => cp);

// 两个变体用同一批码点裁子集，保证同一语义名在 outlined/filled 下对齐
for (const [variant, spec] of Object.entries(FONTS)) {
  const outFile = path.join(OUT_DIR, spec.out);
  subset(fontPaths[variant], codepointList, outFile);
  const size = fs.statSync(outFile).size;
  console.log(`  ${spec.out}  ${codepointList.length} 字形  ${(size / 1024).toFixed(1)} KB`);
}

// ---------------------------------------------------------------------------
// 5. 写 icon-glyphs.ts
// ---------------------------------------------------------------------------

const lines = entries.map(
  ([glyph, cp]) => `  ${glyph}: 0x${cp.toString(16)},`,
);
const content = `/**
 * Material Icons 字形 → 码点
 * ----------------------------------------------------------------------------
 * ⚠️ 此文件由 \`node scripts/build-icons.mjs\` 自动生成，请勿手改。
 * 字形集合来自 \`icon-map.ts\`，字体子集见 \`assets/material-icons/\`。
 */

export const ICON_GLYPHS: Record<string, number> = {
${lines.join('\n')}
};

/** 字体里实际包含的字形数量 */
export const ICON_GLYPH_COUNT = ${entries.length};
`;
fs.writeFileSync(GLYPH_FILE, content);
console.log(`\n✓ ${path.relative(ROOT, GLYPH_FILE)}  ${entries.length} 条`);
console.log('✓ 图标字体子集已生成');
