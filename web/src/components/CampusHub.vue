<template>
  <div class="space-y-6">
    <!-- 校园卡数据卡 -->
    <div class="md-card p-4">
      <div class="min-w-0">
        <div class="text-md2-caption text-md-text-medium">账户余额</div>
        <div class="mt-1.5 text-md2-metric tabular-nums text-md-text-high">
          ¥ {{ cardInfo?.balance !== undefined ? Number(cardInfo.balance).toFixed(2) : '--' }}
        </div>
      </div>

      <div class="mt-4 pt-3 md-divider flex items-center justify-end text-md2-caption">
        <div class="text-md-text-medium shrink-0">
          卡号 <span class="text-md-text-high tabular-nums">{{ cardInfo?.idserial || cardInfo?.cardno || '--' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardInfo, CardTransaction } from '../api/campus';

defineProps<{
  cardInfo: CardInfo | null;
  transactions?: CardTransaction[];
}>();
</script>
