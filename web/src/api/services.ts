import { apiRequest } from './client';

// ---- 阳光服务 ----
export interface SunshineDepartment {
  code: string;
  name: string;
}

export interface SunshineIdentity {
  name: string;
  cardCode: string;
}

export interface SunshineFormResponse {
  identity: SunshineIdentity;
  departments: SunshineDepartment[];
}

export interface SunshineLetter {
  id: string;
  title: string;
  department: string;
  type: string;
  date: string;
  status: string;
  statusLabel: string;
}

export interface SunshineStatistics {
  total: string;
  processing: string;
  completed: string;
}

export interface SunshineLettersResponse {
  letters: SunshineLetter[];
  statistics: SunshineStatistics;
}

export interface SunshineTicketDetail {
  id: string;
  title: string;
  submitter: string;
  department: string;
  handlingDepartment: string;
  finishTime: string;
  status: string;
  content: string;
  reply: string;
  type: string;
}

export async function fetchSunshineDepartments(): Promise<SunshineFormResponse> {
  return await apiRequest<SunshineFormResponse>('/api/campus/sunshine/departments');
}

export async function fetchSunshineLetters(): Promise<SunshineLettersResponse> {
  return await apiRequest<SunshineLettersResponse>('/api/campus/sunshine/letters');
}

export async function fetchSunshineDetail(id: string): Promise<{ detail: SunshineTicketDetail | null }> {
  return await apiRequest<{ detail: SunshineTicketDetail | null }>(
    `/api/campus/sunshine/detail?id=${encodeURIComponent(id)}`,
  );
}

export async function submitSunshineLetter(payload: {
  title: string;
  content: string;
  type: string;
  departmentCode: string;
  phone?: string;
  email?: string;
  finishTime?: string;
}): Promise<any> {
  return await apiRequest('/api/campus/sunshine/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---- 报修平台 ----
export interface RepairOrder {
  id: string;
  code: string;
  title: string;
  catalog: string;
  department: string;
  status: string;
  createdAt: string | null;
  description: string;
}

export interface RepairCatalog {
  id: string;
  title: string;
  subtitle: string;
  department: string;
  processId: string;
}

export async function fetchRepairOrders(ongoing = true, page = 1): Promise<RepairOrder[]> {
  return await apiRequest<RepairOrder[]>(
    `/api/campus/repair/orders?ongoing=${ongoing}&page=${page}`,
  );
}

export async function fetchRepairCatalogs(): Promise<RepairCatalog[]> {
  return await apiRequest<RepairCatalog[]>('/api/campus/repair/catalogs');
}

export async function fetchRepairDetail(orderId: string): Promise<any> {
  return await apiRequest(`/api/campus/repair/orders/detail?id=${encodeURIComponent(orderId)}`);
}

export async function cancelRepairOrder(orderId: string, reason = '申请取消'): Promise<any> {
  return await apiRequest('/api/campus/repair/cancel', {
    method: 'POST',
    body: JSON.stringify({ orderId, reason }),
  });
}

export async function submitRepairOrder(payload: {
  catalog?: string;
  title?: string;
  description: string;
  location?: string;
  phone?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  imageBase64?: string;
  imageName?: string;
}): Promise<any> {
  return await apiRequest('/api/campus/repair/submit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
