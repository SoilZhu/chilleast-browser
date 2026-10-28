/**
 * 备份写回后的界面刷新（对应原版 App 的 backup_provider_refresh.dart）
 *
 * 为什么需要：`services/backup.ts` 的 `applyBackup()` 只把数据写进 localStorage，
 * 而各 store 的 reactive 状态是**模块加载时读一次**就固定的。所以拉取云端备份后
 * 数据其实已经更新了，界面却还显示旧值 —— 早先只能靠 `window.location.reload()`
 * 打补丁，体验很差（丢当前页、闪一下）。
 *
 * 原版 App 用 `BackupProviderRefresh.refreshAfterRestore()` 在写回后逐个 reload
 * provider，这里做网页端的等价物。
 *
 * 调用方：`services/cloudSync.ts` 在 `applyBackup()` 之后调用（动态 import 规避循环依赖）。
 *
 * 与原版的对应关系：
 * | 原版 provider                        | 网页端                                   |
 * |--------------------------------------|------------------------------------------|
 * | `localeProvider.setLocaleByCode`     | `stores/i18n.ts` 的 `setLanguage`        |
 * | `settingsProvider.reload`            | `reloadSettings()`                       |
 * | `appearanceProvider.reload`          | `reloadAppearance()`                     |
 * | `aiAssistantProvider.loadSettings`   | Agent 设置读 localStorage（本文件内）     |
 * | `aiMemoryProvider.reloadFromStorage` | Agent 设置读 localStorage（本文件内）     |
 * | `homeworkProvider.reloadFromStorage` | 无独立 store，页面读 localStorage         |
 * | `CourseColorUtils.reload`            | 无独立 store，页面读 localStorage         |
 * | `examProvider.reloadFromStorage`     | 无独立 store，页面读 localStorage         |
 * | `electricityCacheProvider.refresh`   | `reloadElectricityRooms()`               |
 * | `homeWidgetService.syncWidgets`      | **无对应物**：网页端没有桌面小组件        |
 * | `campusCardCacheProvider.refresh`    | **无对应物**：网页端校园卡缓存随页面请求  |
 * | `timetableStatusProvider.refresh`    | **无对应物**：网页端课表页进页主动拉取    |
 *
 * 注意：本文件**只读 localStorage 赋值给 reactive**，绝不触发 `markDirty()`
 * —— 刚拉下来的数据如果被标脏，会立刻被去抖回推，形成同步回环。
 */
import type { BackupDocument } from './backup';
import { LANGUAGES, setLanguage, type LangCode } from '../stores/i18n';
import { reloadSettings } from '../stores/settings';
import { reloadAppearance } from '../stores/appearance';
import { reloadElectricityRooms } from '../composables/useElectricity';

/**
 * 语言代码是否在网页端支持范围内。
 *
 * 手机端可能写来网页端没有的语言（如 `gan` / `wuu` / `hsn` / `zh_hefei`），
 * 这时**不能**直接 setLanguage —— 否则 currentLang 会变成一个没有字典的代码，
 * 整站文案回退成中文却又显示着错误的「当前语言」。
 */
function resolveLanguage(code: unknown): LangCode | null {
  if (typeof code !== 'string' || code === '') return null;
  const found = LANGUAGES.find((option) => option.code === code);
  return found ? found.code : null;
}

/**
 * 把写回后的本地状态同步到各 reactive store，让界面立即生效。
 *
 * @param doc 刚应用到本地的备份文档（用于决定要刷新哪些部分）
 */
export async function refreshAfterRestore(doc: BackupDocument): Promise<void> {
  const settingsPart =
    typeof doc.settings === 'object' && doc.settings !== null
      ? (doc.settings as Record<string, unknown>)
      : {};

  // 1. 语言（原版 localeProvider.setLocaleByCode）
  const language = resolveLanguage(settingsPart['languageCode']);
  if (language) {
    try {
      setLanguage(language);
    } catch {
      // 切换失败不影响其它刷新
    }
  }

  // 2. 设置项（原版 settingsProvider.reload）
  try {
    reloadSettings();
  } catch {
    /* 单项刷新失败不影响其它 */
  }

  // 3. 布局个性化（原版 appearanceProvider.reload）
  try {
    reloadAppearance();
  } catch {
    /* 同上 */
  }

  // 4. 宿舍槽位（原版 electricityCacheProvider.refresh）
  try {
    reloadElectricityRooms();
  } catch {
    /* 同上 */
  }

  // 5/6/7/8. Agent 配置、Agent 记忆、手工作业、课程颜色、手工考试
  // 派发全局事件通知已打开的主页面重新载入手工作业与考试
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chilleast:tasks-sync'));
    }
  } catch {
    /* 忽略事件派发异常 */
  }
}
