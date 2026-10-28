const B = require('../node_modules/.cache/backup.verify.cjs');
let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, '\n     got:', a, '\n     exp:', e); }
}

console.log('\n[1] 未知字段提取：顶层/settings/localData 未知键');
const cloud = {
  format: 'chilleast-modern', version: 1,
  futureTopLevel: { hello: 'world' },
  settings: {
    languageCode: 'zh',
    widgetItems: [{ id: 'future_widget', isVisible: true }],
    unknownSetting: 42,
    appearance: {
      homeItems: [{ id: 'library', isVisible: true }, { id: 'future_fn', isVisible: false }],
      functionGroupOrder: ['groupStudy', 'groupFuture'],
      feedAutoSort: true,
      unknownAppearanceKey: 'x',
    },
    ai: { apiUrl: 'https://a', futureAiKey: 'keepme' },
    timetableSubscription: { enabled: true, uuid: 'u1', futureSubKey: 1 },
  },
  localData: {
    timetableRules: [],
    futureLocalKey: { a: 1 },
  },
};
const unk = B.extractUnknownFields(cloud);
eq('顶层未知键', unk.futureTopLevel, { hello: 'world' });
eq('settings 未知键', unk.settings.unknownSetting, 42);
eq('ai 未知键', unk.settings.ai, { futureAiKey: 'keepme' });
eq('subscription 未知键', unk.settings.timetableSubscription, { futureSubKey: 1 });
eq('appearance 未知键', unk.settings.appearance.unknownAppearanceKey, 'x');
eq('appearance 未知列表项', unk.settings.appearance._unknownListItems.homeItems, [{ id: 'future_fn', isVisible: false }]);
eq('未知分组键', unk.settings.appearance._unknownListItems.functionGroupOrder, ['groupFuture']);
eq('localData 未知键', unk.localData.futureLocalKey, { a: 1 });
eq('已知键不进暗盒', unk.settings.languageCode, undefined);

console.log('\n[2] 暗盒回填：未知项按 id 去重追加到列表尾部');
const fresh = {
  format: 'chilleast-modern', version: 1,
  settings: { appearance: { homeItems: [{ id: 'library', isVisible: true }], functionGroupOrder: ['groupStudy'] } },
  localData: {},
};
const merged = B.mergeUnknownFields(fresh, unk);
eq('未知项追加', merged.settings.appearance.homeItems.map(i => i.id), ['library', 'future_fn']);
eq('未知分组追加', merged.settings.appearance.functionGroupOrder, ['groupStudy', 'groupFuture']);
eq('顶层未知键回填', merged.futureTopLevel, { hello: 'world' });
eq('widgetItems 原样保留', merged.settings.widgetItems, [{ id: 'future_widget', isVisible: true }]);
eq('ai 未知键回填', merged.settings.ai, { futureAiKey: 'keepme' });

console.log('\n[3] 回填幂等：同 id 不重复追加');
const twice = B.mergeUnknownFields(merged, unk);
eq('列表不重复', twice.settings.appearance.homeItems.map(i => i.id), ['library', 'future_fn']);
eq('分组不重复', twice.settings.appearance.functionGroupOrder, ['groupStudy', 'groupFuture']);

console.log('\n[4] mergeModernWithLegacy：10 设置键 / 6 外观键 / 6 数据键');
const modern = {
  format: 'chilleast-modern',
  settings: { languageCode: 'en', courseLiveEnabled: true, timetableShowEndTime: true, electricityRoom: { r: 'm' }, appearance: { homeItems: ['M'], feedAutoSort: true, widgetItems: ['MW'] } },
  localData: { timetableRules: ['MR'], homeworkList: ['MH'], courses: { weeks: {} }, aiMemories: ['MA'] },
};
const legacy = {
  format: 'chilleast-backup',
  settings: { languageCode: 'zh', courseLiveEnabled: false, timetableShowEndTime: false, electricityRoom: { r: 'L' }, appearance: { homeItems: ['L'], feedAutoSort: false, widgetItems: ['LW'] } },
  localData: { timetableRules: ['LR'], homeworkList: ['LH'], courses: ['LC'], aiMemories: ['LA'] },
};
const m = B.mergeModernWithLegacy(modern, legacy);
eq('format 强制 modern', m.format, 'chilleast-modern');
eq('languageCode 被 legacy 覆盖', m.settings.languageCode, 'zh');
eq('courseLiveEnabled 被 legacy 覆盖', m.settings.courseLiveEnabled, false);
eq('electricityRoom 被 legacy 覆盖', m.settings.electricityRoom, { r: 'L' });
eq('appearance.homeItems 被 legacy 覆盖', m.settings.appearance.homeItems, ['L']);
eq('appearance.widgetItems 被 legacy 覆盖', m.settings.appearance.widgetItems, ['LW']);
eq('appearance.feedAutoSort 不在合并列表 → 保持 modern', m.settings.appearance.feedAutoSort, true);
eq('localData.timetableRules 被 legacy 覆盖', m.localData.timetableRules, ['LR']);
eq('localData.courses 被 legacy 覆盖', m.localData.courses, ['LC']);
eq('localData.aiMemories 不在合并列表 → 保持 modern', m.localData.aiMemories, ['MA']);

console.log('\n[5] mergeModernWithLegacy：legacy 为 null 不覆盖');
const m2 = B.mergeModernWithLegacy(modern, { format: 'chilleast-backup', localData: { courses: null, timetableRules: ['X'] } });
eq('null 不覆盖', m2.localData.courses, { weeks: {} });
eq('有值才覆盖', m2.localData.timetableRules, ['X']);

console.log('\n[6] 暗盒存储：save/load/clear');
B.saveUnknownFields(unk);
eq('load 往返', B.loadUnknownFields(), unk);
B.saveUnknownFields({});
eq('空对象删除键', B.loadUnknownFields(), {});
B.saveUnknownFields(unk);
B.clearUnknownFields();
eq('clear 清空', B.loadUnknownFields(), {});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
