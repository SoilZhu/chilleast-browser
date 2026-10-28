import { ref, readonly } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const canInstall = ref(false);
const isInstalled = ref(false);

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

if (typeof window !== 'undefined') {
  isInstalled.value = detectStandalone();

  // 监听浏览器安装就绪事件 (Chrome/Edge/Android)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
    canInstall.value = true;
  });

  // 监听安装完成事件
  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    canInstall.value = false;
    isInstalled.value = true;
  });
}

export function usePwaInstall() {
  const isIos =
    typeof navigator !== 'undefined' &&
    ((/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ||
      (typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('mock_ios') === '1' ||
          window.location.hash.includes('mock_ios=1')))) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  const isAndroid =
    typeof navigator !== 'undefined' &&
    (/android/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('mock_android') === '1' ||
          window.location.hash.includes('mock_android=1'))));

  async function triggerInstall(): Promise<boolean> {
    if (!deferredPrompt.value) return false;
    try {
      await deferredPrompt.value.prompt();
      const choice = await deferredPrompt.value.userChoice;
      deferredPrompt.value = null;
      canInstall.value = false;
      if (choice.outcome === 'accepted') {
        return true;
      }
    } catch (err) {
      console.warn('[PWA] 触发安装引导失败:', err);
    }
    return false;
  }

  return {
    canInstall: readonly(canInstall),
    isInstalled: readonly(isInstalled),
    isIos,
    isAndroid,
    triggerInstall,
  };
}
