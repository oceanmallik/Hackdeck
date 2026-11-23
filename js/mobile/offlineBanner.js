// js/mobile/offlineBanner.js - Offline status indicator & guard
import { showToast } from './toast.js';

let bannerEl = null;

export function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function checkOnlineAction(actionName = 'perform this action') {
  if (isOffline()) {
    showToast(`You are offline. Cannot ${actionName} right now.`, 'error');
    return false;
  }
  return true;
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

  function updateStatus() {
    if (!navigator.onLine) {
      bannerEl.classList.add('visible');
    } else {
      if (bannerEl.classList.contains('visible')) {
        bannerEl.classList.remove('visible');
        showToast('Back online!', 'success');
      }
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}
