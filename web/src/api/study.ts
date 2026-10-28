import { apiRequest } from './client';

export interface HomeworkItem {
  id: string;
  title: string;
  courseName: string;
  status: string;
  statusCode: string;
  endTime: string | null;
  endTimeLocal: string | null;
  rawTimeStr: string;
  dataUrl?: string;
  isManual?: boolean;
  remarks?: string;
}

export async function fetchHomework(status = 'pending'): Promise<HomeworkItem[]> {
  return await apiRequest<HomeworkItem[]>(`/api/study/homework?status=${status}`);
}
