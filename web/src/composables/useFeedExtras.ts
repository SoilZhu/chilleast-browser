/**
 * 首页信息流的附属数据
 *
 * 首页有 8 个可配置区块（见 `@/stores/appearance` 的 FEED_SECTIONS），
 * 其中课表/作业/余额/通知的数据由 MainView 已经加载好了；
 * 这里补齐另外三个：图书馆预约、请假、报修、问卷。
 *
 * 单独抽出来的原因：这些接口都比较慢，不应该拖慢首屏，
 * 也不应该因为某一个失败就影响其他区块。
 */
import { ref } from 'vue';
import { fetchLibrarySeats, type SeatReserveItem } from '../api/library';
import { fetchLeaveList, type LeaveRecord, fetchQuestionnaireList, type QuestionnaireItem } from '../api/xgxt';
import { fetchRepairOrders, type RepairOrder } from '../api/services';

/** 当前生效的图书馆座位预约 */
export const libraryReserves = ref<SeatReserveItem[]>([]);
/** 进行中的请假单 */
export const leaveRecords = ref<LeaveRecord[]>([]);
/** 处理中的报修工单 */
export const repairOrders = ref<RepairOrder[]>([]);
/** 未完成的问卷 */
export const questionnaires = ref<QuestionnaireItem[]>([]);

/** 各区块是否已尝试加载过（避免空数组被误判为「加载中」） */
export const feedLoaded = ref({
  library: false,
  leave: false,
  repair: false,
  questionnaire: false,
});

/**
 * 拉取所有信息流附属数据。
 * 每个请求独立 catch —— 单个失败不影响其他区块。
 */
export async function loadFeedExtras(): Promise<void> {
  const tasks: Array<Promise<void>> = [
    fetchLibrarySeats()
      .then((res) => {
        const cur = res?.index?.curReserves ?? [];
        libraryReserves.value = Array.isArray(cur) ? cur : [];
      })
      .catch(() => {
        libraryReserves.value = [];
      })
      .finally(() => {
        feedLoaded.value.library = true;
      }),

    fetchLeaveList()
      .then((list) => {
        leaveRecords.value = Array.isArray(list) ? list : [];
      })
      .catch(() => {
        leaveRecords.value = [];
      })
      .finally(() => {
        feedLoaded.value.leave = true;
      }),

    fetchRepairOrders(true)
      .then((list) => {
        repairOrders.value = Array.isArray(list) ? list : [];
      })
      .catch(() => {
        repairOrders.value = [];
      })
      .finally(() => {
        feedLoaded.value.repair = true;
      }),

    fetchQuestionnaireList()
      .then((list) => {
        questionnaires.value = Array.isArray(list) ? list : [];
      })
      .catch(() => {
        questionnaires.value = [];
      })
      .finally(() => {
        feedLoaded.value.questionnaire = true;
      }),
  ];

  await Promise.all(tasks);
}
