/**
 * 首页信息流区块的共享类型
 *
 * 区块组件只负责展示，数据由 HomeView 计算好后通过 props 传入。
 * 图书馆 / 请假 / 报修 / 问卷四类数据暂未接入 MainView，
 * 组件接口先按真实接口的字段预留，接线时直接传数组即可。
 */

/** 今日日程里的一节课（由课表推导） */
export interface AgendaCourse {
  name: string;
  classroom: string;
  /** 已格式化好的时段，如 08:00-09:35 */
  time: string;
  /** 课程色，作为卡片纯色填充（白字压在上面） */
  color: string;
}

/** 今日日程里的一场考试 */
export interface AgendaExam {
  title: string;
  location: string;
  time: string;
  status: string;
}

/** 今日日程里的一条作业（只放今天截止的） */
export interface AgendaHomework {
  id: string;
  title: string;
  /** 已格式化好的副标题，如「《形势与政策5》· 截止 23:59」 */
  subtitle: string;
}

