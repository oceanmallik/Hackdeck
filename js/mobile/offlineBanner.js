// js/mobile/offlineBanner.js - Offline status indicator & guard

export function isOffline() {
  return false;
}

export function checkOnlineAction() {
  return true;
}

export function initOfflineBanner() {
  // Visually remove the banner completely from DOM if present
  const existing = document.getElementById('mobileOfflineBanner');
  if (existing) {
    existing.remove();
  }
}
