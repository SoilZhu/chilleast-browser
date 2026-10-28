<template>
  <div class="md-scrim flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="md-dialog max-w-4xl w-full max-h-[calc(100dvh-2rem)] flex flex-col">
      <!-- 标题栏 -->
      <div class="md-dialog-header shrink-0">
        <div class="flex items-start gap-3">
          <div
            class="w-10 h-10 rounded-full bg-brand-50 text-md-primary flex items-center justify-center shrink-0"
          >
            <Icon name="bus" size="sm" />
          </div>
          <div>
            <h3 class="md-dialog-title">{{ activeTabMeta.title }}</h3>
            <p class="text-md2-caption text-md-text-medium">{{ activeTabMeta.subtitle }}</p>
          </div>
        </div>
        <button class="md-icon-btn-sm -mt-1 -mr-1" title="关闭" @click="$emit('close')">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <!-- MD2 标签栏（底部描边 Tab） -->
      <div class="flex items-center gap-1 px-4 border-b border-md-card-border shrink-0">
        <button
          v-for="t in tabs"
          :key="t.id"
          :class="[
            'relative px-3 pb-2.5 pt-1 text-md2-button transition-colors duration-md2-short ease-md2-standard border-b-2 -mb-px',
            activeTab === t.id
              ? 'border-md-primary text-md-primary font-medium'
              : 'border-transparent text-md-text-medium hover:text-md-text-high hover:bg-md-surface-1',
          ]"
          @click="activeTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- 内容区 -->
      <div class="flex-1 min-h-0 flex flex-col">
        <!-- ========== 1 / 3：实时校车 & 长沙公交（默认在新标签页打开） ========== -->
        <template v-if="activeTab === 'school_bus' || activeTab === 'cs_bus'">
          <div class="p-8 flex flex-col items-center justify-center gap-4 text-center my-auto min-h-[300px]">
            <span
              class="w-16 h-16 rounded-full bg-brand-50 text-md-primary flex items-center justify-center"
            >
              <Icon name="bus" size="lg" />
            </span>
            <div class="max-w-md">
              <p class="text-md2-subtitle1 font-medium text-md-text-high">{{ activeTabMeta.title }}</p>
              <p class="text-md2-caption text-md-text-medium mt-1 leading-relaxed">
                {{ activeTabMeta.subtitle }}
              </p>
              <p v-if="activeTabMeta.source" class="text-md2-caption text-md-text-disabled mt-1">
                {{ activeTabMeta.source }}
              </p>
            </div>
            <a
              :href="activeTabMeta.url"
              target="_blank"
              rel="noopener noreferrer"
              class="md-btn-filled mt-2"
            >
              <Icon name="external" size="sm" />
              在新标签页打开
            </a>
          </div>
        </template>

        <!-- ========== 2：校内公交线路（App 内置线路图，直接放大查看） ========== -->
        <div v-else class="flex-1 min-h-0 overflow-auto no-scrollbar bg-md-surface-1 p-3">
          <img
            src="/assets/campus_bus_map.webp"
            alt="湖南农业大学校内通勤班车线路图"
            class="w-full h-auto block rounded-md2-md"
          />
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="md-dialog-actions shrink-0 border-t border-md-card-border">
        <button class="md-btn-text" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Icon from './Icon.vue';

type TabId = 'school_bus' | 'route_map' | 'cs_bus';

const props = withDefaults(
  defineProps<{
    initialTab?: TabId;
  }>(),
  {
    initialTab: 'school_bus',
  },
);

defineEmits<{
  (e: 'close'): void;
}>();

const activeTab = ref<TabId>(props.initialTab);
const iframeFailed = ref(false);

/**
 * 三个入口全部对应真实实现：
 *  - 实时校车：App 用 InAppWebView 加载 bus.jingzhixx.com（GPS 实时定位）
 *  - 校内公交线路：App 内置静态线路图 assets/images/campus_bus_map.webp
 *  - 长沙实时公交：App 用 InAppWebView 加载 xlcxweb.busrise.cn
 * 网页版把前两者换成 iframe + 静态图，能力等价。
 */
const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'school_bus', label: '实时校车' },
  { id: 'route_map', label: '校内公交线路' },
  { id: 'cs_bus', label: '长沙实时公交' },
];

const TAB_META: Record<TabId, { title: string; subtitle: string; url: string; source: string }> = {
  school_bus: {
    title: '实时校车',
    subtitle: '校园通勤班车 GPS 实时定位',
    url: 'https://bus.jingzhixx.com/h5/',
    source: '数据来源：宝宝校车',
  },
  route_map: {
    title: '校内公交线路',
    subtitle: '通勤班车停靠站点与环线走向',
    url: '',
    source: '',
  },
  cs_bus: {
    title: '长沙实时公交',
    subtitle: '途经农大各校门的城市公交实时到站',
    url: 'https://xlcxweb.busrise.cn/h5/mycs/',
    source: '数据来源：长沙公交实时查询',
  },
};

const activeTabMeta = computed(() => TAB_META[activeTab.value]);
</script>
