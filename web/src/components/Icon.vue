<template>
  <span
    :class="['mi', filled ? 'mi-filled' : 'mi-outlined', sizeClass]"
    :style="{ fontSize: sizePx }"
    aria-hidden="true"
  >{{ char }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ICON_MAP, FALLBACK_ICON } from './icon-map';
import { ICON_GLYPHS } from './icon-glyphs';

/**
 * Material Icons 图标（MD2 风格）
 * ----------------------------------------------------------------------------
 * 走 Google 官方 Material Icons 字体，不是手写 path：
 *   - 默认 outlined（线性）变体，对应 MD2 里未选中的导航/工具图标；
 *   - `variant="filled"` 用实心变体，对应 MD2 里选中态与强调位；
 *   - 颜色、大小全部由外部 class 控制，字体只负责字形。
 *
 * 字体是裁剪过的子集（见 `scripts/build-icons.mjs`），只含 `icon-map.ts`
 * 里声明的 106 个字形，两个变体加起来 12 KB。
 *
 * 用法：
 *   <Icon name="home" />                      语义名，默认 outlined
 *   <Icon name="home" variant="filled" />     实心（选中态）
 *   <Icon name="close" size="sm" class="text-md-text-medium" />
 */
const props = withDefaults(
  defineProps<{
    /** 语义名，见 `icon-map.ts` */
    name: string;
    /** 尺寸档位，对应 MD2 的 14/16/20/24/32dp */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    /** 变体：outlined（默认）| filled（选中态、强调） */
    variant?: 'outlined' | 'filled';
  }>(),
  {
    size: 'md',
    variant: 'outlined',
  },
);

/** MD2 图标尺寸（dp → px，1dp = 1px @1x） */
const SIZE_PX: Record<string, string> = {
  xs: '14px',
  sm: '16px',
  md: '20px',
  lg: '24px',
  xl: '32px',
};

const sizeClass = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'w-3.5 h-3.5';
    case 'sm':
      return 'w-4 h-4';
    case 'lg':
      return 'w-6 h-6';
    case 'xl':
      return 'w-8 h-8';
    case 'md':
    default:
      return 'w-5 h-5';
  }
});

const sizePx = computed(() => SIZE_PX[props.size] ?? SIZE_PX.md);

const def = computed(() => ICON_MAP[props.name] ?? FALLBACK_ICON);

/** 语义名没声明 filled 默认值时，仍然允许调用方显式要求 filled */
const filled = computed(() => props.variant === 'filled' || def.value.filled === true);

/** 码点 → 字符；字体里没有该字形时渲染空串（不显示豆腐块） */
const char = computed(() => {
  const cp = ICON_GLYPHS[def.value.glyph];
  return cp ? String.fromCodePoint(cp) : '';
});
</script>
