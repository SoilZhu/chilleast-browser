/**
 * ChillEast 备份文档的读写。
 *
 * 备份 JSON 的结构照抄 `backup_export_service.dart` 的 `buildBackupData`：
 *
 *   { format, version, exportedAt, appVersion, settings: {...}, localData: {...} }
 *
 * **写回时必须完整保留 `settings` 与其它 `localData` 字段** —— 只改我们关心的那一个。
 * 否则用户手机上的设置会被 Worker 覆盖掉。这是这个模块最重要的一条约束。
 */

import type { CookieSession } from '../../auth/http';
import {
  buildBackupFileNameForTrack,
  deleteFile,
  downloadFile,
  countBackupEntriesByTrack,
  listBackupEntries,
  pickLatestLegacyEntry,
  pickLatestModernEntry,
  pickStaleEntriesForTrack,
  parseBackupFileName,
  uploadFile,
  DEFAULT_KEEP_COUNT,
  type BackupTrack,
  type CloudiskEntry,
  type CloudiskSession,
} from './cloudisk';

export const BACKUP_FORMAT = 'chilleast-backup';
export const MODERN_BACKUP_FORMAT = 'chilleast-modern';
export const BACKUP_VERSION = 1;

/** 每轨各自收敛保留的份数（对齐原版 `CloudBackupManager.defaultKeepCount = 3`）。 */
export const DEFAULT_BACKUP_KEEP_COUNT = DEFAULT_KEEP_COUNT;

export function isSupportedBackupFormat(format: unknown): boolean {
  return format === BACKUP_FORMAT || format === MODERN_BACKUP_FORMAT;
}

/** 备份文档所属的轨道。现代轨 = 全量；兼容轨 = 手机端老版本可读。 */
export type BackupTrackName = BackupTrack;

export interface BackupDocument {
  format?: string;
  version?: number;
  exportedAt?: string;
  appVersion?: string;
  settings?: Record<string, unknown>;
  localData?: Record<string, unknown>;
  [key: string]: unknown;
}

export class BackupNotFoundError extends Error {
  constructor(listedNames: readonly string[] = []) {
    const detail =
      listedNames.length === 0
        ? '云盘根目录里当前没有任何文件。'
        : `云盘根目录里有 ${listedNames.length} 个文件，但没有一个匹配 `
          + `chilleast-backup-*.json 或 chilleast-modern-*.json：`
          + `${listedNames.slice(0, 10).join('、')}`;
    super(
      '云端没有找到 ChillEast 备份。请先在手机 App 里打开「设置 → 数据 → 数据同步」' +
        `并等待一次同步完成。\n${detail}`,
    );
    this.name = 'BackupNotFoundError';
  }
}

/** 三分支仲裁的分支标识（SYNC-ALIGN 4.2）。 */
export type ArbitrationBranch = 'modern' | 'legacy-only' | 'merged';

/**
 * 拉取仲裁的结果。
 *
 * 兼容性说明：`slot` 仍然保留 —— `routes/academic.ts` 会把它再传回 `writeBackup`，
 * 删掉会牵动那个文件（本任务禁止修改）。
 */
export interface LoadedBackup {
  backup: BackupDocument;
  entry: CloudiskEntry;
  /** 仲裁后实际采用的轨道 */
  format: BackupTrackName;
  /** 仲裁走的分支（'modern' | 'legacy-only' | 'merged'） */
  branch: ArbitrationBranch;
  /**
   * 仲裁后实际采用的备份的 stamp（与 `entry.name` 自洽）。
   * 合并分支下更权威的「云端最新时间」见 `arbitration.legacyStamp`。
   */
  stamp: string;
  /** 兼容字段：`entry` 的槽位（现代轨固定为 'b'） */
  slot: string;
  /** 现代轨最新备份（存在时给出，供调用方诊断/二次合并） */
  modern?: CloudiskEntry;
  /** 兼容轨最新备份（存在时给出） */
  legacy?: CloudiskEntry;
  /** 实际下载并参与合并的文件名（合并分支有两个） */
  sources: string[];
  /** 云端当前每条轨道各保留几份（对齐原版每轨保留 3 份的收敛策略） */
  retained: RetainedSummary;
  /** 两轨各自的 stamp（缺失轨为 null），供调用方判断谁更新 */
  stamps: { modern: string | null; legacy: string | null };
}

/** 云端每条轨道当前保留的备份份数。 */
export interface RetainedSummary {
  /** 每条轨道最多保留的份数（原版 defaultKeepCount） */
  keepCount: number;
  modern: number;
  legacy: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

/**
 * 现代轨与更新的兼容轨合并（对齐 `cloud_backup_manager.dart` 的 `mergeModernWithLegacy`，
 * 语义逐条照抄；SYNC-ALIGN 4.2）：
 *
 * 1. 基础设置项以兼容轨覆盖（老设备刚改过这些）；
 * 2. `settings.appearance` 的列表/分组以兼容轨覆盖；
 * 3. `localData` 的课表与作业数据在兼容轨有值时覆盖；
 * 4. 结果 `format` 强制为 `chilleast-modern`（合并结果仍是现代全量文档）。
 *
 * 纯函数，不读写任何存储，便于单测。
 */
export function mergeModernWithLegacy(
  modern: BackupDocument,
  legacy: BackupDocument,
): BackupDocument {
  const merged: BackupDocument = { ...modern, format: MODERN_BACKUP_FORMAT };

  const modernSettings = { ...asRecord(merged.settings) };
  const legacySettings = asRecord(legacy.settings);
  const modernLocalData = { ...asRecord(merged.localData) };
  const legacyLocalData = asRecord(legacy.localData);

  // 1. 基础设置项以老版较新的设置覆盖
  const baseSettingsKeys = [
    'languageCode',
    'courseReminderMinutes',
    'homeworkReminderHours',
    'libraryReminderMinutes',
    'courseLiveEnabled',
    'flymeLiveEnabled',
    'timetableAutoSyncEnabled',
    'timetableShowEndTime',
    'manualFirstWeekMonday',
    'electricityRoom',
  ] as const;
  for (const key of baseSettingsKeys) {
    if (Object.prototype.hasOwnProperty.call(legacySettings, key)) {
      modernSettings[key] = legacySettings[key];
    }
  }

  // 2. 外观设置
  if (Object.prototype.hasOwnProperty.call(legacySettings, 'appearance')) {
    const legacyAppearance = asRecord(legacySettings['appearance']);
    const modernAppearance = { ...asRecord(modernSettings['appearance']) };
    for (const key of [
      'homeItems',
      'functionItems',
      'feedItems',
      'widgetItems',
      'functionGroupOrder',
      'hiddenFunctionGroups',
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(legacyAppearance, key)) {
        modernAppearance[key] = legacyAppearance[key];
      }
    }
    modernSettings['appearance'] = modernAppearance;
  }

  // 3. 课表、作业与考试数据：若老版有更新则覆盖（null/缺失都视为没有）
  for (const key of [
    'timetableIcs',
    'timetableMeta',
    'courses',
    'rawCourses',
    'timetableRules',
    'homeworkList',
    'examList',
  ] as const) {
    if (
      Object.prototype.hasOwnProperty.call(legacyLocalData, key) &&
      legacyLocalData[key] !== null &&
      legacyLocalData[key] !== undefined
    ) {
      modernLocalData[key] = legacyLocalData[key];
    }
  }

  if (
    !Object.prototype.hasOwnProperty.call(legacyLocalData, 'examList') &&
    Object.prototype.hasOwnProperty.call(legacyLocalData, 'manualExamList') &&
    legacyLocalData['manualExamList'] !== null &&
    legacyLocalData['manualExamList'] !== undefined
  ) {
    modernLocalData['examList'] = legacyLocalData['manualExamList'];
  }

  merged.settings = modernSettings;
  merged.localData = modernLocalData;
  return merged;
}

/** 下载并解析一份备份文件。 */
async function downloadBackupDocument(
  session: CookieSession,
  auth: CloudiskSession,
  entry: CloudiskEntry,
): Promise<BackupDocument> {
  const bytes = await downloadFile(session, auth, {
    resid: entry.id,
    encryptedId: entry.encryptedId,
    puid: entry.puid,
    folderId: auth.rootDirId,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(`云端备份 ${entry.name} 不是合法 JSON，已中止（不会覆盖它）`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`云端备份 ${entry.name} 结构异常，已中止`);
  }
  const backup = parsed as BackupDocument;
  if (!isSupportedBackupFormat(backup.format)) {
    throw new Error(
      `云端文件 ${entry.name} 的 format 是 ${String(backup.format)}，不是支持的备份格式（${BACKUP_FORMAT} 或 ${MODERN_BACKUP_FORMAT}）`,
    );
  }

  console.log(
    JSON.stringify({
      event: 'backup_read',
      file: entry.name,
      bytes: bytes.length,
      // 只记结构，不记内容（里面有用户设置）
      localDataKeys: Object.keys(backup.localData ?? {}),
    }),
  );
  return backup;
}

function stampOf(entry: CloudiskEntry | null): string {
  if (entry === null) return '';
  return parseBackupFileName(entry.name)?.stamp ?? '';
}

export interface ArbitrationDecision {
  branch: ArbitrationBranch;
  modern: CloudiskEntry | null;
  legacy: CloudiskEntry | null;
  modernStamp: string;
  legacyStamp: string;
}

/**
 * SYNC-ALIGN 4.2 的仲裁规则（纯函数，不做任何 I/O）：
 *
 * ```
 * 现代轨存在 且 (兼容轨不存在 或 现代stamp >= 兼容stamp)  → 'modern'     只拉现代轨
 * 仅兼容轨存在                                            → 'legacy-only' 拉兼容轨（老用户升级）
 * 两者都在 且 兼容轨更新                                   → 'merged'      两者都拉再合并
 * ```
 *
 * 两条都没有时返回 null（调用方负责抛 BackupNotFoundError）。
 */
export function decideBackupArbitration(
  modernEntry: CloudiskEntry | null,
  legacyEntry: CloudiskEntry | null,
): ArbitrationDecision | null {
  if (modernEntry === null && legacyEntry === null) return null;
  const modernStamp = stampOf(modernEntry);
  const legacyStamp = stampOf(legacyEntry);

  const branch: ArbitrationBranch =
    modernEntry !== null && (legacyEntry === null || modernStamp >= legacyStamp)
      ? 'modern'
      : legacyEntry !== null && modernEntry === null
        ? 'legacy-only'
        : 'merged';

  return { branch, modern: modernEntry, legacy: legacyEntry, modernStamp, legacyStamp };
}

/** `readLatestBackup` 的可注入依赖（默认走真实云盘 I/O，单测可替换）。 */
export interface ReadBackupDeps {
  listEntries: (
    session: CookieSession,
    auth: CloudiskSession,
    folderId: string,
  ) => Promise<CloudiskEntry[]>;
  download: (
    session: CookieSession,
    auth: CloudiskSession,
    entry: CloudiskEntry,
  ) => Promise<BackupDocument>;
}

const defaultReadDeps: ReadBackupDeps = {
  listEntries: (session, auth, folderId) => listBackupEntries(session, auth, folderId),
  download: (session, auth, entry) => downloadBackupDocument(session, auth, entry),
};

/**
 * 读云端最新备份，按 SYNC-ALIGN 4.2 三分支仲裁（规则见 `decideBackupArbitration`）。
 * 没有备份时抛 BackupNotFoundError（带可操作的提示）。
 */
export async function readLatestBackup(
  session: CookieSession,
  auth: CloudiskSession,
  deps: ReadBackupDeps = defaultReadDeps,
): Promise<LoadedBackup> {
  const entries = await deps.listEntries(session, auth, auth.rootDirId);
  const decision = decideBackupArbitration(
    pickLatestModernEntry(entries),
    pickLatestLegacyEntry(entries),
  );


  if (decision === null) {
    // 把实际看到的文件名带出来 —— 否则只能猜是"没开同步"还是"文件名不匹配"
    console.warn(
      JSON.stringify({ event: 'backup_not_found', listedNames: entries.map((item) => item.name) }),
    );
    throw new BackupNotFoundError(entries.map((item) => item.name));
  }

  const { branch, modern: modernEntry, legacy: legacyEntry } = decision;
  const counts = countBackupEntriesByTrack(entries);
  const retained: RetainedSummary = {
    keepCount: DEFAULT_BACKUP_KEEP_COUNT,
    modern: counts.modern,
    legacy: counts.legacy,
  };

  let backup: BackupDocument;
  let sources: string[];
  if (branch === 'modern' && modernEntry !== null) {
    // 分支 1：直接全量拉现代轨
    backup = await deps.download(session, auth, modernEntry);
    sources = [modernEntry.name];
  } else if (branch === 'legacy-only' && legacyEntry !== null) {
    // 分支 2：老用户升级，只有兼容轨
    backup = await deps.download(session, auth, legacyEntry);
    sources = [legacyEntry.name];
  } else if (modernEntry !== null && legacyEntry !== null) {
    // 分支 3：两轨都在且兼容轨更新（老设备改过基础设置）→ 都拉，智能合并
    const modern = await deps.download(session, auth, modernEntry);
    const legacy = await deps.download(session, auth, legacyEntry);
    backup = mergeModernWithLegacy(modern, legacy);
    sources = [modernEntry.name, legacyEntry.name];
  } else {
    // 理论上不可达：branch 已穷举，这里只是让类型收窄闭环
    throw new BackupNotFoundError(entries.map((item) => item.name));
  }

  console.log(
    JSON.stringify({
      event: 'backup_arbitration',
      branch,
      modern: modernEntry?.name ?? null,
      legacy: legacyEntry?.name ?? null,
      retained,
    }),
  );

  // entry/format/stamp 反映「实际采用的轨道」：合并分支以现代轨为主体
  //（合并结果 format 也是 modern），所以 stamp 取现代轨，与 entry.name 自洽；
  // 兼容轨那份更新的 stamp 单独放在 stamps/arbitration 里。
  const effectiveEntry =
    branch === 'legacy-only'
      ? (legacyEntry as CloudiskEntry)
      : (modernEntry as CloudiskEntry);
  const format: BackupTrackName = branch === 'legacy-only' ? 'legacy' : 'modern';
  const stamp = format === 'legacy' ? decision.legacyStamp : decision.modernStamp;

  return {
    backup,
    entry: effectiveEntry,
    format,
    branch,
    stamp,
    slot: parseBackupFileName(effectiveEntry.name)?.slot ?? 'b',
    ...(modernEntry === null ? {} : { modern: modernEntry }),
    ...(legacyEntry === null ? {} : { legacy: legacyEntry }),
    sources,
    retained,
    stamps: {
      modern: modernEntry === null ? null : decision.modernStamp,
      legacy: legacyEntry === null ? null : decision.legacyStamp,
    },
  };
}

/**
 * 写回备份：**固定写兼容轨的 `b` 槽，不跟 App 做 A/B 轮换。**
 * A/B 轮换的本意是崩溃安全（上传到新名字，成功后再删旧的；上传失败旧副本还在），这一点
 * 固定槽位同样满足 —— 我上传的是 `b-<新时间戳>`，与旧文件不同名。但手机端老版本「取最新」比的是
 * **整个文件名**（`cloud_backup_manager.dart`），而文件名是 `…-{slot}-{stamp}.json`，于是
 * `-a-` 永远排在 `-b-` 前面，与时间无关：若云端最新是 `-b-` 而我按轮换写 `-a-`，App 拉取时
 * **永远选它自己那份旧的**，我的改动进不了手机（只要旧文件还在，比如我的清理没成功）；反过来
 * 固定写 `b`，对 `-a-` 恒胜，对另一个 `-b-` 则退回比 stamp、新的胜 —— 无论清理是否成功，
 * 我的写入都能被 App 正确地选中。
 *
 * 文件名按 `backup.format` 决定轨道：现代轨 `chilleast-modern-{stamp}.json`，
 * 兼容轨 `chilleast-backup-b-{stamp}.json`。
 */
export async function writeBackup(
  session: CookieSession,
  auth: CloudiskSession,
  backup: BackupDocument,
  previousSlot: string | null,
): Promise<{ filename: string; resid: string; format: BackupTrackName; pruned: string[] }> {
  // previousSlot 保留在签名里（便于将来恢复 A/B），但当前固定用 b
  void previousSlot;

  // 保留调用方声明的 format：网页端会先后写现代轨与兼容轨，
  // 若这里强行改成 chilleast-backup，两份文件都会被识别成兼容轨，
  // 手机端与网页端的仲裁逻辑就错乱了。
  const requestedFormat: BackupTrackName =
    backup.format === MODERN_BACKUP_FORMAT ? 'modern' : 'legacy';
  const filename = buildBackupFileNameForTrack(requestedFormat, new Date());

  const document: BackupDocument = {
    ...backup, // 保留 settings / 其它 localData 字段
    format: requestedFormat === 'modern' ? MODERN_BACKUP_FORMAT : BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(document));

  const uploaded = await uploadFile(session, auth, auth.rootDirId, filename, bytes);
  const pruned: string[] = [];

  // 收敛清理：**同轨内**滚动保留最新 3 份（原版 defaultKeepCount）。
  //
  // ⚠️ 清理是**破坏性**操作，必须先确认刚上传的文件已经出现在列表里。
  // 如果列表里看不到它（索引延迟 / 服务端改了 id），就千万别删 ——
  // 否则可能把旧文件删了、新文件又不算数，结果一份备份都不剩。
  // 这正是实测踩到的坑：上传成功后反而报「云端没有找到备份」。
  try {
    const entries = await listBackupEntries(session, auth, auth.rootDirId);
    const newFileVisible = entries.some(
      (item) => item.id === uploaded.resid || item.name === filename,
    );
    if (!newFileVisible) {
      console.warn(
        JSON.stringify({
          event: 'backup_prune_skipped_new_file_missing',
          uploadedResid: uploaded.resid,
          filename,
          listedNames: entries.map((item) => item.name),
        }),
      );
      return { filename, resid: uploaded.resid, format: requestedFormat, pruned };
    }

    // 分轨挑选：只删本轨、且只删**严格更旧**的（pickStaleEntriesForTrack 内已保证）。
    // 跨轨删除会把另一条轨道的备份删光 —— 两轨仲裁就永远走不到合并分支了。
    const stale = pickStaleEntriesForTrack(
      entries,
      uploaded.resid,
      requestedFormat,
      DEFAULT_BACKUP_KEEP_COUNT,
    );

    for (const item of stale) {
      try {
        await deleteFile(session, auth, {
          resid: item.id,
          encryptedId: item.encryptedId,
          puid: item.puid,
        });
        pruned.push(item.name);
      } catch (error) {
        // 单个删除失败不影响整体
        console.warn(
          JSON.stringify({
            event: 'backup_prune_failed',
            name: item.name,
            message: error instanceof Error ? error.message : 'unknown',
          }),
        );
      }
    }

    if (pruned.length > 0) {
      console.log(
        JSON.stringify({ event: 'backup_pruned', track: requestedFormat, names: pruned }),
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'backup_prune_skipped',
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }

  console.log(JSON.stringify({ event: 'backup_written', file: filename, bytes: bytes.length }));
  return { filename, resid: uploaded.resid, format: requestedFormat, pruned };
}

// ---- localData 里的两个字段 -------------------------------------------------

/** 读出 `localData.timetableRules`（不是数组就返回空）。 */
export function readTimetableRules(backup: BackupDocument): unknown[] {
  const rules = backup.localData?.['timetableRules'];
  return Array.isArray(rules) ? rules : [];
}

/** 写入 `localData.timetableRules`，其余字段原样保留。 */
export function withTimetableRules(
  backup: BackupDocument,
  rules: readonly unknown[],
): BackupDocument {
  return { ...backup, localData: { ...(backup.localData ?? {}), timetableRules: [...rules] } };
}

/** 读出 `localData.homeworkList`（只含 isManual 的项）。 */
export function readManualHomework(backup: BackupDocument): Array<Record<string, unknown>> {
  const list = backup.localData?.['homeworkList'];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && (item as Record<string, unknown>)['isManual'] === true,
  );
}

/**
 * 写入 `localData.homeworkList`，其余字段原样保留。
 * 泛型是为了让调用方可以传自己的结构化类型（接口没有索引签名，
 * 直接要求 Record<string, unknown> 会逼调用方到处做无意义的转换）。
 */
export function withManualHomework<T extends object>(
  backup: BackupDocument,
  homework: readonly T[],
): BackupDocument {
  return {
    ...backup,
    localData: { ...(backup.localData ?? {}), homeworkList: homework.map((item) => ({ ...item })) },
  };
}

/** 读出 `localData.examList`（或 `manualExamList`，只含 isManual 的项）。 */
export function readManualExam(backup: BackupDocument): Array<Record<string, unknown>> {
  const list = backup.localData?.['examList'] ?? backup.localData?.['manualExamList'];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && (item as Record<string, unknown>)['isManual'] === true,
  );
}

/** 写入 `localData.examList`，其余字段原样保留。 */
export function withManualExam<T extends object>(
  backup: BackupDocument,
  exams: readonly T[],
): BackupDocument {
  return {
    ...backup,
    localData: { ...(backup.localData ?? {}), examList: exams.map((item) => ({ ...item })) },
  };
}

export interface DormitoryInfo {
  areaName?: string;
  buildingName?: string;
  roomName?: string;
  areaId?: string;
  buildingId?: string;
  roomId?: string;
  fullName?: string;
}

/** 读出设置中的宿舍房间（兼容字符串或对象形式） */
export function readDormitory(backup: BackupDocument): DormitoryInfo | null {
  const room = backup.settings?.['electricityRoom'] ?? backup.settings?.['electricityRoom2'];
  if (!room) return null;
  if (typeof room === 'object' && room !== null) {
    const rec = room as Record<string, unknown>;
    const areaName = String(rec['areaName'] ?? rec['campus'] ?? rec['area'] ?? '');
    const buildingName = String(rec['buildingName'] ?? rec['building'] ?? '');
    const roomName = String(rec['roomName'] ?? rec['room'] ?? '');
    const areaId = rec['areaId'] ? String(rec['areaId']) : undefined;
    const buildingId = rec['buildingId'] ? String(rec['buildingId']) : undefined;
    const roomId = rec['roomId'] ? String(rec['roomId']) : undefined;
    const fullName = [areaName, buildingName, roomName].filter(Boolean).join(' ') || undefined;
    return { areaName, buildingName, roomName, areaId, buildingId, roomId, fullName };
  }
  if (typeof room === 'string' && room.trim()) {
    return { fullName: room.trim() };
  }
  return null;
}

/** 读出设置中的课程自定义颜色 */
export function readCustomCourseColors(backup: BackupDocument): Record<string, string> {
  const colors = backup.settings?.['customCourseColors'];
  if (typeof colors === 'object' && colors !== null && !Array.isArray(colors)) {
    return colors as Record<string, string>;
  }
  return {};
}
