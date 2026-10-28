/**
 * ChillEast Browser - Progressive Web App Service Worker
 *
 * 核心策略：
 * 1. 离线 Shell 预缓存：首页、manifest、图标与品牌资源
 * 2. 页面导航（navigate）：网络优先（Network-First），离线时回退到缓存的 index.html
 * 3. 静态构建资产（/assets/*）：带 Hash 指纹，命中缓存优先（Cache-First）
 * 4. 图标与公共静态资源：stale-while-revalidate 策略
 * 5. 业务接口（/api/* 及 /health）：绝对不缓存，保证无状态令牌及数据安全
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `chilleast-${CACHE_VERSION}`;

/** 预缓存核心应用 Shell 资源 */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.ico',
  '/brand/mark-light.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/favicon-48.png',
];

// ---------------------------------------------------------------------------
// 1. 生命周期：安装阶段预缓存
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 容错预缓存：即便个别图标临时缺失也不阻断 SW 成功安装
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[PWA SW] Precache failed for:', url, err);
          }),
        ),
      );
    }),
  );
});

// ---------------------------------------------------------------------------
// 2. 生命周期：激活阶段清理旧版本缓存
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[PWA SW] Cleaning old cache:', key);
              return caches.delete(key);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// 3. 网络请求拦截
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只拦截 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // ⚠️ 绝不缓存 API 业务中转接口与 Vite 开发模式下的热更新模块（保护 Bearer Token 与实时刷新）
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/api' ||
    url.pathname === '/health' ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t') ||
    url.searchParams.has('v') ||
    url.hostname.startsWith('api.')
  ) {
    return;
  }

  // A. 导航请求（打开网页或深层路由）：Network-First -> 离线回退 index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return new Response('应用离线中，未能加载本地缓存。', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }),
    );
    return;
  }

  // B. Vite 构建资产（/assets/*，带有文件名 ContentHash，内容不可变）：Cache-First
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // C. 其他静态资源（图标、字体、brand、manifest）：Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cached || fetchPromise;
    }),
  );
});

// ---------------------------------------------------------------------------
// 4. 客户端消息监听
// ---------------------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
