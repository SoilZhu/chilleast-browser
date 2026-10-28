<template>
  <!-- ===================================================================
       交易流水（对应 App 的 transaction_history_screen.dart）
       时间范围筛选 + 汇总卡 + 流水表格
       =================================================================== -->
  <div class="space-y-5">
    <PageHeader title="交易流水" subtitle="校园卡消费与充值记录">
      <template #actions>
        <button class="md-btn-outlined" :disabled="loading" @click="load">
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
          刷新
        </button>
      </template>
    </PageHeader>

    <!-- 时间范围筛选 -->
    <div class="md-tabs">
      <button
        v-for="opt in RANGE_OPTIONS"
        :key="opt.days"
        :class="days === opt.days ? 'md-tab-active' : 'md-tab'"
        @click="setRange(opt.days)"
      >
        <span>{{ opt.label }}</span>
      </button>
    </div>

    <!-- 汇总指标组：一组数字并排、竖线分隔，不再各自包一张卡片 -->
    <MetricGrid :items="summaryMetrics" :columns="3" />

    <!-- 加载骨架（落画布，不包卡片） -->
    <div v-if="loading" aria-busy="true" aria-label="流水加载中">
      <div class="pb-2">
        <div class="md-skeleton h-3 w-40" />
      </div>
      <div
        v-for="i in 6"
        :key="i"
        class="flex items-center gap-4 border-b border-md-card-border px-4 py-3 last:border-b-0"
      >
        <div class="md-skeleton h-3.5 w-32" />
        <div class="md-skeleton h-3.5 w-14" />
        <div class="md-skeleton ml-auto h-3.5 w-20" />
        <div class="md-skeleton h-3.5 w-20" />
      </div>
    </div>

    <!-- 错误 -->
    <EmptyState v-else-if="errorMsg" :text="errorMsg" icon="error" error retry-text="重试" @retry="load" />

    <!-- 空数据 -->
    <EmptyState v-else-if="rows.length === 0" text="暂无账单" icon="file-text" />

    <!-- 流水表格：直接落画布，外面不再套卡片 -->
    <div v-else class="overflow-x-auto">
      <table class="md-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
            <th class="text-right">金额</th>
            <th class="text-right">余额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in rows" :key="idx">
            <td class="whitespace-nowrap tabular-nums">{{ row.time || '--' }}</td>
            <td>
              <span class="md-chip-neutral">{{ row.typeLabel }}</span>
            </td>
            <td
              :class="[
                'whitespace-nowrap text-right font-medium tabular-nums',
                row.isIncome ? 'text-md-success' : 'text-md-text-high',
              ]"
            >
              {{ row.amountLabel }}
            </td>
            <td class="whitespace-nowrap text-right tabular-nums text-md-text-medium">
              {{ row.balanceLabel }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import MetricGrid, { type MetricItem } from '@/components/ui/MetricGrid.vue';
import { fetchCardRecords, type CardTransaction } from '@/api/campus';

const RANGE_OPTIONS = [
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
] as const;

const days = ref<number>(7);
const raw = ref<CardTransaction[]>([]);
const loading = ref(false);
const errorMsg = ref('');

// ---------------------------------------------------------------------------
// 字段解析
//
// 服务端返回的字段名可能是 finserv 原始名（amount / time / tradeType），
// 也可能是前端声明的驼峰名（tradeAmount / tradeTime / cardBalance）。
// 两种都读，缺哪个补哪个，不依赖单一形状。
// ---------------------------------------------------------------------------
type Loose = Record<string, unknown>;

function pick(t: CardTransaction, keys: string[]): unknown {
  const rec = t as unknown as Loose;
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(v: number): string {
  return `¥ ${v.toFixed(2)}`;
}

/** 类型：1 消费 / 2 充值 / 3 补助 / 4 转账；缺失时按金额正负兜底 */
function typeLabelOf(t: CardTransaction, amount: number): string {
  const rawType = String(pick(t, ['tradeType', 'tradetype', 'type', 'txtype']) ?? '');
  switch (rawType) {
    case '1':
      return '消费';
    case '2':
      return '充值';
    case '3':
      return '补助';
    case '4':
      return '转账';
    default:
      return amount < 0 ? '消费' : '充值';
  }
}

interface Row {
  time: string;
  typeLabel: string;
  amountLabel: string;
  balanceLabel: string;
  isIncome: boolean;
  amount: number;
}

const rows = computed<Row[]>(() =>
  raw.value.map((t) => {
    const amount = toNumber(pick(t, ['tradeAmount', 'amount', 'txamt']));
    const balance = pick(t, ['cardBalance', 'balance']);
    return {
      time: String(pick(t, ['tradeTime', 'time', 'txdate', 'paytime']) ?? ''),
      typeLabel: typeLabelOf(t, amount),
      amountLabel: `${amount < 0 ? '-' : '+'} ${formatAmount(Math.abs(amount))}`,
      balanceLabel: balance === undefined ? '--' : formatAmount(toNumber(balance)),
      isIncome: amount >= 0,
      amount,
    };
  }),
);

/** 汇总：支出合计 / 收入合计 / 记录数（全部来自真实数据） */
const summary = computed(() => {
  let expense = 0;
  let income = 0;
  for (const r of rows.value) {
    if (r.amount < 0) expense += Math.abs(r.amount);
    else income += r.amount;
  }
  return { expense, income, count: rows.value.length };
});

/** 汇总指标组（原来的 3 张汇总卡 → 一组指标，竖线分隔、无外框） */
const summaryMetrics = computed<MetricItem[]>(() => [
  {
    label: '支出合计',
    value: summary.value.expense.toFixed(2),
    prefix: '¥',
    valueClass: 'text-md-text-high',
  },
  {
    label: '收入合计',
    value: summary.value.income.toFixed(2),
    prefix: '¥',
    valueClass: 'text-md-success',
  },
  {
    label: '记录数',
    value: summary.value.count,
    suffix: '条',
    valueClass: 'text-md-text-high',
  },
]);

// ---------------------------------------------------------------------------
// 数据加载
// ---------------------------------------------------------------------------
async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const list = await fetchCardRecords(days.value);
    raw.value = Array.isArray(list) ? list : [];
  } catch (e) {
    raw.value = [];
    errorMsg.value = e instanceof Error ? e.message : '流水加载失败';
  } finally {
    loading.value = false;
  }
}

function setRange(next: number) {
  if (days.value === next) return;
  days.value = next;
  load();
}

onMounted(load);
</script>
