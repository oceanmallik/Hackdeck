// js/mobile/kanbanMobile.js - Mobile Kanban Experience for Hackdeck
import { haptic } from './haptics.js';
import { showToast } from './toast.js';
import { openBottomSheet } from './bottomSheet.js';
import { checkOnlineAction } from './offlineBanner.js';

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' }
];

let activeColumnIndex = 0;
let pendingDeletions = new Map(); // taskId -> { timer, task, cardEl, parentEl, nextSibling }

export function initKanbanMobile({ kanbanEl }) {
  if (!kanbanEl) return;

  // Restore last active column from sessionStorage
  const savedCol = sessionStorage.getItem('hackdeck_kanban_active_col');
  if (savedCol) {
    const idx = COLUMNS.findIndex(c => c.key === savedCol);
    if (idx !== -1) activeColumnIndex = idx;
  }

  // Expose global hook for build.js to re-enhance cards after render
  window.HackdeckKanbanMobile = {
    enhanceCards: () => {
      try {
        enhanceKanbanCards(kanbanEl);
        updateChipCounts();
      } catch (err) {
        console.warn('HackdeckKanbanMobile enhanceCards error:', err);
      }
    }
  };

  // Setup Sticky Chip Strip above kanban
  setupKanbanChipStrip(kanbanEl);

  // Sync horizontal scrolling with chip strip
  setupColumnScrollSync(kanbanEl);

  // Setup FAB button for Add Task
  setupAddTaskFAB();

  // Enhance task cards with long-press, tap-to-edit, and instant undo deletion
  enhanceKanbanCards(kanbanEl);

  // Setup Column header '+' buttons
  setupColumnAddButtons(kanbanEl);

  // Scroll to saved column initially
  setTimeout(() => {
    scrollToColumn(kanbanEl, activeColumnIndex, false);
  }, 100);
}

function setupKanbanChipStrip(kanbanEl) {
  let strip = document.getElementById('kanbanMobileStrip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'kanbanMobileStrip';
    strip.className = 'kanban-mobile-strip';
    kanbanEl.parentNode.insertBefore(strip, kanbanEl);
  }

  renderChipStrip(strip, kanbanEl);

  // Observe task count mutations on the count badges directly
  const counters = kanbanEl.querySelectorAll('.kanban-task-count');
  counters.forEach(counter => {
    const observer = new MutationObserver(() => {
      renderChipStrip(strip, kanbanEl);
    });
    observer.observe(counter, { childList: true, characterData: true, subtree: true });
  });
}

function updateChipCounts() {
  const strip = document.getElementById('kanbanMobileStrip');
  const kanbanEl = document.getElementById('kanbanBoard');
  if (strip && kanbanEl) {
    renderChipStrip(strip, kanbanEl);
  }
}

function renderChipStrip(strip, kanbanEl) {
  strip.innerHTML = '';
  COLUMNS.forEach((col, idx) => {
    const countEl = document.getElementById(`count-${col.key}`);
    const count = countEl ? countEl.textContent.trim() : '0';

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `kanban-mobile-chip ${idx === activeColumnIndex ? 'active' : ''}`;
    chip.innerHTML = `
      <span>${col.label}</span>
      <span class="chip-count">${count}</span>
    `;

    chip.addEventListener('click', () => {
      haptic(10);
      activeColumnIndex = idx;
      sessionStorage.setItem('hackdeck_kanban_active_col', col.key);
      updateActiveChip(strip, idx);
      scrollToColumn(kanbanEl, idx, true);
    });

    strip.appendChild(chip);
  });
}

function updateActiveChip(strip, activeIdx) {
  const chips = strip.querySelectorAll('.kanban-mobile-chip');
  chips.forEach((c, i) => {
    if (i === activeIdx) {
      c.classList.add('active');
      c.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    } else {
      c.classList.remove('active');
    }
  });
}

function scrollToColumn(kanbanEl, idx, smooth = true) {
  const colKey = COLUMNS[idx]?.key;
  if (!colKey) return;
  const colEl = kanbanEl.querySelector(`[data-status="${colKey}"]`);
  if (colEl) {
    colEl.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      inline: 'center',
      block: 'nearest'
    });
  }
}

function setupColumnScrollSync(kanbanEl) {
  let scrollTimeout = null;

  kanbanEl.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const scrollLeft = kanbanEl.scrollLeft;
      const colWidth = kanbanEl.clientWidth * 0.88;
      const newIdx = Math.min(
        COLUMNS.length - 1,
        Math.max(0, Math.round(scrollLeft / colWidth))
      );

      if (newIdx !== activeColumnIndex) {
        activeColumnIndex = newIdx;
        sessionStorage.setItem('hackdeck_kanban_active_col', COLUMNS[newIdx].key);
        const strip = document.getElementById('kanbanMobileStrip');
        if (strip) updateActiveChip(strip, newIdx);
      }
    }, 60);
  }, { passive: true });
}

function setupAddTaskFAB() {
  let fab = document.getElementById('mobileFabAddTask');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'mobileFabAddTask';
    fab.className = 'mobile-fab-add-task';
    fab.setAttribute('aria-label', 'Add new task');
    fab.innerHTML = '+';
    document.body.appendChild(fab);
  }

  fab.onclick = () => {
    haptic(10);
    openTaskSheetForColumn('todo');
  };
}

function setupColumnAddButtons(kanbanEl) {
  const addBtns = kanbanEl.querySelectorAll('.btn-col-add-task');
  addBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      haptic(10);
      const status = btn.getAttribute('data-status') || 'todo';
      openTaskSheetForColumn(status);
    };
  });
}

function openTaskSheetForColumn(defaultStatus) {
  const selectStatus = document.getElementById('taskStatusInput');
  if (selectStatus) selectStatus.value = defaultStatus;

  // Use existing build.js modal opening if present
  if (window.HackdeckBuild && typeof window.HackdeckBuild.openCreateTaskModal === 'function') {
    window.HackdeckBuild.openCreateTaskModal(defaultStatus);
    return;
  }

  const modal = document.getElementById('createTaskModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('sheet-open');
  }
}

/**
 * Enhance cards inside columns for mobile:
 * - Tap to open edit sheet
 * - Long press (400ms) to lift and show "Move to..." sheet
 * - Delete button: instant optimistic removal + 5s Undo toast
 */
export function enhanceKanbanCards(kanbanEl) {
  if (!kanbanEl) return;
  const cards = kanbanEl.querySelectorAll('.kanban-task-card, .kanban-card-preview');

  cards.forEach(card => {
    const taskId = card.getAttribute('data-task-id') || card.id?.replace('task-', '');
    if (!taskId) return;

    // 1. ALWAYS attach/refresh mobile move action buttons regardless of event listener state
    attachTaskMoveButtons(card, taskId);

    if (card._mobileEnhanced) return;
    card._mobileEnhanced = true;

    // 2. Tap anywhere on card to edit (ignore if dragging to scroll)
    card.addEventListener('click', (e) => {
      if (moved) {
        moved = false;
        return;
      }
      // Ignore if clicking action buttons or move buttons inside card
      if (e.target.closest('.btn-task-action') || e.target.closest('.btn-delete-task') || e.target.closest('.btn-task-move') || e.target.closest('.mobile-task-move-bar')) return;
      haptic(10);
      if (window.HackdeckBuild && typeof window.HackdeckBuild.openEditTaskModal === 'function') {
        window.HackdeckBuild.openEditTaskModal(taskId);
      } else {
        const editBtn = card.querySelector('.btn-edit-task');
        if (editBtn) editBtn.click();
      }
    });

    // 3. Long press (400ms, cancel if moved > 8px)
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    let moved = false;

    card.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;

      pressTimer = setTimeout(() => {
        if (!moved) {
          haptic(15);
          card.classList.add('is-lifting');
          openMoveTaskSheet(taskId, card);
        }
      }, 400);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 8 || dy > 8) {
        moved = true;
        if (pressTimer) clearTimeout(pressTimer);
        card.classList.remove('is-lifting');
      }
    }, { passive: true });

    card.addEventListener('touchend', () => {
      if (pressTimer) clearTimeout(pressTimer);
      card.classList.remove('is-lifting');
    });

    card.addEventListener('touchcancel', () => {
      if (pressTimer) clearTimeout(pressTimer);
      card.classList.remove('is-lifting');
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Block native context menu on long-press
    });

    // 4. Delete Task Button: Instant removal + 5s Undo Toast
    const deleteBtn = card.querySelector('.btn-delete-task, .btn-trigger-delete-task');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleInstantTaskDelete(taskId, card);
      });
    }
  });
}

function attachTaskMoveButtons(card, taskId) {
  if (!card) return;

  let moveBar = card.querySelector('.mobile-task-move-bar');
  if (moveBar && moveBar.children.length > 0) {
    return;
  }

  if (!moveBar) {
    moveBar = document.createElement('div');
    moveBar.className = 'mobile-task-move-bar';
    card.appendChild(moveBar);
  }

  const currentStatus = card.getAttribute('data-status') ||
    card.closest('.kanban-column')?.getAttribute('data-status') ||
    card.closest('.kanban-tasks-list')?.id?.replace('tasks-', '') ||
    'todo';

  const colIdx = Math.max(0, COLUMNS.findIndex(c => c.key === currentStatus));

  moveBar.innerHTML = '';

  // 1. Previous column button (if colIdx > 0)
  if (colIdx > 0) {
    const prevCol = COLUMNS[colIdx - 1];
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn-task-move btn-move-prev';
    prevBtn.setAttribute('data-target-status', prevCol.key);
    prevBtn.setAttribute('aria-label', `Move to ${prevCol.label}`);
    const prevLabel = colIdx === 3 ? 'Reopen' : prevCol.label;
    prevBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6"></polyline></svg>
      <span>${prevLabel}</span>
    `;
    prevBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      haptic(10);
      await moveTaskToColumn(taskId, prevCol.key, prevCol.label);
    });
    moveBar.appendChild(prevBtn);
  }

  // 2. Next column button (if colIdx < COLUMNS.length - 1)
  if (colIdx < COLUMNS.length - 1) {
    const nextCol = COLUMNS[colIdx + 1];
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn-task-move btn-move-next';
    nextBtn.setAttribute('data-target-status', nextCol.key);
    nextBtn.setAttribute('aria-label', `Move to ${nextCol.label}`);
    const nextLabel = colIdx === 0 ? 'In Progress' : (colIdx === 2 ? 'Done' : nextCol.label);
    nextBtn.innerHTML = `
      <span>${nextLabel}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 18 15 12 9 6"></polyline></svg>
    `;
    nextBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      haptic(10);
      await moveTaskToColumn(taskId, nextCol.key, nextCol.label);
    });
    moveBar.appendChild(nextBtn);
  }

  // 3. Middle / Overflow "Move..." picker sheet button
  const pickerBtn = document.createElement('button');
  pickerBtn.type = 'button';
  pickerBtn.className = 'btn-task-move btn-move-picker';
  pickerBtn.setAttribute('aria-label', 'Open column selector');
  pickerBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 10 12 15 17 10"></polyline></svg>
    <span>Move...</span>
  `;
  pickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    haptic(10);
    openMoveTaskSheet(taskId, card);
  });
  moveBar.appendChild(pickerBtn);
}

async function moveTaskToColumn(taskId, targetKey, targetLabel) {
  if (window.HackdeckBuild && typeof window.HackdeckBuild.moveTaskToStatus === 'function') {
    await window.HackdeckBuild.moveTaskToStatus(taskId, targetKey);
    showToast(`Task moved to ${targetLabel}`, 'success');
  }
}

/**
 * Instant Task Delete with 5s Undo Toast
 */
function handleInstantTaskDelete(taskId, cardEl) {
  if (!checkOnlineAction('delete task')) return;

  haptic(15);
  const parent = cardEl.parentElement;
  const nextSibling = cardEl.nextSibling;
  const taskTitle = cardEl.querySelector('.ktask-title, .kcard-title')?.textContent.trim() || 'Task';

  // Optimistic instant removal from DOM
  cardEl.remove();

  // Update column counter if present
  updateParentColumnCount(parent, -1);

  // Setup undo timeout
  const timer = setTimeout(async () => {
    pendingDeletions.delete(taskId);
    try {
      if (window.HackdeckBuild && typeof window.HackdeckBuild.deleteTask === 'function') {
        await window.HackdeckBuild.deleteTask(taskId, true); // true = skip confirm
      } else if (window.supabaseClient) {
        await window.supabaseClient.from('tasks').delete().eq('id', taskId);
      }
    } catch (err) {
      console.error('Failed to delete task from Supabase:', err);
    }
  }, 5000);

  pendingDeletions.set(taskId, {
    timer,
    cardEl,
    parent,
    nextSibling
  });

  showToast(`Deleted "${taskTitle}"`, 'info', {
    text: 'Undo',
    onClick: () => {
      // Restore card to DOM
      const pending = pendingDeletions.get(taskId);
      if (pending) {
        clearTimeout(pending.timer);
        if (pending.nextSibling && pending.parent.contains(pending.nextSibling)) {
          pending.parent.insertBefore(pending.cardEl, pending.nextSibling);
        } else {
          pending.parent.appendChild(pending.cardEl);
        }
        updateParentColumnCount(pending.parent, 1);
        pendingDeletions.delete(taskId);
        showToast('Task restored', 'success');
      }
    }
  }, 5000);
}

function updateParentColumnCount(listEl, delta) {
  if (!listEl) return;
  const colEl = listEl.closest('.kanban-column');
  if (!colEl) return;
  const countEl = colEl.querySelector('.kanban-task-count');
  if (countEl) {
    const current = parseInt(countEl.textContent, 10) || 0;
    countEl.textContent = String(Math.max(0, current + delta));
  }
}

/**
 * Move Task Sheet
 */
function openMoveTaskSheet(taskId, cardEl) {
  const currentStatus = cardEl.closest('.kanban-column')?.getAttribute('data-status') || 'todo';
  const taskTitle = cardEl.querySelector('.ktask-title, .kcard-title')?.textContent.trim() || 'Task';

  const content = document.createElement('div');
  content.className = 'sheet-menu-list';

  COLUMNS.forEach(col => {
    const isCurrent = col.key === currentStatus;
    const row = document.createElement('div');
    row.className = 'sheet-menu-row';
    row.style.background = isCurrent ? 'var(--bg-elevated)' : 'var(--bg-card)';
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: ${isCurrent ? '700' : '500'};">${col.label}</span>
        ${isCurrent ? '<span style="font-size: 11px; color: var(--accent);">(Current)</span>' : ''}
      </div>
      ${isCurrent ? '<span style="color: var(--accent); font-weight: 700;">✓</span>' : ''}
    `;

    if (!isCurrent) {
      row.addEventListener('click', async () => {
        haptic(10);
        sheet.close();
        await moveTaskToTargetColumn(taskId, col.key, col.label, currentStatus);
      });
    }

    content.appendChild(row);
  });

  const sheet = openBottomSheet({
    title: 'Move Task',
    subtitle: taskTitle,
    contentHtml: content
  });
}

async function moveTaskToTargetColumn(taskId, targetColKey, targetColLabel, previousColKey) {
  if (!checkOnlineAction('move task')) return;

  try {
    if (window.HackdeckBuild && typeof window.HackdeckBuild.moveTaskToStatus === 'function') {
      await window.HackdeckBuild.moveTaskToStatus(taskId, targetColKey);
    } else if (window.supabaseClient) {
      await window.supabaseClient.from('tasks').update({ status: targetColKey }).eq('id', taskId);
    }

    showToast(`Moved to ${targetColLabel}`, 'success', {
      text: 'Undo',
      onClick: async () => {
        if (window.HackdeckBuild && typeof window.HackdeckBuild.moveTaskToStatus === 'function') {
          await window.HackdeckBuild.moveTaskToStatus(taskId, previousColKey);
        } else if (window.supabaseClient) {
          await window.supabaseClient.from('tasks').update({ status: previousColKey }).eq('id', taskId);
        }
        showToast('Moved back', 'info');
      }
    });
  } catch (err) {
    showToast(err.message || 'Failed to move task', 'error');
  }
}
