/**
 * 界面语言（对应原版 App 的 locale_provider.dart）
 *
 * 原版用 Flutter l10n（app_*.arb）做全量翻译。网页版为控制体积，
 * 只翻译**界面框架层**的高频文案（导航、设置项、按钮、空状态），
 * 业务数据（课程名、通知标题、工单描述）保持服务端原文。
 *
 * 未在字典中命中的 key 一律回退到简体中文，保证任何语言下界面都不会出现占位符。
 */
import { computed, ref } from 'vue';

const LANG_KEY = 'app_language_code';

export type LangCode =
  | 'system'
  | 'zh'
  | 'en'
  | 'zh_HK'
  | 'zh_TW'
  | 'ja'
  | 'es'
  | 'fr'
  | 'pt'
  | 'ru'
  | 'yue';

export interface LangOption {
  code: LangCode;
  label: string;
  /** 该语言在 BCP-47 里的写法，用于 Intl */
  locale: string;
}

export const LANGUAGES: LangOption[] = [
  { code: 'system', label: '跟随系统', locale: 'zh-CN' },
  { code: 'zh', label: '简体中文', locale: 'zh-CN' },
  { code: 'en', label: 'English', locale: 'en' },
  { code: 'zh_HK', label: '繁体中文（中国香港）', locale: 'zh-HK' },
  { code: 'zh_TW', label: '繁体中文（中国台湾）', locale: 'zh-TW' },
  { code: 'ja', label: '日语', locale: 'ja' },
  { code: 'es', label: '西班牙语', locale: 'es' },
  { code: 'fr', label: '法语', locale: 'fr' },
  { code: 'pt', label: '葡萄牙语', locale: 'pt' },
  { code: 'ru', label: '俄语', locale: 'ru' },
  { code: 'yue', label: '粤语（广州话）', locale: 'zh-HK' },
];

function detectSystem(): LangCode {
  const nav = navigator.language || 'zh-CN';
  if (nav.startsWith('zh-TW') || nav.startsWith('zh-Hant')) return 'zh_TW';
  if (nav.startsWith('zh-HK')) return 'zh_HK';
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('en')) return 'en';
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('es')) return 'es';
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('pt')) return 'pt';
  if (nav.startsWith('ru')) return 'ru';
  return 'zh';
}

export const currentLang = ref<LangCode>(
  (localStorage.getItem(LANG_KEY) as LangCode) || 'system',
);

/** 实际生效的语言（system 时按浏览器推导） */
export const resolvedLang = computed<LangCode>(() =>
  currentLang.value === 'system' ? detectSystem() : currentLang.value,
);

export const currentLocale = computed(() => {
  const found = LANGUAGES.find((l) => l.code === resolvedLang.value);
  return found?.locale ?? 'zh-CN';
});

export function setLanguage(code: LangCode) {
  currentLang.value = code;
  localStorage.setItem(LANG_KEY, code);
  document.documentElement.lang = code === 'system' ? navigator.language : code;
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? LANGUAGES[0].label;
}

// ---------------------------------------------------------------------------
// 字典
// ---------------------------------------------------------------------------

type Dict = Record<string, string>;

const zh: Dict = {
  // 导航
  'nav.home': '首页',
  'nav.timetable': '课表',
  'nav.homework': '作业',
  'nav.notice': '通知',
  'nav.functions': '功能',
  'nav.settings': '设置',
  'nav.profile': '个人中心',
  'nav.logout': '退出登录',
  'group.study': '学习',
  'group.life': '生活',
  'group.settings': '设置',
  // 通用
  'common.refresh': '刷新',
  'common.retry': '重试',
  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.save': '保存',
  'common.delete': '删除',
  'common.close': '关闭',
  'common.more': '全部',
  'common.loading': '加载中…',
  'common.search': '搜索…',
  // 设置
  'settings.language': '语言',
  'settings.agent': 'Agent',
  'settings.appearance': '外观',
  'settings.widget': '小组件',
  'settings.notification': '通知',
  'settings.timetable': '课表',
  'settings.data': '数据',
  // 常用空状态
  'empty.noData': '暂无数据',
  'empty.noNotice': '暂无通知',
  'empty.noHomework': '暂无待办作业',
  'empty.noExam': '本学期暂无考试安排',
  'empty.noScore': '本学期暂无成绩数据',
  // 提醒
  'notify.courseReminder': '上课提醒',
  'notify.homeworkReminder': '作业截止提醒',
  'notify.libraryReminder': '图书馆预约提醒',
};

const en: Dict = {
  'nav.home': 'Home',
  'nav.timetable': 'Timetable',
  'nav.homework': 'Homework',
  'nav.notice': 'Notices',
  'nav.functions': 'Services',
  'nav.settings': 'Settings',
  'nav.profile': 'Profile',
  'nav.logout': 'Sign out',
  'group.study': 'Study',
  'group.life': 'Life',
  'group.settings': 'Settings',
  'common.refresh': 'Refresh',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.confirm': 'OK',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.more': 'All',
  'common.loading': 'Loading…',
  'common.search': 'Search…',
  'settings.language': 'Language',
  'settings.agent': 'Agent',
  'settings.appearance': 'Appearance',
  'settings.widget': 'Widgets',
  'settings.notification': 'Notifications',
  'settings.timetable': 'Timetable',
  'settings.data': 'Data',
  'empty.noData': 'No data',
  'empty.noNotice': 'No notices',
  'empty.noHomework': 'No pending homework',
  'empty.noExam': 'No exams this semester',
  'empty.noScore': 'No scores this semester',
  'notify.courseReminder': 'Class reminder',
  'notify.homeworkReminder': 'Homework reminder',
  'notify.libraryReminder': 'Library reminder',
};

const zhTW: Dict = {
  'nav.home': '首頁',
  'nav.timetable': '課表',
  'nav.homework': '作業',
  'nav.notice': '通知',
  'nav.functions': '功能',
  'nav.settings': '設定',
  'nav.profile': '個人中心',
  'nav.logout': '登出',
  'group.study': '學習',
  'group.life': '生活',
  'group.settings': '設定',
  'common.refresh': '重新整理',
  'common.retry': '重試',
  'common.cancel': '取消',
  'common.confirm': '確定',
  'common.save': '儲存',
  'common.delete': '刪除',
  'common.close': '關閉',
  'common.more': '全部',
  'common.loading': '載入中…',
  'common.search': '搜尋…',
  'settings.language': '語言',
  'settings.appearance': '外觀',
  'settings.notification': '通知',
  'settings.timetable': '課表',
  'settings.data': '資料',
  'empty.noNotice': '暫無通知',
  'empty.noHomework': '暫無待辦作業',
  'empty.noExam': '本學期暫無考試安排',
  'empty.noScore': '本學期暫無成績資料',
};

const ja: Dict = {
  'nav.home': 'ホーム',
  'nav.timetable': '時間割',
  'nav.homework': '課題',
  'nav.notice': 'お知らせ',
  'nav.functions': '機能',
  'nav.settings': '設定',
  'nav.profile': 'マイページ',
  'nav.logout': 'ログアウト',
  'common.refresh': '更新',
  'common.retry': '再試行',
  'common.cancel': 'キャンセル',
  'common.confirm': 'OK',
  'common.save': '保存',
  'common.close': '閉じる',
  'common.loading': '読み込み中…',
  'common.search': '検索…',
  'settings.language': '言語',
  'settings.appearance': '外観',
  'settings.notification': '通知',
  'settings.timetable': '時間割',
  'settings.data': 'データ',
};

const DICTS: Record<string, Dict> = {
  zh,
  en,
  zh_TW: zhTW,
  zh_HK: zhTW,
  yue: zhTW,
  ja,
  // 西/法/葡/俄：仅覆盖最核心的框架文案，未命中的回退中文
  es: {
    'nav.home': 'Inicio',
    'nav.timetable': 'Horario',
    'nav.settings': 'Ajustes',
    'common.refresh': 'Actualizar',
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
  },
  fr: {
    'nav.home': 'Accueil',
    'nav.timetable': 'Emploi du temps',
    'nav.settings': 'Paramètres',
    'common.refresh': 'Actualiser',
    'common.cancel': 'Annuler',
    'common.save': 'Enregistrer',
  },
  pt: {
    'nav.home': 'Início',
    'nav.timetable': 'Horário',
    'nav.settings': 'Configurações',
    'common.refresh': 'Atualizar',
    'common.cancel': 'Cancelar',
    'common.save': 'Salvar',
  },
  ru: {
    'nav.home': 'Главная',
    'nav.timetable': 'Расписание',
    'nav.settings': 'Настройки',
    'common.refresh': 'Обновить',
    'common.cancel': 'Отмена',
    'common.save': 'Сохранить',
  },
};

/** 取词：未命中回退简体中文 */
export function t(key: string): string {
  const dict = DICTS[resolvedLang.value] ?? zh;
  return dict[key] ?? zh[key] ?? key;
}

/** 模板里用的响应式取词函数 */
export function useT() {
  return (key: string) => t(key);
}
