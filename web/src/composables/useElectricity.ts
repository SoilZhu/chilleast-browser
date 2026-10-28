/**
 * 双宿舍电费状态（两个卡片槽位）
 * ----------------------------------------------------------------------------
 * 对应原版 `ElectricityRechargeScreen` 的 `_cardSlots`：电费页有两个槽位，
 * 各自独立绑定一个宿舍房间、独立查询余额。这里把它抽成模块级单例，
 * 让「电费充值」页与首页余额卡读同一份数据，切页不会丢状态。
 *
 * 持久化键与原版 `electricity_service.dart` 逐字一致，云端备份才能互通：
 *   槽位 0 → saved_electricity_room / saved_electricity_balance_info
 *   槽位 1 → saved_electricity_room_2 / saved_electricity_balance_info_2
 *
 * 另外槽位 0 会镜像写 `chilleast_dorm`（旧版网页端格式）与 `chilleast_dorm_name`，
 * 因为 MainView / 报修页 / 备份导出仍在读这两个键，不能断。
 */
import { ref } from 'vue';
import type { CloudDormitoryInfo } from '../api/academic';
import {
  fetchElectricity,
  fetchElectricityAreas,
  type ElectricityArea,
  type ElectricityBalance,
  type SavedElectricityRoom,
} from '../api/campus';
import { markDirty } from '../services/cloudSync';

// ---------------------------------------------------------------------------
// 持久化键
// ---------------------------------------------------------------------------

/** 槽位 0 / 1 的宿舍绑定键（与原版同名） */
const ROOM_KEYS = ['saved_electricity_room', 'saved_electricity_room_2'] as const;
/** 槽位 0 / 1 的余额缓存键（与原版同名） */
const BALANCE_KEYS = ['saved_electricity_balance_info', 'saved_electricity_balance_info_2'] as const;

/** 旧版网页端的宿舍绑定键：MainView 用它查余额，报修页用它填默认位置 */
const LEGACY_DORM_KEY = 'chilleast_dorm';
const LEGACY_DORM_NAME_KEY = 'chilleast_dorm_name';

/** 房间只有 32 位哈希 ID 时没有可读性，展示层退化成「所选宿舍」 */
const HASHED_ROOM_ID = /^[0-9a-f]{32}$/i;

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 一个宿舍槽位的完整状态 */
export interface ElectricitySlot {
  /** 0 | 1 */
  index: number;
  /** 已绑定的宿舍房间，未绑定为 null */
  room: SavedElectricityRoom | null;
  /** 最近一次查询到的余额，未查询或查询失败时为 null */
  balance: ElectricityBalance | null;
  /** 余额查询中 */
  loading: boolean;
  /** 余额查询失败的原因（只影响展示，不抛出） */
  error: string | null;
  /** 「金岸公寓空调 金岸1栋 629」或「宿舍 1（未绑定）」 */
  label: string;
  /** 余额数字文本，没有数据时为 '--' */
  balanceText: string;
}

/**
 * 首页余额卡用的只读视图。
 * 结构子集，卡片组件不必依赖整个 composable 的内部状态。
 */
export type ElectricitySlotView = Pick<
  ElectricitySlot,
  'index' | 'room' | 'label' | 'balanceText' | 'loading'
>;

// ---------------------------------------------------------------------------
// localStorage 读写
// ---------------------------------------------------------------------------

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * 把任意来源的宿舍绑定统一成 `SavedElectricityRoom`。
 * 同时兼容原版结构（areaName/buildingName）与旧版网页端结构（area/building）。
 */
function normalizeRoom(raw: unknown): SavedElectricityRoom | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const areaName = asText(rec.areaName) || asText(rec.area);
  const buildingName = asText(rec.buildingName) || asText(rec.building);
  const roomId = asText(rec.roomId) || asText(rec.roomid);
  const roomName = asText(rec.roomName) || asText(rec.room) || roomId;

  if (!areaName || !buildingName) return null;
  if (!roomId && !roomName) return null;

  return {
    areaName,
    buildingName,
    // 旧数据可能没有 roomId，用房号兜底（服务端也能按房号解析）
    roomId: roomId || roomName,
    roomName,
    mertype: asText(rec.mertype) || 'yk',
  };
}

/** 读取本地缓存的余额（字段与 `ElectricityBalance` 对齐，缺失字段不写） */
function normalizeBalance(raw: unknown): ElectricityBalance | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const balance = asText(rec.balance) || asText(rec.eledetail);
  if (!balance) return null;

  const out: ElectricityBalance = { balance };
  const detail = asText(rec.detail);
  if (detail) out.detail = detail;
  const accname = asText(rec.accname);
  if (accname) out.accname = accname;
  const displayRoom = asText(rec.displayRoom);
  if (displayRoom) out.displayRoom = displayRoom;
  const status = rec.elestatus;
  if (typeof status === 'number') out.elestatus = status;

  return out;
}

function readRoom(index: number): SavedElectricityRoom | null {
  const direct = normalizeRoom(readJson(ROOM_KEYS[index]));
  if (direct) return direct;

  // 槽位 0 兼容旧版：只写过 chilleast_dorm 的用户，升级后自动迁移过来
  if (index !== 0) return null;
  const legacy = normalizeRoom(readJson(LEGACY_DORM_KEY));
  if (!legacy) return null;
  try {
    localStorage.setItem(ROOM_KEYS[0], JSON.stringify(legacy));
  } catch {
    /* 存储不可用时只影响持久化，不影响本次展示 */
  }
  return legacy;
}

/**
 * 槽位 0 镜像写旧键。
 * `chilleast_dorm` 保持旧版网页端结构（area/building/room/roomId），
 * MainView 的 `fetchElectricity(parsed)` 直接吃这个对象。
 */
function mirrorLegacyDormitory(room: SavedElectricityRoom | null): void {
  try {
    if (!room) {
      localStorage.removeItem(LEGACY_DORM_KEY);
      localStorage.removeItem(LEGACY_DORM_NAME_KEY);
      return;
    }
    localStorage.setItem(
      LEGACY_DORM_KEY,
      JSON.stringify({
        area: room.areaName,
        building: room.buildingName,
        room: room.roomName,
        roomId: room.roomId,
        mertype: room.mertype,
      }),
    );
    localStorage.setItem(LEGACY_DORM_NAME_KEY, dormitoryNameOf(0));
  } catch {
    /* 同上 */
  }
}

// ---------------------------------------------------------------------------
// 展示文本
// ---------------------------------------------------------------------------

/** 「园区 楼栋 房号」；有服务端补的可读房号时优先用它 */
function labelOf(room: SavedElectricityRoom | null, balance: ElectricityBalance | null): string {
  if (!room) return '';
  const parts = [room.areaName, room.buildingName].filter((v) => v !== '');
  const readable = (balance?.displayRoom ?? '').trim();
  const roomText = readable || (HASHED_ROOM_ID.test(room.roomName) ? '所选宿舍' : room.roomName);
  if (roomText) parts.push(roomText);
  return parts.join(' ');
}

function balanceTextOf(balance: ElectricityBalance | null): string {
  const raw = (balance?.balance ?? '').trim();
  if (raw === '') return '--';
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : raw;
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

function createSlot(index: number): ElectricitySlot {
  return {
    index,
    room: null,
    balance: null,
    loading: false,
    error: null,
    label: `宿舍 ${index + 1}（未绑定）`,
    balanceText: '--',
  };
}

/** 两个宿舍槽位（模块级单例，电费页与首页共用） */
export const electricitySlots = ref<ElectricitySlot[]>([createSlot(0), createSlot(1)]);

/** 园区（校区）列表：两个槽位共用，缓存后切页不重复请求 */
export const electricityAreas = ref<ElectricityArea[]>([]);
export const electricityAreasLoading = ref(false);
export const electricityAreasError = ref<string | null>(null);

/** 重新计算槽位的派生展示字段（label / balanceText） */
function syncSlotView(index: number): void {
  const slot = electricitySlots.value[index];
  if (!slot) return;
  slot.label = labelOf(slot.room, slot.balance) || `宿舍 ${index + 1}（未绑定）`;
  slot.balanceText = balanceTextOf(slot.balance);
}

/** 写入绑定；`dirty` 为 false 时表示数据来自云端，不触发回传 */
function persistRoom(index: number, room: SavedElectricityRoom, dirty: boolean): void {
  const previous = normalizeRoom(readJson(ROOM_KEYS[index]));
  try {
    localStorage.setItem(ROOM_KEYS[index], JSON.stringify(room));
    // 换了宿舍，旧余额不再适用
    if (!previous || previous.roomId !== room.roomId) {
      localStorage.removeItem(BALANCE_KEYS[index]);
    }
  } catch {
    /* 存储不可用不影响内存状态 */
  }
  if (index === 0) mirrorLegacyDormitory(room);
  if (dirty) markDirty();
}

function persistBalance(index: number, balance: ElectricityBalance | null): void {
  try {
    if (!balance) {
      localStorage.removeItem(BALANCE_KEYS[index]);
      return;
    }
    localStorage.setItem(BALANCE_KEYS[index], JSON.stringify(balance));
  } catch {
    /* 同上 */
  }
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

/** 已完成的首次加载（幂等用） */
let slotsLoaded = false;
let slotsLoading: Promise<void> | null = null;

/**
 * 读本地绑定 → 并行查两个槽位的余额。
 * 幂等：已加载过直接返回，除非 `force`。
 */
export async function loadElectricitySlots(force = false): Promise<void> {
  if (slotsLoading) return slotsLoading;
  if (slotsLoaded && !force) return;

  slotsLoading = (async () => {
    try {
      for (let index = 0; index < electricitySlots.value.length; index++) {
        const slot = electricitySlots.value[index];
        if (!slot) continue;
        const room = readRoom(index);
        slot.room = room;
        slot.error = null;
        // 先用上次缓存的余额顶上，避免首屏空白
        slot.balance = room ? normalizeBalance(readJson(BALANCE_KEYS[index])) : null;
        syncSlotView(index);
      }

      // 旧键镜像：本地已有绑定但旧键缺失时补齐
      const first = electricitySlots.value[0];
      if (first?.room) mirrorLegacyDormitory(first.room);

      const bound = electricitySlots.value.filter((slot) => slot.room !== null);
      await Promise.all(bound.map((slot) => refreshSlot(slot.index)));
      slotsLoaded = true;
    } finally {
      slotsLoading = null;
    }
  })();

  return slotsLoading;
}

/**
 * 从 localStorage 重新载入两个宿舍槽位的绑定（不发网络请求）。
 *
 * 用途：云端备份写回 `saved_electricity_room` / `saved_electricity_room_2` 之后，
 * 让电费页与首页余额卡立即显示新的宿舍（对应原版 `electricityCacheProvider.refresh()`
 * 在 `BackupProviderRefresh` 里的作用）。余额走 `refreshSlot` 由调用方按需拉取。
 */
export function reloadElectricityRooms(): void {
  for (let index = 0; index < electricitySlots.value.length; index++) {
    const slot = electricitySlots.value[index];
    if (!slot) continue;
    const room = readRoom(index);
    const previousRoomId = slot.room?.roomId ?? '';
    slot.room = room;
    slot.error = null;
    // 换了宿舍，旧余额不再适用；同一间宿舍则保留缓存值
    slot.balance =
      room && room.roomId === previousRoomId
        ? slot.balance
        : room
          ? normalizeBalance(readJson(BALANCE_KEYS[index]))
          : null;
    syncSlotView(index);
  }
  // 让下次 loadElectricitySlots() 重新走一遍网络刷新
  slotsLoaded = false;
}

/** 查询单个槽位的电费余额。失败只写 `slot.error`，不抛。 */
export async function refreshSlot(index: number): Promise<void> {
  const slot = electricitySlots.value[index];
  if (!slot) return;

  const room = slot.room;
  if (!room) {
    slot.balance = null;
    slot.error = null;
    slot.loading = false;
    syncSlotView(index);
    return;
  }

  slot.loading = true;
  slot.error = null;

  try {
    const balance = await fetchElectricity({
      area: room.areaName,
      building: room.buildingName,
      room: room.roomName,
      roomId: room.roomId,
      mertype: room.mertype,
    });
    // 参数不全时服务端回的是区域列表而不是余额，这里按失败处理
    if (typeof balance?.balance !== 'string') {
      throw new Error('余额查询失败');
    }
    slot.balance = balance;
    persistBalance(index, balance);
    // 槽位 0 的旧键展示名：服务端可能刚补上可读房号，同步刷新一次
    if (index === 0) mirrorLegacyDormitory(room);
  } catch (e) {
    slot.error = (e as Error)?.message || '余额查询失败';
  } finally {
    slot.loading = false;
    syncSlotView(index);
  }
}

/** 绑定宿舍到槽位：落盘 → 标记待同步 → 立刻查余额 */
export async function selectRoom(index: number, room: SavedElectricityRoom): Promise<void> {
  const slot = electricitySlots.value[index];
  if (!slot) return;

  slot.room = room;
  slot.balance = null;
  slot.error = null;
  syncSlotView(index);

  persistRoom(index, room, true);
  await refreshSlot(index);
}

/** 清除槽位绑定（房间与余额一起清） */
export async function clearSlot(index: number): Promise<void> {
  const slot = electricitySlots.value[index];
  if (!slot) return;

  try {
    localStorage.removeItem(ROOM_KEYS[index]);
    localStorage.removeItem(BALANCE_KEYS[index]);
  } catch {
    /* 存储不可用不影响内存状态 */
  }
  if (index === 0) mirrorLegacyDormitory(null);

  slot.room = null;
  slot.balance = null;
  slot.error = null;
  slot.loading = false;
  syncSlotView(index);

  markDirty();
}

/**
 * 应用云端备份里的宿舍绑定（槽位 0）。
 * 数据来自云端，因此不 markDirty，避免刚拉下来又推回去。
 */
export function applyCloudDormitory(dorm: CloudDormitoryInfo | null): void {
  if (!dorm) return;

  const name =
    (dorm.fullName ?? '').trim() ||
    [dorm.areaName, dorm.buildingName, dorm.roomName]
      .map((v) => (v ?? '').trim())
      .filter((v) => v !== '')
      .join(' ');
  if (name !== '') {
    try {
      localStorage.setItem(LEGACY_DORM_NAME_KEY, name);
    } catch {
      /* 同上 */
    }
  }

  const room = normalizeRoom({
    areaName: dorm.areaName,
    buildingName: dorm.buildingName,
    roomId: dorm.roomId,
    roomName: dorm.roomName,
    mertype: 'yk',
  });
  if (!room) return;

  const current = electricitySlots.value[0]?.room;
  if (current && current.areaName === room.areaName && current.roomId === room.roomId) {
    // 同一间宿舍，只刷新余额
    void refreshSlot(0);
    return;
  }

  const slot = electricitySlots.value[0];
  if (slot) {
    slot.room = room;
    slot.balance = null;
    slot.error = null;
    syncSlotView(0);
  }
  persistRoom(0, room, false);
  void refreshSlot(0);
}

/** 槽位的宿舍名（「园区 楼栋 房号」），未绑定返回空串 */
export function dormitoryNameOf(index: number): string {
  const slot = electricitySlots.value[index];
  const room = slot?.room ?? null;
  if (room) {
    // 服务端补的可读房号优先；房号本身是 32 位哈希时退化成「所选宿舍」
    const readable = (slot?.balance?.displayRoom ?? '').trim();
    const roomText = readable || (HASHED_ROOM_ID.test(room.roomName) ? '所选宿舍' : room.roomName);
    return [room.areaName, room.buildingName, roomText].filter((v) => v !== '').join(' ');
  }
  if (index === 0) {
    try {
      return localStorage.getItem(LEGACY_DORM_NAME_KEY) ?? '';
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * 拉取园区（校区）列表。
 * 两个槽位共用一份，失败只写 `electricityAreasError`，不抛。
 */
export async function loadElectricityAreas(force = false): Promise<void> {
  if (electricityAreasLoading.value) return;
  if (!force && electricityAreas.value.length > 0) return;

  electricityAreasLoading.value = true;
  electricityAreasError.value = null;
  try {
    const list = await fetchElectricityAreas();
    electricityAreas.value = Array.isArray(list) ? list : [];
  } catch (e) {
    electricityAreas.value = [];
    electricityAreasError.value = (e as Error)?.message || '加载失败';
  } finally {
    electricityAreasLoading.value = false;
  }
}
