// js/mobile/toast.js - Mobile Toast System
import { haptic } from './haptics.js';

let activeToastEl = null;
let toastTimeoutId = null;

function ensureToastContainer() {
  let container = document.getElementById('mobileToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'mobileToastContainer';
    container.className = 'mobile-toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'info', action = null, duration = 3000) {
  const container = ensureToastContainer();

  // Dismiss any existing toast first (one at a time)
  if (activeToastEl) {
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    activeToastEl.remove();
    activeToastEl = null;
  }

  const toast = document.createElement('div');
  toast.className = `mobile-toast toast-${type}`;
  toast.setAttribute('role', 'alert');

  const textSpan = document.createElement('span');
  textSpan.style.flex = '1';
  textSpan.style.wordBreak = 'break-word';
  textSpan.textContent = message;
  toast.appendChild(textSpan);

  if (action && action.text && typeof action.onClick === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'mobile-toast-undo-btn';
    actionBtn.textContent = action.text;
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      haptic(10);
      dismissToast(toast);
      action.onClick();
    });
    toast.appendChild(actionBtn);
    duration = Math.max(duration, 5000); // 5s for actions like Undo
  }

  // Touch swipe to dismiss
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;

  toast.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      isSwiping = true;
      toast.classList.add('swiping');
    }
  }, { passive: true });

  toast.addEventListener('touchmove', (e) => {
    if (!isSwiping || e.touches.length !== 1) return;
    currentX = e.touches[0].clientX - startX;
    toast.style.transform = `translateX(${currentX}px)`;
    toast.style.opacity = `${Math.max(0, 1 - Math.abs(currentX) / 180)}`;
  }, { passive: true });

  toast.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;
    toast.classList.remove('swiping');
    if (Math.abs(currentX) > 80) {
      dismissToast(toast);
    } else {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    }
  });

  container.appendChild(toast);
  activeToastEl = toast;

  toastTimeoutId = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  return toast;
}

function dismissToast(toastEl) {
  if (!toastEl || !toastEl.parentElement) return;
  toastEl.style.opacity = '0';
  toastEl.style.transform = 'translateY(10px)';
  setTimeout(() => {
    if (toastEl.parentElement) {
      toastEl.remove();
    }
    if (activeToastEl === toastEl) {
      activeToastEl = null;
    }
  }, 200);
}

// Override or wire into window.showToast on mobile
if (typeof window !== 'undefined') {
  window.mobileShowToast = showToast;
  const originalShowToast = window.showToast;
  window.showToast = function (msg, type = 'info', action = null) {
    if (window.matchMedia('(max-width: 768px)').matches) {
      return showToast(msg, type, action);
    }
    if (typeof originalShowToast === 'function') {
      return originalShowToast(msg, type);
    }
  };
}
