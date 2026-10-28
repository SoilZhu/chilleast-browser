/**
 * 云端自动同步引擎（对应原版 App 的 cloud_backup_manager.dart）
 *
 * 与原版逐条对齐的语义：
 *
 * 1. **开启时先拉取**：`initialSync()` 先找云端最新备份，
 *    有就下载覆盖本地（outcome = pulled），云端没有才把本地推上去（pushed）。
 * 2. **增量触发**：任何本地数据变更调用 `markDirty()`，标记脏位并去抖 10 秒后再同步。
 * 3. **启动时拉取**：`pullLatestOnStartup()` 先拉云端，若本地有离线修改再推一次。
 * 4. **上传全量快照 + 收敛清理**：每次同步写一份带时间戳的新文件，
 *    成功后按轨删除旧文件（每轨保留最新 3 份），云端永远只有少数几份。
 * 5. **退出登录复位**：清除开关、脏位、云端定位与未知字段暗盒，
 *    避免下个账号复用上个账号的云盘位置与配置。
 *
 * 这里的"增量"不是传差异字节（云端是对象存储，没有 PATCH 语义），
 * 而是「只在新数据真的变脏时才整包上传」，并把旧快照收敛掉 —— 与原版一致。
 *
 * 关于**双轨仲裁**：三分支（现代轨 / 仅兼容轨 / 两轨合并）在 Worker 侧完成
 * （`worker/src/school/hunau/backup.ts` 的 `readLatestBackup`），本文件消费它返回的
 * `arbitration.branch`。合并规则的**纯函数**也在 `./backup` 里有一份，
 * 用于 Worker 尚未升级（老响应没有 arbitration 字段）时的客户端兜底。
 */
import { ref, computed } from 'vue';
import { getCloudBackup, saveCloudBackup } from '../api/cloudisk';
import {
  buildBackupData,
  applyBackup,
  mergeModernWithLegacy,
  clearUnknownFields,
  MODERN_BACKUP_FORMAT,
  BACKUP_FORMAT,
  type BackupDocument,
} from './backup';

// ---------------------------------------------------------------------------
// 持久化键（与 App 同名）
// ---------------------------------------------------------------------------

const TOGGLE_KEY = 'cloud_backup_auto_sync';
/** 旧键：网页端早期误写成 `_enabled` 后缀，仅用于一次性迁移读取 */
const LEGACY_TOGGLE_KEY = 'cloud_backup_auto_sync_enabled';
const DIRTY_KEY = 'cloud_backup_is_dirty';
const LAST_SYNC_KEY = 'cloud_backup_last_sync_at';
const LAST_PULL_KEY = 'cloud_backup_last_pull_at';
const PROMPT_DECIDED_KEY = 'cloud_backup_prompt_decided';

/** 云端定位（对应原版 `_activeSlotKey` / `_activeResidKey` / `_activeEncryptedIdKey`） */
const ACTIVE_SLOT_KEY = 'cloud_backup_active_slot';
const ACTIVE_RESID_KEY = 'cloud_backup_active_resid';
const ACTIVE_ENCRYPTED_ID_KEY = 'cloud_backup_active_encrypted_id';

/** 与原版一致的防抖窗口 */
const DEBOUNCE_MS = 10_000;

/** 每轨保留的备份份数（对应原版 `CloudBackupManager.defaultKeepCount`） */
export const KEEP_COUNT = 3;

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

export type SyncPhase = 'idle' | 'pulling' | 'pushing' | 'syncing' | 'error';

/** 同步结果：开启时的首次同步用 */
export type InitialOutcome = 'pulled' | 'pushed' | 'failed';

/** 拉取仲裁实际走的分支（对应原版 `_pullAndApply` 的三个场景） */
export type PullBranch = 'modern' | 'legacy-only' | 'merged' | 'unknown';

export interface SyncState {
  phase: SyncPhase;
  /** 自动化开关 */
  enabled: boolean;
  /** 是否有未推送的本地改动 */
  dirty: boolean;
  /** 最后一次成功同步时间（ISO） */
  lastSyncAt: string | null;
  /** 最后一次成功拉取时间（ISO） */
  lastPullAt: string | null;
  /** 最近一次错误信息 */
  error: string | null;
  /** 本次同步实际写入的模块（用于界面展示） */
  lastApplied: string[];
  /** 云端最新备份文件名 */
  cloudFileName: string | null;
  /** 最近一次拉取走的仲裁分支 */
  lastBranch: PullBranch;
  /** 云端每轨保留的份数（来自 Worker 的 retained 字段） */
  retained: { keepCount: number; modern: number; legacy: number } | null;
}

/** 读取开关（网页版强制开启自动同步） */
function readToggle(): boolean {
  if (localStorage.getItem(TOGGLE_KEY) !== 'true') {
    localStorage.setItem(TOGGLE_KEY, 'true');
  }
  return true;
}

export const syncState = ref<SyncState>({
  phase: 'idle',
  enabled: readToggle(),
  dirty: localStorage.getItem(DIRTY_KEY) === 'true',
  lastSyncAt: localStorage.getItem(LAST_SYNC_KEY),
  lastPullAt: localStorage.getItem(LAST_PULL_KEY),
  error: null,
  lastApplied: [],
  cloudFileName: null,
  lastBranch: 'unknown',
  retained: null,
});

export const isSyncing = computed(
  () =>
    syncState.value.phase === 'pulling' ||
    syncState.value.phase === 'pushing' ||
    syncState.value.phase === 'syncing',
);

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

let debounceTimer: number | null = null;
let running = false;
let requeued = false;
let pullInFlight: Promise<BackupDocument | null> | null = null;

/**
 * 会话世代（对应原版 `_sessionGeneration`）。
 *
 * 登出/换号时递增。在途的拉取在「下载完成」与「写入本地」两个时刻各校验一次，
 * 一旦世代变了就丢弃结果 —— 否则 A 账号的云端备份会被写进 B 账号的 localStorage。
 */
let sessionGeneration = 0;

function setPhase(p: SyncPhase) {
  syncState.value = {
    ...syncState.value,
    phase: p,
    error: p === 'error' ? syncState.value.error : null,
  };
}

function markDirtyFlag(v: boolean) {
  syncState.value = { ...syncState.value, dirty: v };
  if (v) localStorage.setItem(DIRTY_KEY, 'true');
  else localStorage.removeItem(DIRTY_KEY);
}

function touchLastSync(iso: string | null) {
  syncState.value = { ...syncState.value, lastSyncAt: iso };
  if (iso) localStorage.setItem(LAST_SYNC_KEY, iso);
  else localStorage.removeItem(LAST_SYNC_KEY);
}

function touchLastPull(iso: string | null) {
  syncState.value = { ...syncState.value, lastPullAt: iso };
  if (iso) localStorage.setItem(LAST_PULL_KEY, iso);
  else localStorage.removeItem(LAST_PULL_KEY);
}

function fail(message: string) {
  syncState.value = { ...syncState.value, phase: 'error', error: message };
  return false;
}

/** 派发全局同步成功事件，供顶栏刷新按钮展示 done 图标 */
export function notifySyncSuccess(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('chilleast:sync-success'));
  }
}

/** 落盘云端定位（对应原版 _activeSlot / _activeResid / _activeEncryptedId） */
function rememberCloudLocation(fileName: string | null) {
  if (!fileName) return;
  const slot = /-a-/.test(fileName) ? 'a' : 'b';
  localStorage.setItem(ACTIVE_SLOT_KEY, slot);
  localStorage.setItem(ACTIVE_RESID_KEY, fileName);
}

function forgetCloudLocation() {
  localStorage.removeItem(ACTIVE_SLOT_KEY);
  localStorage.removeItem(ACTIVE_RESID_KEY);
  localStorage.removeItem(ACTIVE_ENCRYPTED_ID_KEY);
}

/** 把云端备份应用到本地并刷新各 store（拉取路径的唯一出口） */
async function applyPulledDocument(doc: BackupDocument, branch: PullBranch) {
  const { applied } = applyBackup(doc);
  // 刷新 reactive store：applyBackup 只写了 localStorage，
  // 而各 store 是模块加载时读一次的，不刷新界面就不会变（对应原版 BackupProviderRefresh）。
  // 动态 import 规避「store → cloudSync.markDirty」的循环依赖。
  try {
    const { refreshAfterRestore } = await import('./backupRefresh');
    await refreshAfterRestore(doc);
  } catch {
    // 刷新失败不应让同步整体失败：数据已落盘，下次进页面会读到
  }
  touchLastPull(new Date().toISOString());
  syncState.value = {
    ...syncState.value,
    lastApplied: applied,
    phase: 'idle',
    error: null,
    lastBranch: branch,
  };
  notifySyncSuccess();
}

// ---------------------------------------------------------------------------
// 云端读取（含三分支仲裁）
// ---------------------------------------------------------------------------

/**
 * 拉取云端最新备份并**应用**到本地（去重：并发调用共用同一次请求）。
 *
 * 仲裁优先交给 Worker（它已经实现了原版 `_pullAndApply` 的三分支）；
 * 若 Worker 还是老版本（响应里没有 `arbitration`），退化成「按 format 判断单轨」，
 * 至少不会把两轨搞混。
 *
 * 返回 null 表示云端没有备份。
 */
export async function pullLatest(): Promise<BackupDocument | null> {
  if (pullInFlight) return pullInFlight;
  const generationAtStart = sessionGeneration;

  pullInFlight = (async () => {
    try {
      const res = await getCloudBackup();
      if (!res) return null;

      const doc = (res.data ?? res) as BackupDocument;
      if (!doc || typeof doc !== 'object') return null;

      const branch: PullBranch = res.arbitration?.branch ?? (res.format === 'legacy' ? 'legacy-only' : 'unknown');

      syncState.value = {
        ...syncState.value,
        cloudFileName: res.fileName || null,
        retained: res.retained ?? null,
      };
      rememberCloudLocation(res.fileName ?? null);

      // 世代校验 1：下载完成后、写入前
      if (sessionGeneration !== generationAtStart) return null;

      await applyPulledDocument(doc, branch);

      // 世代校验 2：写入后（若期间登出，状态已被 resetOnLogout 重置，别再覆盖）
      if (sessionGeneration !== generationAtStart) return null;
      return doc;
    } catch {
      // 云端没有备份时接口会报错，这里视为「无备份」而不是失败
      return null;
    } finally {
      pullInFlight = null;
    }
  })();
  return pullInFlight;
}

// ---------------------------------------------------------------------------
// 上传
// ---------------------------------------------------------------------------

/**
 * 把本地状态推上云端。
 * 与原版 `_doSync` 一致：先写现代轨（全量），再写兼容轨（手机端旧版本可读）。
 */
async function pushBackup(): Promise<boolean> {
  try {
    // 1. 现代轨：全量数据
    const modern = buildBackupData(MODERN_BACKUP_FORMAT);

    // 上传前回环校验（对齐原版 _doSync 的完整性预检）：
    // 序列化后必须还能解析回一个带正确 format 的对象，否则宁可不传。
    const roundTrip = JSON.parse(JSON.stringify(modern)) as BackupDocument;
    if (!roundTrip || typeof roundTrip !== 'object' || roundTrip.format !== MODERN_BACKUP_FORMAT) {
      return fail('备份完整性校验失败：缺少 modern format 标识');
    }

    const r1 = await saveCloudBackup(modern);
    if (!r1?.success) return fail(r1?.message || '备份写入失败');
    rememberCloudLocation(r1.fileName ?? null);

    // 2. 兼容轨：手机端旧版本消费的格式。失败不阻断主流程（与原版一致）
    try {
      const legacy = buildBackupData(BACKUP_FORMAT);
      await saveCloudBackup(legacy);
    } catch {
      // 忽略：现代轨已经成功，兼容轨只是给老版本看的镜像
    }

    touchLastSync(new Date().toISOString());
    markDirtyFlag(false);
    notifySyncSuccess();
    return true;
  } catch (e) {
    return fail((e as Error).message || '备份写入失败');
  }
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

/** 开启/关闭自动同步。开启时走 initialSync（先拉后推）。 */
export async function setAutoSync(enabled: boolean): Promise<InitialOutcome> {
  syncState.value = { ...syncState.value, enabled };
  if (enabled) {
    localStorage.setItem(TOGGLE_KEY, 'true');
    localStorage.removeItem(LEGACY_TOGGLE_KEY);
    localStorage.setItem(PROMPT_DECIDED_KEY, 'true');
    return await initialSync();
  }
  localStorage.removeItem(TOGGLE_KEY);
  cancelPending();
  return 'failed';
}

/**
 * 开启开关时的首次同步（对应原版 initialSync / _pullOrPush）：
 * 云端有备份 → 拉取覆盖本地；云端没有 → 本地推上去。
 */
export async function initialSync(): Promise<InitialOutcome> {
  if (running) {
    requeued = true;
    return 'failed';
  }
  running = true;
  setPhase('pulling');
  try {
    const pulled = await pullLatest();
    if (pulled) return 'pulled';

    setPhase('pushing');
    const ok = await pushBackup();
    setPhase(ok ? 'idle' : 'error');
    return ok ? 'pushed' : 'failed';
  } catch (e) {
    fail((e as Error).message);
    return 'failed';
  } finally {
    running = false;
    if (requeued) {
      requeued = false;
      markDirty();
    }
  }
}

/**
 * 启动时拉取云端（对应原版 pullLatestOnStartup）：
 * 先拉云端覆盖本地；若本地之前有离线修改，拉完再推一次合并结果。
 */
export async function pullLatestOnStartup(): Promise<BackupDocument | null> {
  if (!syncState.value.enabled) return null;
  if (running) return null;
  running = true;
  setPhase('pulling');
  try {
    const hadOfflineEdits = syncState.value.dirty;
    const pulled = await pullLatest();

    if (hadOfflineEdits) {
      // 本地存在离线修改：把合并后的最新状态推上去，并清掉 dirty
      setPhase('pushing');
      await pushBackup();
    }
    setPhase('idle');
    return pulled;
  } catch (e) {
    fail((e as Error).message);
    return null;
  } finally {
    running = false;
    if (requeued) {
      requeued = false;
      markDirty();
    }
  }
}

/** 立即同步一次（对应原版 syncNow） */
export async function syncNow(force = false): Promise<boolean> {
  if (!force && !syncState.value.enabled) return false;
  if (running) {
    requeued = true;
    return false;
  }
  running = true;
  setPhase('syncing');
  try {
    // 先拉一次，拿到云端未知字段暗盒，避免推送时把手机端配置抹平
    await pullLatest();
    setPhase('pushing');
    const ok = await pushBackup();
    setPhase(ok ? 'idle' : 'error');
    return ok;
  } catch (e) {
    fail((e as Error).message);
    return false;
  } finally {
    running = false;
    if (requeued) {
      requeued = false;
      markDirty();
    }
  }
}

/**
 * 标记本地数据已变更（对应原版 markDirty）。
 * 去抖 10 秒后自动同步一次，避免连续操作触发多次上传。
 */
export function markDirty(): void {
  markDirtyFlag(true);
  if (!syncState.value.enabled) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

/** 取消待执行的去抖同步 */
export function cancelPending(): void {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/** 退出登录复位（对应原版 resetOnLogout） */
export function resetOnLogout(): void {
  // 递增世代：在途的拉取结果会被丢弃，不会写进下一个账号
  sessionGeneration++;
  cancelPending();
  running = false;
  requeued = false;
  pullInFlight = null;

  localStorage.removeItem(TOGGLE_KEY);
  localStorage.removeItem(LEGACY_TOGGLE_KEY);
  localStorage.removeItem(DIRTY_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
  localStorage.removeItem(LAST_PULL_KEY);
  localStorage.removeItem(PROMPT_DECIDED_KEY);
  forgetCloudLocation();
  // 未知字段暗盒也要清：它是上个账号的云端配置
  clearUnknownFields();

  syncState.value = {
    phase: 'idle',
    enabled: false,
    dirty: false,
    lastSyncAt: null,
    lastPullAt: null,
    error: null,
    lastApplied: [],
    cloudFileName: null,
    lastBranch: 'unknown',
    retained: null,
  };
}

/** 兼容旧调用：手工把本地推上云端（先拉一次拿暗盒，再推） */
export async function pushNow(): Promise<boolean> {
  if (running) return false;
  running = true;
  setPhase('pushing');
  try {
    await pullLatest();
    const ok = await pushBackup();
    setPhase(ok ? 'idle' : 'error');
    return ok;
  } finally {
    running = false;
  }
}

/** 手工「拉取云端」（UI 用）：只拉不推，语义与启动拉取一致但不看 dirty */
export async function pullNow(): Promise<BackupDocument | null> {
  if (running) return null;
  running = true;
  setPhase('pulling');
  try {
    const pulled = await pullLatest();
    setPhase('idle');
    return pulled;
  } catch (e) {
    fail((e as Error).message);
    return null;
  } finally {
    running = false;
  }
}

export { mergeModernWithLegacy };
