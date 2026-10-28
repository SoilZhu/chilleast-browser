/**
 * PWA Service Worker 注册与管理
 */

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // 开发环境下注销旧 Service Worker 并清空缓存，防止拦截 Vite HMR 和热更新模块
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then(() => {
          console.log('[PWA] 已在开发环境下注销 Service Worker');
        });
      }
    });
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      });
    }
    return;
  }

  // 仅在生产环境或本地开发调试时注册
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.localhost');

  if (window.location.protocol !== 'https:' && !isLocalhost) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // 定期检查更新（每 60 分钟一次）
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);

        // 监听更新就绪事件
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // 已有老版本控制，新版本缓存已就绪
                console.log('[PWA] 新版本就绪，下次访问或刷新时生效。');
              } else {
                console.log('[PWA] 离线缓存资源已准备完毕。');
              }
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker 注册失败:', error);
      });
  });
}
