import { timetableStorage } from './timetableStorage';

const TOKEN_KEY = 'chilleast_token';
const SESSION_KEY = 'chilleast_client_session';
const STUDENT_KEY = 'chilleast_student';
const SCORES_KEY = 'chilleast_scores';

export { timetableStorage };

export interface StudentInfo {
  username: string;
  realName: string;
  userId?: string;
}

export const storage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },
  removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  getSession(): string | null {
    return localStorage.getItem(SESSION_KEY);
  },
  setSession(session: string): void {
    localStorage.setItem(SESSION_KEY, session);
  },
  removeSession(): void {
    localStorage.removeItem(SESSION_KEY);
  },

  getStudent(): StudentInfo | null {
    const raw = localStorage.getItem(STUDENT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setStudent(student: StudentInfo): void {
    localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
  },
  removeStudent(): void {
    localStorage.removeItem(STUDENT_KEY);
  },

  getCachedTimetable(week: number): any | null {
    return timetableStorage.getCachedTimetable(week);
  },
  setCachedTimetable(week: number, data: any): void {
    timetableStorage.setCachedTimetable(week, data);
  },

  getFullTimetable(): any | null {
    return timetableStorage.getFullTimetable();
  },
  setFullTimetable(data: any): void {
    timetableStorage.setFullTimetable(data);
  },

  hasLocalTimetable(): boolean {
    return timetableStorage.hasLocalTimetable();
  },
  deleteLocalTimetable(): void {
    timetableStorage.deleteLocalTimetable();
  },

  getCachedScores(): any | null {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // 清除旧版本格式或异常缓存
      if (parsed && Array.isArray(parsed.data) && !parsed.courses) {
        localStorage.removeItem(SCORES_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },
  setCachedScores(data: any): void {
    if (data && Array.isArray(data.courses) && data.courses.length > 0) {
      localStorage.setItem(SCORES_KEY, JSON.stringify(data));
    }
  },
  removeCachedScores(): void {
    localStorage.removeItem(SCORES_KEY);
  },

  clearAll(): void {
    localStorage.clear();
  },
};
