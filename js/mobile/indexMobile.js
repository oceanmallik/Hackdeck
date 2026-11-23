// js/mobile/indexMobile.js - Mobile Dashboard Engine for Hackdeck
import { haptic } from './haptics.js';
import { showToast } from './toast.js';
import { openBottomSheet, enhanceExistingModal } from './bottomSheet.js';
import { initOfflineBanner, checkOnlineAction } from './offlineBanner.js';
import { setupPullToRefresh } from './pullToRefresh.js';

export function initIndexMobile() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;

  // 1. Initialize offline banner
  initOfflineBanner();

  // 2. Setup Top Bar Avatar sheet
  setupAvatarSheet();

  // 3. Setup Welcome Block New Hackathon full-width trigger
  setupWelcomeNewHackathonButton();

  // 4. Enhance Filter Chips with scroll restoration and per-filter empty states
  setupMobileFilters();

  // 5. Enhance Hackathon Cards (card tap navigation, minute-tick countdown, delete confirmation sheet)
  setupMobileCards();

  // 6. Enhance Create Hackathon Modal as a bottom sheet with form validations
  setupCreateHackathonSheet();

  // 7. Pull to refresh
  setupPullToRefresh(document.body, async () => {
    if (typeof window.loadMyHackathons === 'function') {
      await window.loadMyHackathons();
      showToast('Dashboard refreshed', 'success');
    }
  });

  // 8. Restore scroll position from sessionStorage
  restoreDashboardState();
}

/**
 * Top Bar Avatar trigger -> small bottom sheet with @handle, tagline, and Sign Out
 */
function setupAvatarSheet() {
  const profileBadge = document.querySelector('.user-profile-badge');
  if (!profileBadge) return;

  profileBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    haptic(10);

    const user = window.currentUser || (window.HackdeckAuth && window.HackdeckAuth.getUser && window.HackdeckAuth.getUser());
    const profile = window.currentProfile || (window.HackdeckAuth && window.HackdeckAuth.getProfile && window.HackdeckAuth.getProfile());
    const username = profile?.username || user?.email?.split('@')[0] || 'hacker';
    const initial = (username[0] || 'H').toUpperCase();

    const content = document.createElement('div');
    content.className = 'sheet-menu-list';
    content.innerHTML = `
      <div style="display: flex; align-items: center; gap: 14px; padding: 12px 0 16px 0; border-bottom: 1px solid var(--border);">
        <div class="user-avatar" style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; border: 1px solid var(--border);">
          ${initial}
        </div>
        <div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-primary);">@${username}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">A Notepad for Devs</div>
        </div>
      </div>
      <div style="margin-top: 14px;">
        <button type="button" id="mobileSheetSignOutBtn" class="btn btn-outline" style="width: 100%; height: 44px; justify-content: center; color: var(--danger); border-color: var(--danger-border); font-weight: 600;">
          Sign Out
        </button>
      </div>
    `;

    const sheet = openBottomSheet({
      title: 'Profile',
      contentHtml: content
    });

    const signOutBtn = content.querySelector('#mobileSheetSignOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        haptic(15);
        sheet.close();
        const desktopSignOut = document.getElementById('btnSignOut');
        if (desktopSignOut) {
          desktopSignOut.click();
        } else if (window.supabaseClient) {
          await window.supabaseClient.auth.signOut();
          window.location.reload();
        }
      });
    }
  });
}

/**
 * Welcome block "+ New Hackathon" full-width button
 */
function setupWelcomeNewHackathonButton() {
  const container = document.querySelector('.dashboard-header-actions');
  if (!container) return;
  const btn = container.querySelector('.btn-open-create-hackathon');
  if (btn) {
    btn.onclick = (e) => {
      e.preventDefault();
      haptic(10);
      openCreateModalSheet();
    };
  }
}

/**
 * Filter Chips: Instant filtering, smooth scroll into view, per-filter empty states
 */
function setupMobileFilters() {
  const filterChips = document.querySelectorAll('.filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      haptic(10);
      chip.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
      const filterVal = chip.getAttribute('data-filter') || chip.textContent.trim().toLowerCase();
      sessionStorage.setItem('hackdeck_dashboard_filter', filterVal);
      setTimeout(() => checkPerFilterEmptyState(filterVal), 60);
    });
  });
}

function checkPerFilterEmptyState(filterVal) {
  const grid = document.getElementById('myHackathonsGrid');
  if (!grid) return;
  const cards = grid.querySelectorAll('.white-hackathon-card');
  const visibleCards = Array.from(cards).filter(c => c.style.display !== 'none');

  if (visibleCards.length === 0 && !grid.querySelector('.empty-hackathons-state')) {
    let emptyMsg = `No ${filterVal} hackathons found`;
    if (filterVal === 'ongoing') emptyMsg = 'No ongoing hackathons';
    if (filterVal === 'ended') emptyMsg = 'No ended hackathons';
    if (filterVal === 'public') emptyMsg = 'No public hackathons';

    const emptyBox = document.createElement('div');
    emptyBox.className = 'empty-filter-state';
    emptyBox.style.cssText = 'padding: 40px 16px; text-align: center; color: var(--text-muted); width: 100%;';
    emptyBox.innerHTML = `
      <div style="font-size: 28px; margin-bottom: 8px;">📂</div>
      <div style="font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">${emptyMsg}</div>
      <p style="font-size: 13px; margin-bottom: 16px;">Launch a new workspace board or explore other filters.</p>
      <button type="button" class="btn btn-primary btn-sm btn-open-create-hackathon" style="margin: 0 auto; height: 44px; padding: 0 16px;">
        + New Hackathon
      </button>
    `;

    emptyBox.querySelector('.btn-open-create-hackathon')?.addEventListener('click', () => {
      haptic(10);
      openCreateModalSheet();
    });

    grid.prepend(emptyBox);
  } else if (visibleCards.length > 0) {
    grid.querySelector('.empty-filter-state')?.remove();
  }
}

/**
 * Mobile Hackathon Cards:
 * - Whole card click opens workspace
 * - Delete button stops propagation and opens confirmation sheet
 * - Updates countdown text every minute (tabular-nums)
 */
function setupMobileCards() {
  const grid = document.getElementById('myHackathonsGrid');
  if (!grid) return;

  function enhanceCards() {
    const cards = grid.querySelectorAll('.white-hackathon-card');
    cards.forEach(card => {
      if (card._mobileEnhanced) return;
      card._mobileEnhanced = true;

      const hackathonId = card.getAttribute('data-hackathon-id');
      const deleteBtn = card.querySelector('.btn-delete-hackathon');

      // Tapping anywhere on hackathon card opens workspace (ignore if dragging to scroll)
      let touchStartX = 0;
      let touchStartY = 0;
      let cardMoved = false;

      card.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          cardMoved = false;
        }
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
          const dx = Math.abs(e.touches[0].clientX - touchStartX);
          const dy = Math.abs(e.touches[0].clientY - touchStartY);
          if (dx > 10 || dy > 10) {
            cardMoved = true;
          }
        }
      }, { passive: true });

      card.addEventListener('click', (e) => {
        if (cardMoved) {
          cardMoved = false;
          return;
        }
        if (e.target.closest('.btn-delete-hackathon') || e.target.closest('.hk-devpost-link')) return;
        haptic(10);
        // Save current scroll & filter before navigating
        sessionStorage.setItem('hackdeck_dashboard_scroll', String(window.scrollY));
        window.location.href = `board.html?id=${encodeURIComponent(hackathonId)}`;
      });

      // Intercept delete button to show custom bottom sheet confirmation
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          haptic(10);
          const title = deleteBtn.getAttribute('data-hackathon-title') || 'this hackathon';
          confirmDeleteHackathon(hackathonId, title);
        }, true); // capturing to supersede native window.confirm
      }
    });
  }

  enhanceCards();

  const observer = new MutationObserver(() => enhanceCards());
  observer.observe(grid, { childList: true });

  // Update card countdowns every 1 minute
  setInterval(updateCardCountdownsMinute, 60000);
}

function updateCardCountdownsMinute() {
  const countdownEls = document.querySelectorAll('.hk-countdown-value');
  countdownEls.forEach(el => {
    const deadlineStr = el.getAttribute('data-deadline');
    if (!deadlineStr) return;
    const deadline = new Date(deadlineStr).getTime();
    const diff = deadline - Date.now();
    if (diff <= 0) {
      el.textContent = '00d 00h';
      return;
    }
    const days = Math.floor(diff / (1000 * 86400));
    const hours = Math.floor((diff % (1000 * 86400)) / (1000 * 3600));
    el.textContent = `${days}d ${hours}h`;
  });
}

function confirmDeleteHackathon(hackathonId, title) {
  if (!checkOnlineAction('delete hackathon')) return;

  openBottomSheet({
    title: 'Delete Hackathon',
    subtitle: `Permanently delete "${title}"?`,
    contentHtml: `
      <div style="font-size: 14px; color: var(--text-body); line-height: 1.5;">
        <p>This action cannot be undone. All tasks, sprint boards, brainstorm ideas, and team chat messages will be permanently deleted.</p>
      </div>
    `,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Delete',
        className: 'btn-danger',
        onClick: async (_, { close }) => {
          haptic(20);
          try {
            if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .delete()
                .eq('id', hackathonId);
              if (error) throw error;
              close();
              showToast(`Hackathon "${title}" deleted.`, 'success');
              if (typeof window.loadMyHackathons === 'function') {
                await window.loadMyHackathons();
              }
            }
          } catch (err) {
            showToast(err.message || 'Failed to delete hackathon', 'error');
          }
        }
      }
    ]
  });
}

/**
 * Enhance Create Hackathon Modal into a mobile bottom sheet with inline validation
 */
function setupCreateHackathonSheet() {
  const modal = document.getElementById('createHackathonModal');
  if (!modal) return;

  const form = document.getElementById('createHackathonForm');
  const titleInput = document.getElementById('hackathonTitle');
  const urlInput = document.getElementById('hackathonEventUrl');
  const deadlineInput = document.getElementById('hackathonDeadline');
  const submitBtn = document.getElementById('btnSubmitCreateHackathon');

  // Enhance modal dialog with drag handle
  enhanceExistingModal(modal, {
    onDismissCheck: () => {
      const hasTitle = titleInput && titleInput.value.trim().length > 0;
      const hasUrl = urlInput && urlInput.value.trim().length > 0;
      return hasTitle || hasUrl;
    }
  });

  // Auto-prepend https:// on event URL blur
  if (urlInput) {
    urlInput.setAttribute('autocapitalize', 'off');
    urlInput.setAttribute('autocorrect', 'off');
    urlInput.setAttribute('spellcheck', 'false');
    urlInput.setAttribute('inputmode', 'url');

    urlInput.addEventListener('blur', () => {
      let val = urlInput.value.trim();
      if (val && !/^https?:\/\//i.test(val)) {
        urlInput.value = 'https://' + val;
      }
    });
  }

  // Next / Return key on single-line inputs
  if (titleInput) {
    titleInput.setAttribute('enterkeyhint', 'next');
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        urlInput?.focus();
      }
    });
  }

  if (urlInput) {
    urlInput.setAttribute('enterkeyhint', 'next');
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        deadlineInput?.focus();
      }
    });
  }
}

function openCreateModalSheet() {
  const modal = document.getElementById('createHackathonModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('sheet-open');
    setTimeout(() => {
      document.getElementById('hackathonTitle')?.focus();
    }, 150);
  }
}

function restoreDashboardState() {
  // Restore filter
  const savedFilter = sessionStorage.getItem('hackdeck_dashboard_filter');
  if (savedFilter) {
    const chip = document.querySelector(`.filter-chip[data-filter="${savedFilter}"]`);
    if (chip) chip.click();
  }

  // Restore scroll position
  const savedScroll = sessionStorage.getItem('hackdeck_dashboard_scroll');
  if (savedScroll) {
    setTimeout(() => {
      window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'auto' });
      sessionStorage.removeItem('hackdeck_dashboard_scroll');
    }, 120);
  }
}

// Auto-run if mobile
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndexMobile);
} else {
  initIndexMobile();
}
