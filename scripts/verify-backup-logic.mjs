// 独立验证 backup.ts 的纯函数（不依赖 vitest）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ts from '/home/soilzhu/code/chilleast-browser/web/node_modules/typescript/lib/typescript.js';

const src = readFileSync('web/src/services/backup.ts', 'utf8');
// 只抽取纯函数区域做验证：把 import 换成 stub，导出到 CJS
const stripped = src
  .replace(/^import[\s\S]*?from '[^']+';$/gm, '')
  .replace(/^import[\s\S]*?from "[^"]+";$/gm, '');

const js = ts.transpileModule(stripped, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

// stub 掉外部依赖
const stub = `
const localStorage = { _d:{}, getItem(k){return k in this._d? this._d[k]: null}, setItem(k,v){this._d[k]=String(v)}, removeItem(k){delete this._d[k]} };
const settings = { reminderMinutes:0, homeworkReminderHours:0, libraryReminderMinutes:0, timetableAutoSyncEnabled:true, timetableShowEndTime:false, manualFirstWeekMonday:null };
const appearance = { home:[], functions:[], feed:[], groupOrder:[], hiddenGroups:[], feedAutoSort:false };
const DEFAULT_HOME_IDS = [];
const FEED_SECTIONS = [{id:'feed_quick'},{id:'feed_balance'}];
const ALL_FUNCTIONS = [{id:'library'},{id:'score'},{id:'ele_recharge'}];
const FUNCTION_GROUPS = [{id:'groupStudy'},{id:'groupLife'}];
`;
mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync('node_modules/.cache/backup.verify.cjs', stub + js);
console.log('transpiled OK → node_modules/.cache/backup.verify.cjs');
