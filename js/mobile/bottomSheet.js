// js/mobile/bottomSheet.js - Reusable Bottom Sheet Manager for Hackdeck Mobile
import { haptic } from './haptics.js';

let openSheetsStack = [];

// Handle browser/Android back button navigation
window.addEventListener('popstate', (e) => {
  if (openSheetsStack.length > 0) {
    const topSheet = openSheetsStack[openSheetsStack.length - 1];
    if (topSheet && typeof topSheet.closeInternal === 'function') {
      topSheet.closeInternal(true); // true = popped from history
    }
  }
});

/**
 * Open a dynamic bottom sheet
 */
export function openBottomSheet({
  title = '',
  subtitle = '',
  contentHtml = '',
  onMount = null,
  onClose = null,
  buttons = [],
  className = '',
  dismissible = true,
  onDiscardCheck = null,
  triggerElement = null
}) {
  const overlay = document.createElement('div');
  overlay.className = `mobile-bottom-sheet-overlay ${className}`.trim();
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (title) overlay.setAttribute('aria-label', title);

  const sheet = document.createElement('div');
  sheet.className = 'mobile-bottom-sheet';

  // Drag handle bar
  const handleBar = document.createElement('div');
  handleBar.className = 'sheet-drag-handle-bar';
  handleBar.innerHTML = '<div class="sheet-drag-handle"></div>';
  sheet.appendChild(handleBar);

  // Header (if title or dismissible)
  if (title || dismissible) {
    const header = document.createElement('div');
    header.className = 'sheet-header';

    const titleGroup = document.createElement('div');
    if (title) {
      const h3 = document.createElement('h3');
      h3.className = 'sheet-title';
      h3.textContent = title;
      titleGroup.appendChild(h3);
    }
    if (subtitle) {
      const p = document.createElement('p');
      p.className = 'sheet-subtitle';
      p.textContent = subtitle;
      titleGroup.appendChild(p);
    }
    header.appendChild(titleGroup);

    if (dismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn-close-modal';
      closeBtn.setAttribute('aria-label', 'Close sheet');
      closeBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      closeBtn.addEventListener('click', () => attemptClose());
      header.appendChild(closeBtn);
    }

    sheet.appendChild(header);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'sheet-body';
  if (typeof contentHtml === 'string') {
    body.innerHTML = contentHtml;
  } else if (contentHtml instanceof HTMLElement) {
    body.appendChild(contentHtml);
  }
  sheet.appendChild(body);

  // Footer Buttons
  if (buttons && buttons.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'sheet-footer';
    buttons.forEach(btnConfig => {
      const btn = document.createElement('button');
      btn.type = btnConfig.type || 'button';
      btn.className = `btn ${btnConfig.className || 'btn-outline'}`;
      btn.textContent = btnConfig.text;
      if (btnConfig.onClick) {
        btn.addEventListener('click', async (e) => {
          haptic(10);
          await btnConfig.onClick(e, { close: () => attemptClose(false, true) });
        });
      }
      footer.appendChild(btn);
    });
    sheet.appendChild(footer);
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // Push history state so back button closes sheet first
  const historyPushed = true;
  history.pushState({ sheetOpen: true, id: Date.now() }, '');

  // Body scroll lock
  document.body.classList.add('sheet-open');

  // Slide up animation on next frame
  requestAnimationFrame(() => {
    overlay.classList.add('open');
    // Autofocus first input or textarea if present
    const firstInput = body.querySelector('input:not([type="hidden"]), textarea, select');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 150);
    }
  });

  // Drag down gesture handling
  setupDragToDismiss(handleBar, sheet, () => attemptClose());

  // Click backdrop to dismiss
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && dismissible) {
      attemptClose();
    }
  });

  function attemptClose(fromPopstate = false, force = false) {
    if (!force && typeof onDiscardCheck === 'function') {
      const hasUnsaved = onDiscardCheck();
      if (hasUnsaved) {
        const confirmed = window.confirm('Discard unsaved changes?');
        if (!confirmed) return;
      }
    }
    closeInternal(fromPopstate);
  }

  function closeInternal(fromPopstate = false) {
    overlay.classList.remove('open');
    sheet.style.transform = 'translateY(100%)';

    const index = openSheetsStack.indexOf(sheetController);
    if (index !== -1) {
      openSheetsStack.splice(index, 1);
    }

    if (openSheetsStack.length === 0) {
      document.body.classList.remove('sheet-open');
    }

    if (!fromPopstate && historyPushed) {
      history.back();
    }

    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.remove();
      }
      if (typeof onClose === 'function') {
        onClose();
      }
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    }, 260);
  }

  const sheetController = {
    overlay,
    sheet,
    body,
    close: (force = false) => attemptClose(false, force),
    closeInternal
  };

  openSheetsStack.push(sheetController);

  if (typeof onMount === 'function') {
    onMount(sheetController);
  }

  return sheetController;
}

/**
 * Setup touch drag to dismiss on a handle
 */
function setupDragToDismiss(handleEl, sheetEl, onDismiss) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  handleEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startY = e.touches[0].clientY;
      isDragging = true;
      sheetEl.style.transition = 'none';
    }
  }, { passive: true });

  handleEl.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    currentY = Math.max(0, y - startY);
    sheetEl.style.transform = `translateY(${currentY}px)`;
  }, { passive: true });

  handleEl.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    sheetEl.style.transition = 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)';

    if (currentY > 90) {
      haptic(10);
      sheetEl.style.transform = 'translateY(100%)';
      setTimeout(() => {
        onDismiss();
      }, 150);
    } else {
      sheetEl.style.transform = 'translateY(0)';
    }
    currentY = 0;
  });
}

/**
 * Enhance an existing HTML modal into a mobile bottom sheet
 */
export function enhanceExistingModal(modalOverlayEl, { onDismissCheck = null } = {}) {
  if (!modalOverlayEl) return;

  const dialog = modalOverlayEl.querySelector('.modal-dialog');
  if (!dialog) return;

  // Add drag handle bar if not already present
  if (!dialog.querySelector('.sheet-drag-handle-bar')) {
    const handleBar = document.createElement('div');
    handleBar.className = 'sheet-drag-handle-bar';
    handleBar.innerHTML = '<div class="sheet-drag-handle"></div>';
    dialog.prepend(handleBar);
    setupDragToDismiss(handleBar, dialog, () => {
      closeExistingModal(modalOverlayEl, onDismissCheck);
    });
  }

  // Observe class changes to handle body scroll lock and history
  const observer = new MutationObserver(() => {
    const isHidden = modalOverlayEl.classList.contains('hidden');
    if (!isHidden) {
      document.body.classList.add('sheet-open');
      history.pushState({ modalOpen: true, id: modalOverlayEl.id }, '');
    } else {
      document.body.classList.remove('sheet-open');
    }
  });

  observer.observe(modalOverlayEl, { attributes: true, attributeFilter: ['class'] });

  // Backdrop tap to dismiss
  modalOverlayEl.addEventListener('click', (e) => {
    if (e.target === modalOverlayEl) {
      closeExistingModal(modalOverlayEl, onDismissCheck);
    }
  });
}

function closeExistingModal(modalOverlayEl, onDismissCheck) {
  if (typeof onDismissCheck === 'function') {
    const hasUnsaved = onDismissCheck();
    if (hasUnsaved) {
      const confirmed = window.confirm('Discard unsaved changes?');
      if (!confirmed) return;
    }
  }
  modalOverlayEl.classList.add('hidden');
  document.body.classList.remove('sheet-open');
}
