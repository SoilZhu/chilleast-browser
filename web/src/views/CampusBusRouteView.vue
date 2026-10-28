<template>
  <div class="space-y-4">
    <!-- PC 端标题（手机端在全局返回顶栏中展示） -->
    <div class="hidden md:block">
      <PageHeader
        title="校内公交线路"
        subtitle="通勤班车停靠站点与环线走向"
        icon="route"
        icon-color="#00a86b"
      />
    </div>

    <!-- 线路图卡片：移动端全屏铺开 -->
    <div class="bg-white rounded-md2-lg md:border md:border-md-card-border overflow-hidden p-2 sm:p-4">
      <div class="mb-3 text-md2-caption text-md-text-medium flex items-center justify-between">
        <span>湖南农业大学校内通勤班车线路图</span>
        <a
          href="/assets/campus_bus_map.webp"
          target="_blank"
          rel="noopener noreferrer"
          class="md-btn-text text-md-primary"
        >
          <Icon name="external" size="sm" />
          <span>查看原图</span>
        </a>
      </div>
      <div class="overflow-auto max-h-[calc(100vh-8rem)] rounded-md2-md bg-md-surface-1">
        <img
          src="/assets/campus_bus_map.webp"
          alt="湖南农业大学校内通勤班车线路图"
          class="w-full h-auto min-w-[320px] block select-none"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '../components/ui/PageHeader.vue';
import Icon from '../components/Icon.vue';
</script>
