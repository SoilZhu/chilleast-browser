import { apiRequest } from './client';
import { storage } from '../utils/storage';

export interface CloudiskItem {
  id: string | number;
  name: string;
  size?: number | string;
  filesize?: number | string;
  createtime?: string | number;
  suffix?: string;
  resid?: string;
  encryptedId?: string;
  folderId?: string;
  isFolder?: boolean;
}

export interface CloudiskListResponse {
  rootDirId: string;
  currentFolderId: string;
  totalCount: number;
  files: CloudiskItem[];
}

export async function fetchCloudiskFiles(folderId = '', page = 1): Promise<CloudiskListResponse> {
  const q = new URLSearchParams({ folderId, page: String(page) }).toString();
  return await apiRequest<CloudiskListResponse>(`/api/study/cloudisk/files?${q}`);
}

export async function uploadCloudiskFile(
  filename: string,
  contentBase64: string,
  folderId = '',
): Promise<{ resid: string; encryptedId: string }> {
  return await apiRequest('/api/study/cloudisk/upload', {
    method: 'POST',
    body: JSON.stringify({ filename, contentBase64, folderId }),
  });
}

export function getCloudiskDownloadUrl(resid: string, encryptedId: string, folderId = '', filename = ''): string {
  const token = storage.getToken() || '';
  const q = new URLSearchParams({
    resid,
    encryptedId,
    folderId,
    filename,
    token,
  }).toString();
  return `/api/study/cloudisk/download?${q}`;
}

export interface CloudBackupData {
  fileName: string;
  slot: string;
  stamp?: string;
  exportedAt?: string;
  dormitory?: {
    areaName?: string;
    buildingName?: string;
    roomName?: string;
    areaId?: string;
    buildingId?: string;
    roomId?: string;
    fullName?: string;
  } | null;
  timetableRules?: any[];
  manualHomework?: any[];
  customCourseColors?: Record<string, string>;
  /** 仲裁后实际采用的轨道（对应 Worker 的 readLatestBackup().format） */
  format?: 'modern' | 'legacy';
  /**
   * 拉取仲裁结果（SYNC-ALIGN 4.2）。
   * Worker 侧已经做完三分支仲裁，前端只需按 branch 决定要不要二次合并。
   */
  arbitration?: {
    /** 'modern' 只拉现代轨 | 'legacy-only' 仅兼容轨 | 'merged' 两轨已合并 */
    branch: 'modern' | 'legacy-only' | 'merged';
    /** 实际参与的文件名（合并分支有两个） */
    sources: string[];
    modern: string | null;
    legacy: string | null;
  };
  /** 云端每轨当前保留的份数（对齐原版每轨保留 3 份） */
  retained?: {
    keepCount: number;
    modern: number;
    legacy: number;
  };
  data: any;
}

export async function getCloudBackup(): Promise<CloudBackupData | null> {
  return await apiRequest<CloudBackupData | null>('/api/study/cloudisk/backup');
}

export async function saveCloudBackup(
  payload: any,
): Promise<{ success: boolean; fileName: string; format?: string; pruned?: string[]; message: string }> {
  return await apiRequest('/api/study/cloudisk/backup', {
    method: 'POST',
    body: JSON.stringify({ payload }),
  });
}
