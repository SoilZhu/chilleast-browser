/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Google Sans"',
          'Roboto',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      /**
       * Material Design 2 调色板
       * 以 Google Grey 900/700/500/300/100/50 为骨架，品牌绿作为 primary accent。
       * 参考：Material Design 2 color system + Google Keep 实际取色。
       */
      colors: {
        // ---- 品牌色（原版 App 农大绿 #09C489）作为 MD2 primary ----
        brand: {
          DEFAULT: '#09C489',
          50: 'var(--color-brand-50, #e6f9f3)',
          100: 'var(--color-brand-100, #cefae9)',
          200: 'var(--color-brand-200, #9df3d2)',
          300: '#64e8b8',
          400: '#2ad69b',
          500: '#09C489',
          600: '#07a674',
          700: '#06845d',
          800: '#056b4a',
          900: '#044c35',
          surface: 'var(--color-brand-surface, #f2fbf7)',
        },

        // ---- MD2 语义色（Google 官方 600 档）----
        md: {
          primary: '#09C489',
          'primary-light': '#2ad69b',
          'on-primary': '#ffffff',
          secondary: 'var(--color-md-secondary, #5f6368)',
          accent: '#1a73e8',
          'accent-surface': 'var(--color-md-accent-surface, #e8f0fe)',
          success: '#0f9d58',
          'success-surface': 'var(--color-md-success-surface, #e6f4ea)',
          'success-text': 'var(--color-md-success-text, #0d652d)',
          warning: '#f29900',
          'warning-surface': 'var(--color-md-warning-surface, #fef7e0)',
          'warning-text': 'var(--color-md-warning-text, #a56600)',
          danger: '#d93025',
          'danger-surface': 'var(--color-md-danger-surface, #fce8e6)',
          'danger-text': 'var(--color-md-danger-text, #b3261e)',
          info: '#1967d2',
          'info-surface': 'var(--color-md-info-surface, #e8f0fe)',
          'info-text': 'var(--color-md-info-text, #185abc)',

          // 表面 / 背景（MD2 surface elevation）
          background: 'var(--color-md-background, #ffffff)',
          'surface-1': 'var(--color-md-surface-1, #f8f9fa)',
          'surface-2': 'var(--color-md-surface-2, #f1f3f4)',
          'surface-3': 'var(--color-md-surface-3, #e8eaed)',
          'surface-card': 'var(--color-md-surface-card, #ffffff)',
          'surface-overlay': 'var(--color-md-surface-overlay, #ffffff)',
          'surface-field': 'var(--color-md-surface-field, #ffffff)',
          // Keep 顶栏搜索框的冷灰填充（参考图取样 #eff5f9，比 surface-2 略偏蓝）
          search: 'var(--color-md-search, #eff5f9)',
          'search-hover': 'var(--color-md-search-hover, #e6edf3)',
          divider: 'var(--color-md-divider, #dadce0)',
          'card-border': 'var(--color-md-card-border, #e0e0e0)',
          'card-hover': 'var(--color-md-card-hover, #f8f9fa)',

          // 文本（MD2 opacity 规范）
          'text-high': 'var(--color-md-text-high, #202124)',
          'text-medium': 'var(--color-md-text-medium, #5f6368)',
          'text-disabled': 'var(--color-md-text-disabled, #80868b)',
          'text-hint': 'var(--color-md-text-hint, #9aa0a6)',
        },

        // ---- Keep 便签色（用于分组/标签着色，源自参考图）----
        note: {
          default: '#ffffff',
          red: '#f28b82',
          orange: '#fbbc04',
          yellow: '#fff475',
          green: '#ccff90',
          teal: '#a7ffeb',
          blue: '#cbf0f8',
          darkblue: '#aecbfa',
          purple: '#d7aefb',
          pink: '#fdcfe8',
          brown: '#e6c9a8',
          gray: '#e8eaed',
        },

        // ---- 兼容旧代码的别名（渐进式迁移，勿在新代码中使用）----
        google: {
          yellow: '#feefc3',
          'yellow-hover': '#fef7e0',
          'yellow-dark': '#f29900',
          blue: '#1a73e8',
          'blue-hover': '#1765cc',
          'blue-surface': '#e8f0fe',
          green: '#0f9d58',
          'green-surface': '#e6f4ea',
          red: '#d93025',
          'red-surface': '#fce8e6',
          border: '#dadce0',
          'card-border': '#e0e0e0',
          'gray-bg': '#f1f3f4',
          'gray-hover': '#f8f9fa',
          'text-primary': '#202124',
          'text-secondary': '#5f6368',
          'text-muted': '#80868b',
        },
      },

      /**
       * MD2 elevation（官方 dp 阴影）
       */
      boxShadow: {
        'dp0': 'none',
        'dp1': '0 1px 2px 0 rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15)',
        'dp2': '0 1px 2px 0 rgba(60,64,67,0.30), 0 2px 6px 2px rgba(60,64,67,0.15)',
        'dp3': '0 1px 3px 0 rgba(60,64,67,0.30), 0 4px 8px 3px rgba(60,64,67,0.15)',
        'dp4': '0 2px 3px 0 rgba(60,64,67,0.30), 0 6px 10px 4px rgba(60,64,67,0.15)',
        'dp6': '0 4px 6px 0 rgba(60,64,67,0.30), 0 8px 12px 6px rgba(60,64,67,0.15)',
        'dp8': '0 6px 10px 0 rgba(60,64,67,0.30), 0 8px 18px 6px rgba(60,64,67,0.15)',
        'dp12': '0 8px 12px 0 rgba(60,64,67,0.30), 0 12px 24px 8px rgba(60,64,67,0.15)',
        'dp16': '0 12px 16px 0 rgba(60,64,67,0.30), 0 16px 32px 10px rgba(60,64,67,0.15)',
        'dp24': '0 16px 24px 0 rgba(60,64,67,0.30), 0 24px 44px 12px rgba(60,64,67,0.15)',
        // 兼容旧类名
        'md-1': '0 1px 2px 0 rgba(60,64,67,0.30), 0 1px 3px 1px rgba(60,64,67,0.15)',
        'md-2': '0 1px 3px 0 rgba(60,64,67,0.30), 0 4px 8px 3px rgba(60,64,67,0.15)',
        'md-3': '0 2px 6px 2px rgba(60,64,67,0.15), 0 1px 2px 0 rgba(60,64,67,0.30)',
        'md-search': '0 1px 1px 0 rgba(65,69,73,0.30), 0 1px 3px 1px rgba(65,69,73,0.15)',
        'search-focus': '0 1px 1px 0 rgba(65,69,73,0.28), 0 1px 3px 1px rgba(65,69,73,0.12)',
      },

      /**
       * MD2 shape scale（官方 0/2/4/8/12/16/28）
       */
      borderRadius: {
        'md2-xs': '2px',
        'md2-sm': '4px',
        'md2-md': '8px',
        'md2-lg': '12px',
        'md2-xl': '16px',
        'md2-2xl': '24px',
        'md2-pill': '9999px',
        'md2-fab': '28px',
      },

      /**
       * MD2 type scale
       */
      fontSize: {
        'md2-overline': ['10px', { lineHeight: '16px', letterSpacing: '0.8px', fontWeight: '500' }],
        'md2-caption': ['12px', { lineHeight: '16px', letterSpacing: '0.4px' }],
        'md2-button': ['14px', { lineHeight: '20px', letterSpacing: '0.25px', fontWeight: '500' }],
        'md2-body2': ['14px', { lineHeight: '20px', letterSpacing: '0.25px' }],
        'md2-body1': ['16px', { lineHeight: '24px', letterSpacing: '0.5px' }],
        'md2-subtitle2': ['14px', { lineHeight: '20px', letterSpacing: '0.1px', fontWeight: '500' }],
        'md2-subtitle1': ['16px', { lineHeight: '24px', letterSpacing: '0.15px', fontWeight: '500' }],
        'md2-h6': ['20px', { lineHeight: '28px', letterSpacing: '0.15px', fontWeight: '500' }],
        'md2-h5': ['24px', { lineHeight: '32px', letterSpacing: '0px', fontWeight: '400' }],
        'md2-h4': ['34px', { lineHeight: '40px', letterSpacing: '0.25px', fontWeight: '400' }],
        /**
         * 数据卡大数字：全站唯一的大数字档位。
         * 改版前 22/26/28/32px 四种写法混用，统一收到这一档（MD2 headline5 附近）。
         */
        'md2-metric': ['28px', { lineHeight: '36px', letterSpacing: '0px', fontWeight: '400' }],
        /** 列表/分区小标题：14px/500，替代散落的 13px/15px 写法 */
        'md2-section': ['14px', { lineHeight: '20px', letterSpacing: '0.1px', fontWeight: '500' }],
      },

      spacing: {
        'md2-nav': '256px',
        'md2-rail': '72px',
        'md2-topbar': '64px',
      },

      transitionTimingFunction: {
        // MD2 standard easing
        'md2-standard': 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        'md2-decelerate': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        'md2-accelerate': 'cubic-bezier(0.4, 0.0, 1, 1)',
        'md2-emphasized': 'cubic-bezier(0.2, 0.0, 0, 1)',
      },

      transitionDuration: {
        'md2-short': '150ms',
        'md2-medium': '250ms',
        'md2-long': '350ms',
      },

      keyframes: {
        'md2-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'md2-dialog-in': {
          from: { opacity: '0', transform: 'scale(0.9) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'md2-sheet-in': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'md2-slide-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'md2-ripple': {
          from: { transform: 'scale(0)', opacity: '0.28' },
          to: { transform: 'scale(2.5)', opacity: '0' },
        },
      },

      animation: {
        'md2-fade': 'md2-fade-in 150ms cubic-bezier(0.4,0,0.2,1) both',
        'md2-dialog': 'md2-dialog-in 250ms cubic-bezier(0.2,0,0,1) both',
        'md2-sheet': 'md2-sheet-in 250ms cubic-bezier(0.2,0,0,1) both',
        'md2-slide': 'md2-slide-in 200ms cubic-bezier(0.2,0,0,1) both',
      },
    },
  },
  plugins: [],
}
