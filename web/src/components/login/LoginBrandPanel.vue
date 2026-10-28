<template>
  <div ref="brandEl" class="login-brand" aria-hidden="true">
    <!-- 绿色点阵：每个圆环独立呼吸（SMIL），并有指针靠近时的微位移 -->
    <div class="login-brand__rings">
      <svg
        class="login-brand__rings-svg"
        viewBox="0 0 1550 860"
        preserveAspectRatio="xMinYMax slice"
        fill="none"
      >
        <g fill="none" stroke="#08AB77" stroke-width="10">
          <circle
            v-for="(ring, index) in GREEN_RINGS"
            :key="index"
            :cx="ring.cx"
            :cy="ring.cy"
            r="30"
            :stroke-opacity="ring.minOp"
          >
            <animate
              attributeName="stroke-opacity"
              :values="`${ring.minOp};${ring.maxOp};${ring.minOp}`"
              :dur="`${ring.dur}s`"
              :begin="`${ring.delay}s`"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
            />
          </circle>
        </g>
      </svg>
    </div>

    <!-- 浏阳河：蓝色圆环连成的曲线，跟着指针整体轻微漂移 -->
    <div
      ref="riverEl"
      class="login-brand__river"
      :style="{ backgroundImage: RIVER_LAYER }"
    ></div>

    <!-- 品牌标语「东湖事，自在事。」 -->
    <div class="login-brand__slogan" v-html="SLOGAN_SVG"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * 登录页左侧品牌区（样式对齐自在东湖 MCP 服务的 OAuth 登录页）。
 *
 * 三层叠加，自下而上：
 *   1. 墨绿底 #034933
 *   2. 绿色点阵圆环 #08AB77（SMIL 独立呼吸 + 指针微位移）
 *   3. 浏阳河蓝色圆环 #3B8FDE（data URI 背景 + 整体微位移）
 * 右下角压白色品牌标语。
 *
 * 位移算法与参考实现一致：按 preserveAspectRatio="xMinYMax slice" 的缩放比
 * 把屏幕坐标换算到 1550×860 设计稿坐标，再对每个圆环 / 河流施加阻尼位移。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { GREEN_RINGS, RIVER_LAYER, SLOGAN_SVG } from './brand-art';

/** 设计稿视口（与 SVG viewBox 一致） */
const DESIGN_WIDTH = 1550;
const DESIGN_HEIGHT = 860;

interface RingState {
  el: SVGCircleElement;
  cx: number;
  cy: number;
  curX: number;
  curY: number;
  targetX: number;
  targetY: number;
}

const brandEl = ref<HTMLDivElement | null>(null);
const riverEl = ref<HTMLDivElement | null>(null);

let rings: RingState[] = [];
let rafId = 0;
let animating = false;
let riverCurX = 0;
let riverCurY = 0;
let riverTargetX = 0;
let riverTargetY = 0;
let reducedMotion = false;

/** 圆环阻尼跟随（与参考实现同参数：0.18） */
const RING_LERP = 0.18;
/** 河流阻尼跟随（与参考实现同参数：0.12） */
const RIVER_LERP = 0.12;
/** 位移收敛阈值：小于该值直接吸附到目标位置 */
const EPSILON = 0.02;

function applyRingTransform(ring: RingState) {
  if (ring.curX === 0 && ring.curY === 0) {
    ring.el.removeAttribute('transform');
    return;
  }
  ring.el.setAttribute(
    'transform',
    `translate(${ring.curX.toFixed(2)},${ring.curY.toFixed(2)})`,
  );
}

function applyRiverTransform() {
  if (!riverEl.value) return;
  if (riverCurX === 0 && riverCurY === 0) {
    riverEl.value.style.transform = '';
    return;
  }
  riverEl.value.style.transform = `translate3d(${riverCurX.toFixed(2)}px,${riverCurY.toFixed(2)}px,0)`;
}

function tick() {
  let active = false;

  for (const ring of rings) {
    const vx = (ring.targetX - ring.curX) * RING_LERP;
    const vy = (ring.targetY - ring.curY) * RING_LERP;
    if (Math.abs(vx) > EPSILON || Math.abs(vy) > EPSILON) {
      ring.curX += vx;
      ring.curY += vy;
      applyRingTransform(ring);
      active = true;
    } else if (ring.curX !== ring.targetX || ring.curY !== ring.targetY) {
      ring.curX = ring.targetX;
      ring.curY = ring.targetY;
      applyRingTransform(ring);
    }
  }

  const rvx = (riverTargetX - riverCurX) * RIVER_LERP;
  const rvy = (riverTargetY - riverCurY) * RIVER_LERP;
  if (Math.abs(rvx) > EPSILON || Math.abs(rvy) > EPSILON) {
    riverCurX += rvx;
    riverCurY += rvy;
    applyRiverTransform();
    active = true;
  } else if (riverCurX !== riverTargetX || riverCurY !== riverTargetY) {
    riverCurX = riverTargetX;
    riverCurY = riverTargetY;
    applyRiverTransform();
  }

  if (active) {
    rafId = requestAnimationFrame(tick);
  } else {
    animating = false;
  }
}

function wake() {
  if (animating || reducedMotion) return;
  animating = true;
  rafId = requestAnimationFrame(tick);
}

function onPointerMove(event: PointerEvent) {
  const brand = brandEl.value;
  if (!brand) return;

  const rect = brand.getBoundingClientRect();
  // slice 缩放：取两轴缩放比的较大者
  const scale = Math.max(rect.width / DESIGN_WIDTH, rect.height / DESIGN_HEIGHT);
  if (scale <= 0) return;

  // 屏幕坐标 → 设计稿坐标（SVG 底部对齐）
  const svgX = (event.clientX - rect.left) / scale;
  const svgY = DESIGN_HEIGHT - (rect.bottom - event.clientY) / scale;

  // 1. 绿色圆环：半径 450 内的圆环朝指针方向微移，最大 4.5px
  const maxDistance = 450;
  for (const ring of rings) {
    const dx = svgX - ring.cx;
    const dy = svgY - ring.cy;
    const distance = Math.hypot(dx, dy);

    if (distance > maxDistance || distance < 0.5) {
      ring.targetX = 0;
      ring.targetY = 0;
    } else {
      const factor = 0.1 * Math.pow(1 - distance / maxDistance, 1.5);
      const pull = Math.min(4.5, distance * factor);
      ring.targetX = (dx / distance) * pull;
      ring.targetY = (dy / distance) * pull;
    }
  }

  // 2. 河流：相对品牌区 (35%, 65%) 锚点整体漂移，最大 4.5px
  const relX = event.clientX - (rect.left + rect.width * 0.35);
  const relY = event.clientY - (rect.top + rect.height * 0.65);
  const riverDistance = Math.hypot(relX, relY);
  if (riverDistance > 0) {
    const factor =
      0.1 * Math.pow(Math.max(0, 1 - riverDistance / 600), 1.5);
    const pull = Math.min(4.5, riverDistance * factor);
    riverTargetX = (relX / riverDistance) * pull;
    riverTargetY = (relY / riverDistance) * pull;
  }

  wake();
}

function resetTargets() {
  for (const ring of rings) {
    ring.targetX = 0;
    ring.targetY = 0;
  }
  riverTargetX = 0;
  riverTargetY = 0;
  wake();
}

function setup() {
  const brand = brandEl.value;
  if (!brand) return;

  const circles = brand.querySelectorAll<SVGCircleElement>('.login-brand__rings-svg circle');
  rings = [];
  circles.forEach((el) => {
    rings.push({
      el,
      cx: Number(el.getAttribute('cx')),
      cy: Number(el.getAttribute('cy')),
      curX: 0,
      curY: 0,
      targetX: 0,
      targetY: 0,
    });
  });

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', resetTargets);
  window.addEventListener('blur', resetTargets);
}

function teardown() {
  window.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerleave', resetTargets);
  window.removeEventListener('blur', resetTargets);
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  animating = false;
}

onMounted(() => {
  reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;
  setup();
});

onBeforeUnmount(teardown);
</script>

<style scoped>
.login-brand {
  position: relative;
  overflow: hidden;
  background-color: #034933;
}

/* 两层图形都铺满品牌区，裁切在圆角外也不露边 */
.login-brand__rings {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.login-brand__rings-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.login-brand__river {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-size: cover;
  background-position: left bottom;
  will-change: transform;
}

.login-brand__slogan {
  position: absolute;
  /* 与参考实现一致：左右 / 下边距按视口高度缩放，避免大屏上标语飘走 */
  left: clamp(16px, calc(18 / 860 * 100vh), 32px);
  bottom: clamp(24px, calc(32 / 860 * 100vh), 56px);
  width: clamp(180px, calc(265 / 860 * 100vh), 380px);
  color: #fff;
  line-height: 0;
  pointer-events: none;
  z-index: 1;
}

.login-brand__slogan :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}

/* 桌面端：左半屏钉在视口上，右侧滚动时不带动品牌纹样 */
@media (min-width: 881px) {
  .login-brand {
    position: fixed;
    inset: 0 auto 0 0;
    width: 50%;
  }
}

/* 窄屏：品牌区收成顶部一条横幅 */
@media (max-width: 880px) {
  .login-brand {
    width: 100%;
    height: 190px;
  }

  .login-brand__slogan {
    left: 18px;
    bottom: 18px;
    width: clamp(110px, 32vw, 135px);
  }
}

/* 减少动态效果：停掉圆环呼吸（SMIL）与位移过渡 */
@media (prefers-reduced-motion: reduce) {
  .login-brand :deep(animate) {
    display: none;
  }
}
</style>
