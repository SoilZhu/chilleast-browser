/**
 * 匿名活跃度统计服务（与原版 Flutter App 的 AnalyticsService 保持完全一致）
 *
 * 隐私规范 (Zero-PII)：
 * - 每次启动时仅在用户开启开关的前提下，向 https://analysis.soilzhu.su/api/v1/ping 发送一次匿名心跳。
 * - 仅上报本地随机生成的 UUID、应用版本号与运行平台 (web)，绝不收集任何个人信息与硬件标识。
 * - 该配置及 UUID 仅保存在设备本地 (localStorage)，不参与任何云端同步或备份导出。
 */

const PING_URL = 'https://analysis.soilzhu.su/api/v1/ping';
export const ANALYTICS_ENABLED_KEY = 'local_analytics_enabled';
export const LEGACY_ANALYTICS_ENABLED_KEY = 'chilleast_analytics_enabled';
export const ANALYTICS_UUID_KEY = 'local_anonymous_uuid';

/** 生成标准 RFC 4122 v4 UUID（纯随机数，不依赖任何硬件标识） */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 检查是否开启了匿名统计（默认开启 true） */
export function isAnalyticsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const val = localStorage.getItem(ANALYTICS_ENABLED_KEY);
  if (val !== null) return val !== 'false';
  const legacyVal = localStorage.getItem(LEGACY_ANALYTICS_ENABLED_KEY);
  if (legacyVal !== null) return legacyVal !== 'false';
  return true;
}

/** 设置匿名统计开关（仅在本地生效） */
export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  const val = String(enabled);
  localStorage.setItem(ANALYTICS_ENABLED_KEY, val);
  localStorage.setItem(LEGACY_ANALYTICS_ENABLED_KEY, val);
}

/** 获取或生成本地匿名设备 UUID（纯随机数，证明设备唯一性，无任何硬件信息） */
export function getOrCreateAnonymousUuid(): string {
  if (typeof localStorage === 'undefined') return generateUuid();
  let uuid = localStorage.getItem(ANALYTICS_UUID_KEY);
  if (uuid && uuid.trim().length > 0) {
    return uuid.trim();
  }
  uuid = generateUuid();
  localStorage.setItem(ANALYTICS_UUID_KEY, uuid);
  return uuid;
}

/** 启动时发送匿名心跳 */
export async function pingAnalytics(): Promise<void> {
  try {
    if (!isAnalyticsEnabled()) return;

    const uuid = getOrCreateAnonymousUuid();
    const version = '1.0.0';
    const platform = 'web';

    await fetch(PING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uuid,
        version,
        platform,
      }),
    });
  } catch {
    // 静默处理，网络故障或服务端异常绝不影响应用主流程
  }
}
