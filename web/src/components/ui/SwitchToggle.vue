<template>
  <!-- ===================================================================
       MD2 开关（Switch）
       40×24 轨道 + 20×20 圆形滑块，品牌绿选中态
       =================================================================== -->
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="[
      'relative inline-flex items-center w-10 h-6 rounded-full shrink-0',
      'transition-colors duration-md2-short ease-md2-standard',
      modelValue ? 'bg-md-primary' : 'bg-md-surface-3',
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
    ]"
    @click="$emit('update:modelValue', !modelValue)"
  >
    <span
      :class="[
        'absolute rounded-full bg-white shadow-dp1 transition-transform duration-md2-short ease-md2-standard',
        modelValue ? 'translate-x-[22px]' : 'translate-x-[3px]',
      ]"
      style="width: 18px; height: 18px"
    />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>
