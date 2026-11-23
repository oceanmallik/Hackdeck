// js/mobile/offlineBanner.js - Offline status indicator & guard
import { showToast } from './toast.js';

let bannerEl = null;
let isReallyOffline = false;

export function isOffline() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.onLine) return false;
  return isReallyOffline;
}

export function checkOnlineAction(actionName = 'perform this action') {
  if (isOffline()) {
    showToast(`You are offline. Cannot ${actionName} right now.`, 'error');
    return false;
  }
  return true;
}

async function verifyConnectivity() {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    return true;
  }
  // If navigator.onLine says false, test with a lightweight ping to verify
  // Many mobile browsers (iOS Safari, Android WebViews, Battery Saver) falsely report false
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(window.location.origin + '/favicon.svg?_t=' + Date.now(), {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeout);
    return resp.ok || resp.status < 500;
  } catch (_) {
    return false;
  }
}

export function initOfflineBanner() {
  if (document.getElementById('mobileOfflineBanner')) return;

  bannerEl = document.createElement('div');
  bannerEl.id = 'mobileOfflineBanner';
  bannerEl.className = 'mobile-offline-banner';
  bannerEl.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="1" y1="1" x2="23" y2="23"></line>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
      <line x1="12" y1="20" x2="12.01" y2="20"></line>
    </svg>
    <span>You're offline. Reconnecting...</span>
  `;
  document.body.prepend(bannerEl);

  async function updateStatus() {
    if (!navigator.onLine) {
      const online = await verifyConnectivity();
      if (online) {
        // False alarm from navigator.onLine
        isReallyOffline = false;
        bannerEl.classList.remove('visible');
        return;
      }
      isReallyOffline = true;
      bannerEl.classList.add('visible');
    } else {
      isReallyOffline = false;
      if (bannerEl.classList.contains('visible')) {
        bannerEl.classList.remove('visible');
        showToast('Back online!', 'success');
      }
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);

  // Check on initial load if navigator claims offline
  if (!navigator.onLine) {
    updateStatus();
  }
}
