<script lang="ts">
/**
 * 可选语言（顺序固定：跟随系统置顶，其余按 App 的 supportedLanguages 顺序）。
 * 共 11 项，与 App 的语言列表一致。
 */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'system', label: '跟随系统' },
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'zh_HK', label: '繁体中文（中国香港）' },
  { code: 'zh_TW', label: '繁体中文（中国台湾）' },
  { code: 'ja', label: '日语' },
  { code: 'es', label: '西班牙语' },
  { code: 'fr', label: '法语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'yue', label: '粤语（广州话）' },
];

/** 语言代码 → 展示名（找不到时回落到「跟随系统」） */
export function languageLabel(code: string): string {
  return LANGUAGES.find((o) => o.code === code)?.label ?? LANGUAGES[0].label;
}
</script>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';

withDefaults(
  defineProps<{
    /** 当前语言代码（存 localStorage 的 app_language_code） */
    modelValue: string;
  }>(),
  { modelValue: 'system' },
);

defineEmits<{ (e: 'update:modelValue', code: string): void }>();
</script>

<template>
  <!-- ===================================================================
       语言设置（对应原版 App 的 language_settings_screen.dart）
       - 单选列表：选中项品牌绿 + 勾选图标
       - 选中结果由父级写入 localStorage 的 app_language_code
       =================================================================== -->
  <div class="space-y-3">
    <div class="md-settings-group">
      <button
        v-for="opt in LANGUAGES"
        :key="opt.code"
        type="button"
        :class="[
          'md-row py-3',
          opt.code === modelValue ? 'bg-brand-50 hover:bg-brand-100' : '',
        ]"
        :aria-pressed="opt.code === modelValue"
        @click="$emit('update:modelValue', opt.code)"
      >
        <span
          :class="[
            'min-w-0 flex-1 text-md2-body1 truncate',
            opt.code === modelValue ? 'text-md-primary font-medium' : 'text-md-text-high',
          ]"
        >
          {{ opt.label }}
        </span>
        <Icon
          v-if="opt.code === modelValue"
          name="check"
          size="md"
          class="text-md-primary shrink-0"
        />
      </button>
    </div>

    <p class="text-md2-caption text-md-text-disabled px-1">界面文字暂为简体中文</p>
  </div>
</template>
