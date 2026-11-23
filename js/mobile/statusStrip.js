// js/mobile/statusStrip.js - Sticky Status Strip Row 2 & Overflow Menu for Hackdeck Board
import { haptic } from './haptics.js';
import { showToast } from './toast.js';
import { openBottomSheet } from './bottomSheet.js';
import { checkOnlineAction } from './offlineBanner.js';

let countdownTimerId = null;

/**
 * Format live countdown text according to mobile rules:
 * - Tick every second using timestamp diff (Date.now() vs deadline)
 * - Under 24h, drop days (e.g. "05h 12m 03s")
 * - Under 1h, show "12m 03s"
 * - At zero, show "Deadline passed" in danger color
 */
export function formatLiveCountdown(deadlineIso) {
  if (!deadlineIso) return { text: '--h --m --s', isPassed: false, isWarning: false, isDanger: false };
  const deadline = new Date(deadlineIso).getTime();
  if (isNaN(deadline)) return { text: '--h --m --s', isPassed: false, isWarning: false, isDanger: false };

  const now = Date.now();
  const diff = deadline - now;

  if (diff <= 0) {
    return { text: 'Deadline passed', isPassed: true, isWarning: false, isDanger: true };
  }

  const secTotal = Math.floor(diff / 1000);
  const days = Math.floor(secTotal / 86400);
  const hours = Math.floor((secTotal % 86400) / 3600);
  const mins = Math.floor((secTotal % 3600) / 60);
  const secs = secTotal % 60;

  const pad = (n) => String(n).padStart(2, '0');

  let text = '';
  if (days > 0) {
    text = `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
  } else if (hours > 0) {
    text = `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
  } else {
    text = `${pad(mins)}m ${pad(secs)}s`;
  }

  const isDanger = diff < 3600 * 1000; // under 1h
  const isWarning = !isDanger && diff < 24 * 3600 * 1000; // under 24h

  return { text, isPassed: false, isWarning, isDanger };
}

/**
 * Setup Status Strip Row 2
 */
export function initStatusStrip({ hackathon, isLeader, isMember, onBoardUpdate }) {
  let strip = document.getElementById('mobileStatusStrip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'mobileStatusStrip';
    strip.className = 'mobile-status-strip';
    const header = document.querySelector('.board-header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(strip, header.nextSibling);
    } else {
      document.body.prepend(strip);
    }
  }

  function renderStripContent() {
    const isSubmitted = hackathon.phase === 'submitted';
    const isBuild = hackathon.phase === 'build';
    const phaseLabel = isSubmitted ? 'Submitted ✓' : isBuild ? 'Build Sprint' : 'Brainstorm';
    const phaseClass = isSubmitted ? 'phase-submitted' : isBuild ? 'phase-build' : 'phase-brainstorm';

    strip.innerHTML = `
      <div class="status-strip-left">
        <span class="status-strip-phase-pill ${phaseClass}">
          <span>${isSubmitted ? '🏆' : isBuild ? '⚡' : '💡'}</span>
          <span id="mobileStripPhaseText">${phaseLabel}</span>
        </span>
        <span id="mobileStripTimer" class="status-strip-timer">--d --h --m --s</span>
      </div>
      <div class="status-strip-right">
        ${isLeader ? `
          <button type="button" id="mobileBtnMarkSubmitted" class="status-strip-btn-submit" ${isSubmitted ? 'disabled' : ''}>
            ${isSubmitted ? '<span>Submitted ✓</span>' : '<span>Mark as Submitted</span>'}
          </button>
        ` : ''}
      </div>
    `;

    const btnSubmit = strip.querySelector('#mobileBtnMarkSubmitted');
    if (btnSubmit && !isSubmitted) {
      btnSubmit.addEventListener('click', () => {
        haptic(10);
        confirmMarkAsSubmitted(hackathon, onBoardUpdate);
      });
    }

    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const timerEl = strip.querySelector('#mobileStripTimer');
    if (!timerEl) return;

    if (hackathon.phase === 'submitted') {
      timerEl.textContent = 'Submitted for judging';
      timerEl.className = 'status-strip-timer';
      return;
    }

    const { text, isPassed, isWarning, isDanger } = formatLiveCountdown(hackathon.deadline_at);
    timerEl.textContent = text;
    timerEl.className = `status-strip-timer ${isDanger ? 'timer-danger' : isWarning ? 'timer-warning' : ''}`;
  }

  // Live timer tick every 1s
  if (countdownTimerId) clearInterval(countdownTimerId);
  countdownTimerId = setInterval(updateTimerDisplay, 1000);

  // Resync on visibilitychange
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateTimerDisplay();
  });

  renderStripContent();

  // Bind top bar overflow "..." button
  setupOverflowButton({ hackathon, isLeader, isMember, onBoardUpdate });
}

/**
 * Mark as Submitted Confirmation Sheet
 */
function confirmMarkAsSubmitted(hackathon, onBoardUpdate) {
  if (!checkOnlineAction('submit project')) return;

  openBottomSheet({
    title: 'Submit Project',
    subtitle: `Submit "${hackathon.title}"?`,
    contentHtml: `
      <div style="font-size: 14px; color: var(--text-body); line-height: 1.5;">
        <p>You are about to mark your project as finished and submitted for hackathon judging.</p>
        <p style="margin-top: 8px; color: #f5a524; font-weight: 500;">
          ⚠️ Your project showcase and deliverables will be locked for review. You can reopen the build phase if last-minute adjustments are needed before the deadline.
        </p>
      </div>
    `,
    buttons: [
      {
        text: 'Cancel',
        className: 'btn-outline',
        onClick: (_, { close }) => close()
      },
      {
        text: 'Submit Project',
        className: 'btn-primary',
        onClick: async (_, { close }) => {
          haptic(15);
          try {
            if (window.HackdeckBoard && typeof window.HackdeckBoard.markSubmitted === 'function') {
              await window.HackdeckBoard.markSubmitted(true);
            } else if (window.supabaseClient) {
              const now = new Date().toISOString();
              const { error } = await window.supabaseClient
                .from('hackathons')
                .update({ phase: 'submitted', submitted_at: now })
                .eq('id', hackathon.id);
              if (error) throw error;
              hackathon.phase = 'submitted';
              hackathon.submitted_at = now;
              if (onBoardUpdate) onBoardUpdate(hackathon);
            }
            close();
            showToast('🏆 Project successfully marked as submitted!', 'success');
          } catch (err) {
            showToast(err.message || 'Failed to submit project', 'error');
          }
        }
      }
    ]
  });
}

/**
 * Top bar Overflow "..." bottom sheet
 */
function setupOverflowButton({ hackathon, isLeader, isMember, onBoardUpdate }) {
  let overflowBtn = document.getElementById('mobileBoardOverflowBtn');
  if (!overflowBtn) {
    const rightNav = document.querySelector('.board-header-right');
    if (!rightNav) return;
    overflowBtn = document.createElement('button');
    overflowBtn.id = 'mobileBoardOverflowBtn';
    overflowBtn.className = 'mobile-overflow-btn';
    overflowBtn.setAttribute('aria-label', 'Board options');
    overflowBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="1.5"></circle>
        <circle cx="19" cy="12" r="1.5"></circle>
        <circle cx="5" cy="12" r="1.5"></circle>
      </svg>
    `;
    rightNav.appendChild(overflowBtn);
  }

  overflowBtn.onclick = () => {
    haptic(10);
    openOverflowSheet({ hackathon, isLeader, isMember, onBoardUpdate });
  };
}

function openOverflowSheet({ hackathon, isLeader, isMember, onBoardUpdate }) {
  const isPublic = Boolean(hackathon.is_public);
  const currentPhase = hackathon.phase || 'brainstorm';
  const nextPhase = currentPhase === 'brainstorm' ? 'build' : 'brainstorm';
  const switchPhaseLabel = nextPhase === 'build' ? 'Switch to Build Sprint' : 'Switch to Brainstorm Phase';

  const user = window.currentUser || (window.HackdeckBoard && window.HackdeckBoard.getUser());
  const profile = window.currentProfile || (window.HackdeckBoard && window.HackdeckBoard.getProfile());
  const username = profile?.username || user?.email?.split('@')[0] || 'member';

  const content = document.createElement('div');
  content.className = 'sheet-menu-list';

  // 1. Public Toggle Row
  if (isLeader) {
    const publicRow = document.createElement('div');
    publicRow.className = 'sheet-menu-row';
    publicRow.innerHTML = `
      <span>Public Board</span>
      <label class="privacy-switch" style="margin: 0;">
        <input type="checkbox" id="mobileTogglePrivacy" class="privacy-switch-input" ${isPublic ? 'checked' : ''}>
        <span class="privacy-switch-track"><span class="privacy-switch-knob"></span></span>
      </label>
    `;
    const toggleInput = publicRow.querySelector('#mobileTogglePrivacy');
    toggleInput.addEventListener('change', async (e) => {
      if (!checkOnlineAction('change privacy')) {
        toggleInput.checked = isPublic;
        return;
      }
      const newIsPublic = e.target.checked;
      haptic(10);
      hackathon.is_public = newIsPublic;
      showToast(`Board is now ${newIsPublic ? 'Public' : 'Private'}`, 'success');

      try {
        if (window.HackdeckBoard && typeof window.HackdeckBoard.togglePrivacy === 'function') {
          await window.HackdeckBoard.togglePrivacy(newIsPublic);
        } else if (window.supabaseClient) {
          await window.supabaseClient.from('hackathons').update({ is_public: newIsPublic }).eq('id', hackathon.id);
        }
      } catch (err) {
        hackathon.is_public = isPublic;
        toggleInput.checked = isPublic;
        showToast('Failed to update visibility', 'error');
      }
    });
    content.appendChild(publicRow);
  }

  // 2. Copy Link Row
  const copyRow = document.createElement('div');
  copyRow.className = 'sheet-menu-row';
  copyRow.innerHTML = `
    <span>Copy Workspace Link</span>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
  copyRow.addEventListener('click', async () => {
    haptic(10);
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      showToast('Link copied to clipboard!', 'success');
    } catch (_) {
      showToast('Could not copy link', 'error');
    }
  });
  content.appendChild(copyRow);

  // 3. Official Event URL Row
  if (hackathon.event_url) {
    const eventRow = document.createElement('a');
    eventRow.className = 'sheet-menu-row';
    eventRow.href = hackathon.event_url;
    eventRow.target = '_blank';
    eventRow.rel = 'noopener noreferrer';
    eventRow.innerHTML = `
      <span>Official Hackathon Page</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    `;
    content.appendChild(eventRow);
  }

  // 4. Switch Phase Row (Leader only)
  if (isLeader) {
    const switchRow = document.createElement('div');
    switchRow.className = 'sheet-menu-row';
    switchRow.innerHTML = `
      <span>${switchPhaseLabel}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    switchRow.addEventListener('click', () => {
      haptic(10);
      sheet.close();
      confirmSwitchPhase(hackathon, nextPhase, onBoardUpdate);
    });
    content.appendChild(switchRow);
  }

  // 5. Delete Board Row (Leader only, destructive)
  if (isLeader) {
    const deleteRow = document.createElement('div');
    deleteRow.className = 'sheet-menu-row row-danger';
    deleteRow.innerHTML = `
      <span>Delete Hackathon Workspace</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    deleteRow.addEventListener('click', () => {
      haptic(10);
      sheet.close();
      confirmDeleteBoard(hackathon);
    });
    content.appendChild(deleteRow);
  }

  // 6. User info at bottom
  const userRow = document.createElement('div');
  userRow.className = 'sheet-menu-user-row';
  userRow.innerHTML = `
    <div class="user-avatar" style="width: 34px; height: 34px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-weight: 600;">
      ${(username[0] || 'U').toUpperCase()}
    </div>
    <div style="flex: 1;">
      <div style="font-weight: 600; font-size: 14px;">@${username}</div>
      <div style="font-size: 11px; color: var(--text-muted);">Signed in</div>
    </div>
  `;
  content.appendChild(userRow);

  const sheet = openBottomSheet({
    title: 'Workspace Options',
    subtitle: hackathon.title,
    contentHtml: content
  });
}

/**
 * Switch Phase Confirmation Sheet
 */
function confirmSwitchPhase(hackathon, nextPhase, onBoardUpdate) {
  if (!checkOnlineAction('switch phase')) return;

  const phaseTitle = nextPhase === 'build' ? 'Build Sprint' : 'Brainstorming';

  openBottomSheet({
    title: `Switch to ${phaseTitle}`,
    subtitle: `Transition "${hackathon.title}"?`,
    contentHtml: `
      <p style="font-size: 14px; color: var(--text-body); line-height: 1.5;">
        All collaborators will instantly transition to the <strong>${phaseTitle}</strong> phase in real-time.
      </p>
    `,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Switch Phase',
        className: 'btn-primary',
        onClick: async (_, { close }) => {
          haptic(15);
          try {
            if (window.HackdeckBoard && typeof window.HackdeckBoard.switchPhase === 'function') {
              await window.HackdeckBoard.switchPhase(nextPhase, true);
            } else if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .update({ phase: nextPhase })
                .eq('id', hackathon.id);
              if (error) throw error;
              hackathon.phase = nextPhase;
              if (onBoardUpdate) onBoardUpdate(hackathon);
            }
            close();
            showToast(`Workspace transitioned to ${phaseTitle}!`, 'success');
          } catch (err) {
            showToast(err.message || 'Failed to switch phase', 'error');
          }
        }
      }
    ]
  });
}

/**
 * Delete Board Confirmation Sheet
 */
export function confirmDeleteBoard(hackathon) {
  if (!checkOnlineAction('delete workspace')) return;

  openBottomSheet({
    title: 'Delete Hackathon Workspace',
    subtitle: `Permanently delete "${hackathon.title}"?`,
    contentHtml: `
      <div style="font-size: 14px; color: var(--text-body); line-height: 1.5;">
        <p>This action cannot be undone. All tasks, sprint boards, brainstorm ideas, and team chat messages will be permanently deleted.</p>
      </div>
    `,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Delete Board',
        className: 'btn-danger',
        onClick: async (_, { close }) => {
          haptic(20);
          try {
            if (window.HackdeckBoard && typeof window.HackdeckBoard.deleteBoard === 'function') {
              await window.HackdeckBoard.deleteBoard(true);
            } else if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .delete()
                .eq('id', hackathon.id);
              if (error) throw error;
              close();
              showToast('Hackathon workspace deleted.', 'success');
              setTimeout(() => {
                window.location.href = 'index.html';
              }, 400);
            }
          } catch (err) {
            showToast(err.message || 'Failed to delete workspace', 'error');
          }
        }
      }
    ]
  });
}
