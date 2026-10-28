import { apiRequest } from './client';
import { storage, type StudentInfo } from '../utils/storage';

export interface LoginResponse {
  token: string;
  student: StudentInfo;
}

export async function login(oaId: string, oaKey: string): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ oaId, oaKey }),
  });
  if (data?.token) {
    storage.setToken(data.token);
    if (data.student) storage.setStudent(data.student);
  }
  return data;
}

export async function fetchProfile(): Promise<StudentInfo> {
  return await apiRequest<StudentInfo>('/api/auth/profile');
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    storage.removeToken();
    storage.removeStudent();
  }
}
