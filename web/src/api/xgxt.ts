import { apiRequest } from './client';

// ===========================================================================
// 请假申请
// 协议对齐 ChillEast 客户端 lib/features/leave/
// ===========================================================================

export interface LeaveRecord {
  id: string;
  typeName: string;
  startTime: string;
  endTime: string;
  days: number;
  hours: number;
  reason: string;
  auditStatus: string;
  auditStatusName: string;
  auditResultName: string;
  hasFile: boolean;
  /** 服务端语义化状态：待审核 / 审核中 / 已审核·同意 */
  statusLabel: string;
  /** 仅待审核可撤销 */
  canDelete: boolean;
}

export interface LeaveDictItem {
  id: string;
  name: string;
}

export interface LeaveDuration {
  days: number;
  hours: number;
}

export async function fetchLeaveList(): Promise<LeaveRecord[]> {
  return await apiRequest<LeaveRecord[]>('/api/xgxt/leave');
}

export async function fetchLeaveTypes(): Promise<LeaveDictItem[]> {
  return await apiRequest<LeaveDictItem[]>('/api/xgxt/leave/types');
}

export async function fetchLeaveDuration(start: string, end: string): Promise<LeaveDuration> {
  const q = new URLSearchParams({ start, end }).toString();
  return await apiRequest<LeaveDuration>(`/api/xgxt/leave/duration?${q}`);
}

export interface LeaveAttachment {
  filename: string;
  /** 纯 base64（可含 data URL 前缀，服务端会剥掉） */
  contentBase64: string;
  contentType: string;
}

export async function submitLeave(
  fields: Record<string, string>,
  attachment?: LeaveAttachment,
): Promise<{ submitted: boolean }> {
  return await apiRequest('/api/xgxt/leave', {
    method: 'POST',
    body: JSON.stringify({ fields, attachment }),
  });
}

export async function deleteLeave(id: string): Promise<{ deleted: boolean }> {
  return await apiRequest('/api/xgxt/leave/delete', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

// ===========================================================================
// 学工问卷
// 协议对齐 ChillEast 客户端 lib/features/questionnaire/
// ===========================================================================

export interface QuestionnaireItem {
  dm: string;
  title: string;
  startTime: string;
  endTime: string;
  taskTimeM: string;
  doneInd: string;
  flag: string;
  zt: string;
  shzt: string;
  /** 已提交 / 已截止 / 待填写 */
  statusLabel: string;
  isSubmitted: boolean;
  isExpired: boolean;
}

export interface QuestionnaireOption {
  dm: string;
  name: string;
}

export interface QuestionnaireQuestion {
  dm: string;
  title: string;
  desc: string;
  /** 1=单选 2=多选 4=填空 */
  stType: string;
  /** 填空细分：1=文本 2=数字/电话 3/4=日期 */
  txType: string;
  required: boolean;
  options: QuestionnaireOption[];
  answer: string;
}

export interface QuestionnaireDetail {
  dm: string;
  title: string;
  desc: string;
  jgM: string;
  canSubmit: boolean;
  questions: QuestionnaireQuestion[];
}

export async function fetchQuestionnaireList(): Promise<QuestionnaireItem[]> {
  return await apiRequest<QuestionnaireItem[]>('/api/xgxt/questionnaires');
}

export async function fetchQuestionnaireDetail(taskTimeM: string): Promise<QuestionnaireDetail> {
  const q = new URLSearchParams({ taskTime: taskTimeM }).toString();
  return await apiRequest<QuestionnaireDetail>(`/api/xgxt/questionnaires/detail?${q}`);
}

export async function submitQuestionnaire(
  taskTimeM: string,
  answers: Record<string, string | string[]>,
): Promise<{ submitted: boolean }> {
  return await apiRequest('/api/xgxt/questionnaires/submit', {
    method: 'POST',
    body: JSON.stringify({ taskTime: taskTimeM, answers }),
  });
}

// ===========================================================================
// 展示用工具
// ===========================================================================

/** 时长文案：`7天5小时` */
export function formatDuration(days: number, hours: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  return parts.length > 0 ? parts.join('') : '';
}

/** 请假状态 → MD2 chip 类名 */
export function leaveStatusChip(record: LeaveRecord): string {
  if (record.auditStatus === '0') return 'md-chip-warning';
  if (record.auditStatus === '8') return 'md-chip-info';
  if (record.auditStatus === '9') {
    if (record.auditResultName.includes('同意') || record.auditResultName.includes('通过')) {
      return 'md-chip-success';
    }
    return 'md-chip-danger';
  }
  return 'md-chip-neutral';
}

/** 问卷状态 → MD2 chip 类名 */
export function questionnaireStatusChip(item: QuestionnaireItem): string {
  if (item.isSubmitted) return 'md-chip-success';
  if (item.isExpired) return 'md-chip-neutral';
  return 'md-chip-warning';
}

/** 日期部分：`2026-03-16 08:00:00` → `2026-03-16` */
export function dateOnly(value: string): string {
  if (!value) return '';
  return value.split(' ')[0] ?? value;
}
