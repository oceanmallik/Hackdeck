// js/mobile/pullToRefresh.js - Touch pull-to-refresh handler
import { haptic } from './haptics.js';

export function setupPullToRefresh(container, onRefresh) {
  let indicator = document.getElementById('mobilePtrIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'mobilePtrIndicator';
    indicator.className = 'mobile-ptr-indicator';
    indicator.innerHTML = '<div class="mobile-ptr-spinner"></div>';
    document.body.appendChild(indicator);
  }

  let startX = 0;
  let startY = 0;
  let currentY = 0;
  let isPulling = false;
  let isRefreshing = false;

  const threshold = 65;

  function onTouchStart(e) {
    if (isRefreshing || e.touches.length !== 1) return;
    if (document.body.classList.contains('sheet-open') || e.target.closest('.mobile-bottom-sheet-overlay, .modal-overlay, .mobile-bottom-sheet')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isPulling = false;
    currentY = 0;
  }

  function onTouchMove(e) {
    if (isRefreshing || e.touches.length !== 1) return;
    if (document.body.classList.contains('sheet-open') || e.target.closest('.mobile-bottom-sheet-overlay, .modal-overlay, .mobile-bottom-sheet')) {
      if (isPulling) {
        isPulling = false;
        indicator.classList.remove('visible', 'pulling');
        indicator.style.transform = '';
      }
      return;
    }
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    // Only allow pull-to-refresh when at the very top of the page
    if (scrollTop > 0) {
      if (isPulling) {
        isPulling = false;
        indicator.classList.remove('visible', 'pulling');
        indicator.style.transform = '';
      }
      return;
    }

    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const diffX = x - startX;
    const diffY = y - startY;

    // Must be dragging downward, and vertical distance must dominate horizontal movement
    if (diffY > 12 && diffY > Math.abs(diffX) * 1.5) {
      isPulling = true;
      indicator.classList.add('visible', 'pulling');
      currentY = Math.min((diffY - 12) * 0.45, 80);
      indicator.style.transform = `translateX(-50%) translateY(${currentY - 20}px) scale(1)`;
    } else if (diffY <= 0 && isPulling) {
      isPulling = false;
      indicator.classList.remove('visible', 'pulling');
      indicator.style.transform = '';
    }
  }

  async function onTouchEnd() {
    if (!isPulling || isRefreshing) {
      isPulling = false;
      indicator.classList.remove('visible', 'pulling');
      indicator.style.transform = '';
      return;
    }
    isPulling = false;
    indicator.classList.remove('pulling');

    if (currentY >= threshold) {
      isRefreshing = true;
      indicator.classList.add('visible', 'refreshing');
      haptic(15);
      indicator.style.transform = 'translateX(-50%) translateY(15px) scale(1)';

      try {
        if (typeof onRefresh === 'function') {
          await onRefresh();
        }
      } catch (err) {
        console.warn('Pull-to-refresh error:', err);
      } finally {
        setTimeout(() => {
          isRefreshing = false;
          indicator.classList.remove('visible', 'refreshing');
          indicator.style.transform = '';
        }, 350);
      }
    } else {
      indicator.classList.remove('visible');
      indicator.style.transform = '';
    }
    currentY = 0;
  }

  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
}
