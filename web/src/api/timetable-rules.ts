/**
 * 课表调整规则（调课 / 停课 / 加课）的读写
 * ----------------------------------------------------------------------------
 * 数据落在**云端备份**的 `localData.timetableRules`，与手机 App 共用同一份数据：
 *
 *   读取：GET  /api/academic/timetable?full=true → backup.rules（课表页已经在拉）
 *   写入：POST /api/academic/timetable/rules     → body { rules }
 *
 * 同时写一份 localStorage 镜像（键 `chilleast_timetable_rules`），原因有两个：
 *   1. `services/backup.ts` 的 `readTimetableRules()` 会把这个键的内容当作
 *      「本地规则」写进云备份，保持它和云端一致才不会互相覆盖；
 *   2. 离线/未登录时界面仍能显示上一次的调整记录。
 *
 * 写入成功后调用 `markDirty()`，让云同步引擎在去抖窗口后把新状态推上云盘
 * （与 App 的 markDirty 语义一致）。
 */

import { apiRequest } from './client';
import { markDirty } from '../services/cloudSync';
import { sortRules, type TimetableRule } from '../utils/timetable-rules';

/** localStorage 镜像键（与 services/backup.ts 的 readTimetableRules 读的键一致） */
export const TIMETABLE_RULES_KEY = 'chilleast_timetable_rules';

/** 写规则的响应 */
export interface SaveTimetableRulesResult {
  success: boolean;
  rulesCount: number;
  fileName: string;
}

/**
 * 把规则数组写进 localStorage 镜像。
 * 任何写失败（隐私模式、配额满）都静默吞掉 —— 它只是离线兜底，不是真相来源。
 */
export function writeLocalRules(rules: readonly TimetableRule[]): void {
  try {
    localStorage.setItem(TIMETABLE_RULES_KEY, JSON.stringify(rules));
  } catch {
    // 忽略：localStorage 不可用时不影响云端写入
  }
}

/**
 * 读 localStorage 镜像里的规则。
 * 结构异常时返回空数组（不让一条坏数据把整个调课功能锁死）。
 */
export function readLocalRules(): TimetableRule[] {
  try {
    const raw = localStorage.getItem(TIMETABLE_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TimetableRule =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as TimetableRule).id === 'string' &&
        typeof (item as TimetableRule).type === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * 清空本地规则镜像（退出登录 / 清空全部调整时用）。
 */
export function clearLocalRules(): void {
  try {
    localStorage.removeItem(TIMETABLE_RULES_KEY);
  } catch {
    // 忽略
  }
}

/**
 * 保存整组规则到云端备份。
 *
 * 语义是**整组覆盖**（与原版 `saveRules(sortedRules)` 一致）：调用方传什么就是什么，
 * 增/删/清空都由调用方算好再传进来。这样服务端不需要理解规则语义。
 *
 * 本地镜像先写、云端后写：
 * - 先写本地：即使云端失败，用户这次的调整也不会凭空消失（界面可回显）
 * - 云端失败向上抛，调用方据此提示「已保存到本地，云端同步失败」
 */
export async function saveTimetableRules(
  rules: readonly TimetableRule[],
): Promise<SaveTimetableRulesResult> {
  const sorted = sortRules(rules);
  writeLocalRules(sorted);
  markDirty();

  const result = await apiRequest<SaveTimetableRulesResult>('/api/academic/timetable/rules', {
    method: 'POST',
    body: JSON.stringify({ rules: sorted }),
  });

  return {
    success: Boolean(result?.success),
    rulesCount: Number(result?.rulesCount ?? sorted.length),
    fileName: String(result?.fileName ?? ''),
  };
}

/**
 * 新增一条规则并保存。
 * 返回保存后的完整规则列表（已按执行顺序排序），方便调用方直接回填。
 */
export async function appendTimetableRule(
  currentRules: readonly TimetableRule[],
  rule: TimetableRule,
): Promise<TimetableRule[]> {
  const next = sortRules([...currentRules, rule]);
  await saveTimetableRules(next);
  return next;
}

/** 按 id 删除一条规则并保存，返回剩余规则列表。 */
export async function removeTimetableRule(
  currentRules: readonly TimetableRule[],
  ruleId: string,
): Promise<TimetableRule[]> {
  const next = sortRules(currentRules.filter((rule) => rule.id !== ruleId));
  await saveTimetableRules(next);
  return next;
}

/** 清空全部规则并保存，返回空数组。 */
export async function clearTimetableRules(): Promise<TimetableRule[]> {
  await saveTimetableRules([]);
  return [];
}

/**
 * 取「当前应该显示的规则」，同时也是「新增规则时的基线」。
 *
 * 优先级：
 *   1. 父级传入的云端规则（TimetableView 从 full timetable 响应的 `backup.rules` 拿到的）
 *   2. 云端为空时退回 localStorage 镜像（非空才用）
 *   3. 都没有 → 空数组
 *
 * 第 2 步是**数据安全**兜底，不是多此一举：
 * 云端规则读不出来（网络抖动 / 本次会话没拉到 backup）时父级传的是 `[]`，
 * 如果直接拿它当基线再整组写回云端，用户已有的规则就被这一条新规则覆盖掉了。
 * 本地镜像在每次保存时都同步写过，拿它当基线比拿空数组安全。
 *
 * 反过来也不会「复活」已删除的规则：清空/删除同样会写镜像（写成空数组），
 * 所以镜像为空时仍然返回空数组。
 */
export function resolveRules(cloudRules: readonly TimetableRule[] | null | undefined): TimetableRule[] {
  if (Array.isArray(cloudRules) && cloudRules.length > 0) return sortRules(cloudRules);
  const local = readLocalRules();
  if (local.length > 0) return sortRules(local);
  return [];
}
