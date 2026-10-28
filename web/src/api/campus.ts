import { apiRequest } from './client';

// ---------------------------------------------------------------------------
// 校园卡
// ---------------------------------------------------------------------------

export interface CardInfo {
  name: string;
  idserial: string;
  cardno: string;
  balance: number;
  status: string;
}

export interface CardTransaction {
  merchantName: string;
  tradeTime: string;
  tradeAmount: number;
  cardBalance: number;
}

export interface PaymentCodeData {
  /** 付款码数字串 */
  code: string;
  /** 二维码 PNG 的 data URL */
  qrDataUrl: string | null;
  /** 卡片信息（姓名 / 学号 / 余额） */
  card: { name: string; idserial: string; balance: string } | null;
}

export async function fetchCardInfo(): Promise<CardInfo> {
  return await apiRequest<CardInfo>('/api/campus/card');
}

export async function fetchCardRecords(days = 7): Promise<CardTransaction[]> {
  return await apiRequest<CardTransaction[]>(`/api/campus/card/records?days=${days}`);
}

export async function fetchPaymentCode(): Promise<PaymentCodeData> {
  return await apiRequest<PaymentCodeData>('/api/campus/card/payment-code');
}

// ---------------------------------------------------------------------------
// 宿舍电费（走校园卡余额支付，对齐原版 ElectricityService）
// ---------------------------------------------------------------------------

export interface ElectricityArea {
  id: string;
  name: string;
}

export interface ElectricityBuilding {
  id: string;
  name: string;
}

export interface ElectricityRoom {
  id: string;
  name: string;
  /** yk = 预付费表，rt = 实时表；查余额与下单都必须带上 */
  mertype: string;
}

export interface ElectricityBalance {
  balance: string;
  detail?: string;
  accname?: string;
  elestatus?: number | null;
  /** 服务端补的可读房号（房间只有 32 位哈希 ID 时由 Worker 反解） */
  displayRoom?: string;
}

/** 一个宿舍槽位的绑定（原版最多 2 个槽位 —— 双宿舍） */
export interface SavedElectricityRoom {
  areaName: string;
  buildingName: string;
  roomId: string;
  roomName: string;
  mertype: string;
}

export async function fetchElectricity(params: {
  area?: string;
  building?: string;
  room?: string;
  roomId?: string;
  mertype?: string;
}): Promise<ElectricityBalance> {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return await apiRequest<ElectricityBalance>(`/api/campus/electricity${q ? `?${q}` : ''}`);
}

export async function fetchElectricityAreas(): Promise<ElectricityArea[]> {
  return await apiRequest<ElectricityArea[]>('/api/campus/electricity/areas');
}

export async function fetchElectricityBuildings(areaName: string): Promise<ElectricityBuilding[]> {
  return await apiRequest<ElectricityBuilding[]>(
    `/api/campus/electricity/buildings?areaName=${encodeURIComponent(areaName)}`,
  );
}

export async function fetchElectricityRooms(
  areaName: string,
  buildingName: string,
): Promise<ElectricityRoom[]> {
  return await apiRequest<ElectricityRoom[]>(
    `/api/campus/electricity/rooms?areaName=${encodeURIComponent(areaName)}&buildingName=${encodeURIComponent(buildingName)}`,
  );
}

export interface ElectricityPreOrderPayload {
  areaName: string;
  buildingName: string;
  roomId: string;
  roomName?: string;
  mertype: string;
  /** 整数元，1–1000（与原版 _handleCampusCardRecharge 的校验一致） */
  amount: number;
}

export interface ElectricityPreOrderResult {
  success: boolean;
  message: string;
  resultData: Record<string, unknown>;
}

/**
 * 用校园卡余额给宿舍电费充值。
 *
 * 服务端走 `elepay/createPreThirdTrade`（payWay=2，直接从校园卡扣款），
 * **有真实副作用**，调用前必须先让用户确认。
 */
export async function createElectricityPreOrder(
  payload: ElectricityPreOrderPayload,
): Promise<ElectricityPreOrderResult> {
  return await apiRequest<ElectricityPreOrderResult>('/api/campus/electricity/preorder', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// 通知公告（超星学习通，游标分页 —— 与原版 notice_provider 完全一致）
//
// 原版是「往下滑到距底部 200px 时自动 loadMore」，游标是上一页返回的
// `notices.lastGetId`；hasMore 由该字段是否非空决定，没有页码概念。
// ---------------------------------------------------------------------------

export interface NoticeItem {
  uuid: string;
  idCode: string;
  title: string;
  content: string;
  /** 发布人（原版 createrName） */
  sender: string;
  /** `yyyy-MM-dd HH:mm`，与原版 sendTime 同格式 */
  date: string;
  sentAt: string;
  isRead: boolean;
}

export interface NoticePage {
  list: NoticeItem[];
  /** 下一页游标；空串表示没有更多 */
  lastGetId: string;
  hasMore: boolean;
}

/**
 * 拉取一页通知。
 * @param lastValue 上一页返回的 lastGetId；第一页传空串
 */
export async function fetchNotices(lastValue = '', size = 20): Promise<NoticePage> {
  const q = new URLSearchParams({ lastValue, size: String(size) }).toString();
  const data = await apiRequest<NoticePage>(`/api/campus/notices?${q}`);
  // 兼容服务端直接回数组的老结构
  if (Array.isArray(data)) {
    return { list: data as unknown as NoticeItem[], lastGetId: '', hasMore: false };
  }
  return {
    list: Array.isArray(data?.list) ? data.list : [],
    lastGetId: typeof data?.lastGetId === 'string' ? data.lastGetId : '',
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchNoticeDetail(uuid: string): Promise<any> {
  return await apiRequest(`/api/campus/notices/detail?uuid=${encodeURIComponent(uuid)}`);
}

// ---------------------------------------------------------------------------
// 我的宿舍（对齐原版 DormitoryService，来自学生公寓服务平台 gy.hunau.edu.cn）
// ---------------------------------------------------------------------------

export interface DormitoryField {
  code: string;
  label: string;
  value: string;
}

export interface DormitoryInfo {
  isAssigned: boolean;
  building?: string;
  unit?: string;
  floor?: string;
  room?: string;
  bed?: string;
  academicYear?: string;
  termCode?: string;
  termName?: string;
  formattedRoom: string;
  formattedBed?: string;
  fullAddress: string;
  fields: DormitoryField[];
}

/**
 * 拉取学生公寓宿舍/床位信息。
 * @param forceRefresh 是否强制重新走 OAuth 授权刷新
 */
export async function fetchDormitoryInfo(forceRefresh = false): Promise<DormitoryInfo> {
  const query = forceRefresh ? '?force=true' : '';
  return await apiRequest<DormitoryInfo>(`/api/campus/dormitory${query}`);
}

