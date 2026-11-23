// js/mobile/haptics.js - Touch vibration helper
export function haptic(duration = 10) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  } catch (_) {
    // Fail silently if unsupported or permission blocked
  }
}
