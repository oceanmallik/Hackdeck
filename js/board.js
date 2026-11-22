// js/board.js - Real-time Hackathon Board & Workspace Engine for Hackdeck
(() => {
  // Current board state
  let currentHackathon = null;
  let currentUser = null;
  let currentProfile = null;
  let isLeader = false;
  let isMember = false;
  let isSpectator = false;

  let countdownIntervalId = null;
  let realtimeChannel = null;

  // DOM Elements - Navigation & Headers
  const boardLoadingState = document.getElementById('boardLoadingState');
  const accessDeniedScreen = document.getElementById('accessDeniedScreen');
  const boardMainContent = document.getElementById('boardMainContent');

  const boardTitle = document.getElementById('boardTitle');
  const boardEventUrl = document.getElementById('boardEventUrl');
  const boardPhaseBadge = document.getElementById('boardPhaseBadge');
  const phaseBadgeIcon = document.getElementById('phaseBadgeIcon');
  const phaseBadgeText = document.getElementById('phaseBadgeText');
  const spectatorBadge = document.getElementById('spectatorBadge');
  const spectatorBanner = document.getElementById('spectatorBanner');

  // Countdown Elements
  const deadlineCountdown = document.getElementById('deadlineCountdown');
  const countdownTimerText = document.getElementById('countdownTimerText');

  // Leader Controls
  const leaderControlsContainer = document.getElementById('leaderControlsContainer');
  const toggleIsPublic = document.getElementById('toggleIsPublic');
  const privacyStatusLabel = document.getElementById('privacyStatusLabel');
  const btnCopyShareLink = document.getElementById('btnCopyShareLink');
  const btnTogglePhase = document.getElementById('btnTogglePhase');
  const phaseActionText = document.getElementById('phaseActionText');

  // Auth Header Chip
  const boardAuthBadge = document.getElementById('boardAuthBadge');
  const boardUserAvatar = document.getElementById('boardUserAvatar');
  const boardUserHandle = document.getElementById('boardUserHandle');

  // Phase Containers
  const phaseBrainstormContainer = document.getElementById('phaseBrainstormContainer');
  const phaseBuildContainer = document.getElementById('phaseBuildContainer');

  // Chat Panel Elements
  const teamChatPanel = document.getElementById('teamChatPanel');
  const teamChatPopup = document.getElementById('teamChatPopup');
  const btnToggleChat = document.getElementById('btnToggleChat');
  const btnCloseChat = document.getElementById('btnCloseChat');

  /**
   * Safe HTML Escaper
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Display "Private or Not Found" access denied screen
   */
  function showNotFoundScreen() {
    if (boardLoadingState) boardLoadingState.classList.add('hidden');
    if (boardMainContent) boardMainContent.classList.add('hidden');
    if (accessDeniedScreen) accessDeniedScreen.classList.remove('hidden');
    document.title = 'Private or Not Found — Hackdeck';
  }

  /**
   * Update Live Submission Deadline Countdown Timer
   * Format: DDd HHh MMm SSs
   * Turns amber under 6 hours, red under 1 hour
   */
  function updateCountdownTimer() {
    if (!currentHackathon || !currentHackathon.deadline_at) {
      if (countdownTimerText) countdownTimerText.textContent = '--d --h --m --s';
      return;
    }

    const deadline = new Date(currentHackathon.deadline_at).getTime();
    const now = Date.now();
    const diff = deadline - now;

    if (!countdownTimerText || !deadlineCountdown) return;

    if (diff <= 0) {
      countdownTimerText.textContent = '00d 00h 00m 00s (Ended)';
      deadlineCountdown.className = 'countdown-badge countdown-ended';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    countdownTimerText.textContent = `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;

    // Calculate total hours remaining for urgency thresholds
    const hoursRemaining = diff / (1000 * 60 * 60);

    if (hoursRemaining < 1) {
      // Under 1 hour: Red urgent with heartbeat pulse
      deadlineCountdown.className = 'countdown-badge countdown-red';
    } else if (hoursRemaining < 6) {
      // Under 6 hours: Amber warning
      deadlineCountdown.className = 'countdown-badge countdown-amber';
    } else {
      // Normal state
      deadlineCountdown.className = 'countdown-badge countdown-normal';
    }
  }

  /**
   * Start 1-second interval ticker for countdown
   */
  function startCountdownTicker() {
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    updateCountdownTimer();
    countdownIntervalId = setInterval(updateCountdownTimer, 1000);
  }

  /**
   * Apply Phase UI (Brainstorm vs Build)
   */
  function applyPhaseUI(phase) {
    const isBuildPhase = (phase && String(phase).toLowerCase() === 'build');

    if (isBuildPhase) {
      // Show Build Phase, hide Brainstorm
      if (phaseBrainstormContainer) phaseBrainstormContainer.classList.add('hidden');
      if (phaseBuildContainer) phaseBuildContainer.classList.remove('hidden');

      // Update Phase Badge in Header
      if (boardPhaseBadge) {
        boardPhaseBadge.className = 'badge-phase badge-phase-build';
      }
      if (phaseBadgeIcon) phaseBadgeIcon.textContent = '🔨';
      if (phaseBadgeText) phaseBadgeText.textContent = 'Build Phase';

      // Update Leader Phase Switch button
      if (phaseActionText) {
        phaseActionText.textContent = 'Switch to Brainstorm Phase ←';
      }

      // Populate Locked Idea Mission Banner if available
      const lockedIdeaBanner = document.getElementById('lockedIdeaBanner');
      const lockedIdeaTitle = document.getElementById('lockedIdeaTitle');
      const lockedIdeaSummary = document.getElementById('lockedIdeaSummary');
      if (lockedIdeaBanner && currentHackathon?.locked_idea_title) {
        lockedIdeaBanner.classList.remove('hidden');
        if (lockedIdeaTitle) lockedIdeaTitle.textContent = currentHackathon.locked_idea_title;
        if (lockedIdeaSummary) lockedIdeaSummary.textContent = currentHackathon.locked_idea_summary || '';
      }
    } else {
      // Show Brainstorm Phase, hide Build
      if (phaseBuildContainer) phaseBuildContainer.classList.add('hidden');
      if (phaseBrainstormContainer) phaseBrainstormContainer.classList.remove('hidden');

      // Update Phase Badge in Header
      if (boardPhaseBadge) {
        boardPhaseBadge.className = 'badge-phase badge-phase-brainstorm';
      }
      if (phaseBadgeIcon) phaseBadgeIcon.textContent = '💡';
      if (phaseBadgeText) phaseBadgeText.textContent = 'Brainstorm Phase';

      // Update Leader Phase Switch button
      if (phaseActionText) {
        phaseActionText.textContent = 'Switch to Build Phase →';
      }
    }
  }

  /**
   * Update Leader Privacy Switcher UI
   */
  function updatePrivacyUI(isPublic) {
    if (toggleIsPublic) {
      toggleIsPublic.checked = Boolean(isPublic);
    }
    if (privacyStatusLabel) {
      privacyStatusLabel.textContent = isPublic ? 'Public' : 'Private';
    }
  }

  /**
   * Toggle Leader Phase (Advance / Rollback)
   */
  async function toggleHackathonPhase() {
    if (!isLeader || !currentHackathon) return;

    const current = (currentHackathon.phase && String(currentHackathon.phase).toLowerCase() === 'build') 
      ? 'build' 
      : 'brainstorm';
    const nextPhase = (current === 'build') ? 'brainstorm' : 'build';

    if (btnTogglePhase) {
      btnTogglePhase.disabled = true;
    }

    try {
      const { error } = await window.supabaseClient
        .from('hackathons')
        .update({ phase: nextPhase })
        .eq('id', currentHackathon.id);

      if (error) throw error;

      currentHackathon.phase = nextPhase;
      applyPhaseUI(nextPhase);

      if (typeof window.showToast === 'function') {
        window.showToast(`Workspace transitioned to ${nextPhase.toUpperCase()} phase!`, 'success');
      }
    } catch (err) {
      console.error('Error switching phase:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to switch phase', 'error');
      }
    } finally {
      if (btnTogglePhase) {
        btnTogglePhase.disabled = false;
      }
    }
  }

  /**
   * Handle Leader Public / Private Toggle
   */
  async function handlePrivacyToggle(e) {
    if (!isLeader || !currentHackathon) return;

    const newIsPublic = Boolean(e.target.checked);

    try {
      const { error } = await window.supabaseClient
        .from('hackathons')
        .update({ is_public: newIsPublic })
        .eq('id', currentHackathon.id);

      if (error) throw error;

      currentHackathon.is_public = newIsPublic;
      updatePrivacyUI(newIsPublic);

      if (typeof window.showToast === 'function') {
        window.showToast(`Board is now ${newIsPublic ? 'Public' : 'Private'}`, 'success');
      }
    } catch (err) {
      console.error('Error updating board privacy:', err);
      // Revert checkbox state
      if (toggleIsPublic) toggleIsPublic.checked = !newIsPublic;
      updatePrivacyUI(!newIsPublic);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to update visibility', 'error');
      }
    }
  }

  /**
   * Copy Shareable Board Link
   */
  function copyShareLink() {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          if (typeof window.showToast === 'function') {
            window.showToast('Workspace share link copied to clipboard!', 'success');
          }
        })
        .catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    if (typeof window.showToast === 'function') {
      window.showToast('Workspace share link copied to clipboard!', 'success');
    }
  }

  /**
   * Subscribe to public.hackathons changes via Supabase Realtime
   * So when phase changes from 'brainstorm' to 'build', all teammates transition without reload
   */
  function setupRealtimeSubscription(hackathonId) {
    if (!window.supabaseClient) return;

    if (realtimeChannel) {
      window.supabaseClient.removeChannel(realtimeChannel);
    }

    realtimeChannel = window.supabaseClient
      .channel(`board-realtime-${hackathonId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'hackathons',
          filter: `id=eq.${hackathonId}`
        },
        (payload) => {
          const updated = payload.new;
          if (!updated) return;

          console.log('Realtime hackathon update received:', updated);
          Object.assign(currentHackathon, updated);

          // 1. Phase change transition
          if (updated.phase && updated.phase !== currentHackathon.phase) {
            currentHackathon.phase = updated.phase;
            applyPhaseUI(updated.phase);
            if (typeof window.showToast === 'function') {
              window.showToast(`🔔 Workspace transitioned to ${updated.phase.toUpperCase()} phase!`, 'info');
            }
          }

          // 2. Visibility change
          if (updated.is_public !== undefined && updated.is_public !== currentHackathon.is_public) {
            currentHackathon.is_public = updated.is_public;
            updatePrivacyUI(updated.is_public);

            // If private now and user is not a member, revoke access
            if (!updated.is_public && !isMember) {
              showNotFoundScreen();
            }
          }

          // 3. Deadline change
          if (updated.deadline_at && updated.deadline_at !== currentHackathon.deadline_at) {
            currentHackathon.deadline_at = updated.deadline_at;
            updateCountdownTimer();
          }

          // 4. Title change
          if (updated.title && updated.title !== currentHackathon.title) {
            currentHackathon.title = updated.title;
            if (boardTitle) boardTitle.textContent = updated.title;
            document.title = `${updated.title} — Hackdeck`;
          }

          // 5. Event URL change
          if (updated.event_url !== undefined) {
            currentHackathon.event_url = updated.event_url;
            updateEventUrlBadge(updated.event_url);
          }

          // 6. Locked idea updates
          if (updated.locked_idea_title !== undefined) {
            currentHackathon.locked_idea_title = updated.locked_idea_title;
            currentHackathon.locked_idea_summary = updated.locked_idea_summary;
          }

          // Broadcast update event
          window.dispatchEvent(new CustomEvent('hackdeck:board-updated', {
            detail: { hackathon: currentHackathon }
          }));
        }
      )
      .subscribe((status) => {
        console.log(`Supabase Realtime subscription status [${hackathonId}]:`, status);
      });
  }

  /**
   * Render Event URL badge in Header
   */
  function updateEventUrlBadge(url) {
    if (!boardEventUrl) return;
    if (url && typeof url === 'string' && url.trim().length > 0) {
      boardEventUrl.href = url.trim();
      boardEventUrl.classList.remove('hidden');
    } else {
      boardEventUrl.classList.add('hidden');
    }
  }

  /**
   * Render User Auth Profile Badge in Header
   */
  function renderUserNav(profile) {
    if (!boardAuthBadge) return;
    if (profile && profile.username) {
      boardAuthBadge.classList.remove('hidden');
      if (boardUserHandle) boardUserHandle.textContent = `@${profile.username}`;
      if (boardUserAvatar) {
        const initial = (profile.display_name || profile.username || 'H').charAt(0).toUpperCase();
        if (profile.avatar_url) {
          boardUserAvatar.innerHTML = `<img src="${profile.avatar_url}" alt="${profile.username}" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.onerror=null;this.parentElement.textContent='${initial}';">`;
        } else {
          boardUserAvatar.textContent = initial;
        }
      }
    } else {
      boardAuthBadge.classList.add('hidden');
    }
  }

  /**
   * Main Initialization & Access Verification
   */
  async function initializeBoard() {
    if (!window.supabaseClient) {
      console.error('Supabase client not initialized.');
      showNotFoundScreen();
      return;
    }

    // 1. Read hackathon ID from window.location.search
    const urlParams = new URLSearchParams(window.location.search);
    const hackathonId = urlParams.get('id');

    if (!hackathonId || !hackathonId.trim()) {
      showNotFoundScreen();
      return;
    }

    try {
      // 2. Fetch current logged-in user
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      currentUser = session?.user || null;

      if (currentUser) {
        // Fetch profile for header badge
        let { data: profile } = await window.supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (profile) {
          const meta = currentUser.user_metadata || {};
          const googleIdentity = currentUser.identities?.find(i => i.provider === 'google')?.identity_data || {};
          const googleAvatar = meta.avatar_url || meta.picture || googleIdentity.avatar_url || googleIdentity.picture || null;
          if (googleAvatar && (!profile.avatar_url || profile.avatar_url !== googleAvatar)) {
            profile.avatar_url = googleAvatar;
            window.supabaseClient
              .from('profiles')
              .update({ avatar_url: googleAvatar })
              .eq('id', currentUser.id)
              .then(() => {})
              .catch(err => console.warn('Avatar sync notice:', err));
          }
        }

        currentProfile = profile;
        renderUserNav(profile);
      }

      // 3. Query public.hackathons for board details
      const { data: hackathon, error: hackathonError } = await window.supabaseClient
        .from('hackathons')
        .select('*')
        .eq('id', hackathonId.trim())
        .maybeSingle();

      if (hackathonError) {
        console.error('Error fetching hackathon:', hackathonError);
        showNotFoundScreen();
        return;
      }

      // If query returns nothing (private board & user not member, or non-existent ID)
      if (!hackathon) {
        showNotFoundScreen();
        return;
      }

      currentHackathon = hackathon;

      // 4. Determine isLeader
      isLeader = Boolean(currentUser && hackathon.leader_id === currentUser.id);

      // 5. Determine isMember
      if (isLeader) {
        // Leader is automatically a member (via trigger or role)
        isMember = true;
      } else if (currentUser) {
        // Query public.hackathon_members
        const { data: membership, error: memberError } = await window.supabaseClient
          .from('hackathon_members')
          .select('id')
          .eq('hackathon_id', hackathon.id)
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (memberError) {
          console.warn('Membership query notice:', memberError);
        }
        isMember = Boolean(membership);
      } else {
        isMember = false;
      }

      // 6. Access Control Decisions:
      // If private board and user is not a member -> Not Found / Access Denied
      if (!hackathon.is_public && !isMember) {
        showNotFoundScreen();
        return;
      }

      // If public board and not a member -> Read-Only Public Spectator Mode
      isSpectator = Boolean(hackathon.is_public && !isMember);

      // Hide loading screen, reveal board workspace
      if (boardLoadingState) boardLoadingState.classList.add('hidden');
      if (accessDeniedScreen) accessDeniedScreen.classList.add('hidden');
      if (boardMainContent) boardMainContent.classList.remove('hidden');

      // 7. Render Header Info
      if (boardTitle) boardTitle.textContent = hackathon.title;
      document.title = `${hackathon.title} — Hackdeck`;

      // Event URL Badge
      updateEventUrlBadge(hackathon.event_url);

      // Countdown Timer
      startCountdownTicker();

      // Leader Controls
      if (isLeader) {
        if (leaderControlsContainer) leaderControlsContainer.classList.remove('hidden');
        updatePrivacyUI(hackathon.is_public);
      } else {
        if (leaderControlsContainer) leaderControlsContainer.classList.add('hidden');
      }

      // Spectator Mode UI Restrictions
      if (isSpectator) {
        document.body.classList.add('spectator-mode');
        if (boardMainContent) boardMainContent.classList.add('spectator-mode');
        if (spectatorBadge) spectatorBadge.classList.remove('hidden');
        if (spectatorBanner) spectatorBanner.classList.remove('hidden');
        if (teamChatPanel) teamChatPanel.classList.add('hidden');
      } else {
        document.body.classList.remove('spectator-mode');
        if (boardMainContent) boardMainContent.classList.remove('spectator-mode');
        if (spectatorBadge) spectatorBadge.classList.add('hidden');
        if (spectatorBanner) spectatorBanner.classList.add('hidden');
        if (teamChatPanel) teamChatPanel.classList.remove('hidden');
      }

      // 8. Phase Routing: Initial UI State (Brainstorm vs Build)
      applyPhaseUI(hackathon.phase || 'brainstorm');

      // 9. Subscribe to Supabase Realtime for instant Phase 2 transition
      setupRealtimeSubscription(hackathon.id);

      // 10. Expose global board context for brainstorm.js and other workspace modules
      window.HackdeckBoard = {
        getHackathon: () => currentHackathon,
        getUser: () => currentUser,
        getProfile: () => currentProfile,
        isLeader: () => isLeader,
        isMember: () => isMember,
        isSpectator: () => isSpectator
      };

      window.dispatchEvent(new CustomEvent('hackdeck:board-ready', {
        detail: {
          hackathon: currentHackathon,
          user: currentUser,
          profile: currentProfile,
          isLeader,
          isMember,
          isSpectator
        }
      }));

    } catch (err) {
      console.error('Unexpected error loading board:', err);
      showNotFoundScreen();
    }
  }

  /**
   * Bind Event Listeners
   */
  function bindEvents() {
    // Leader controls
    if (toggleIsPublic) {
      toggleIsPublic.addEventListener('change', handlePrivacyToggle);
    }
    if (btnCopyShareLink) {
      btnCopyShareLink.addEventListener('click', copyShareLink);
    }
    if (btnTogglePhase) {
      btnTogglePhase.addEventListener('click', toggleHackathonPhase);
    }

    // Team Chat Toggle
    if (btnToggleChat && teamChatPopup) {
      btnToggleChat.addEventListener('click', () => {
        teamChatPopup.classList.toggle('hidden');
      });
    }
    if (btnCloseChat && teamChatPopup) {
      btnCloseChat.addEventListener('click', () => {
        teamChatPopup.classList.add('hidden');
      });
    }

    // Close chat on click outside
    document.addEventListener('click', (e) => {
      if (teamChatPanel && teamChatPopup && !teamChatPopup.classList.contains('hidden')) {
        if (!teamChatPanel.contains(e.target)) {
          teamChatPopup.classList.add('hidden');
        }
      }
    });
  }

  // Initialize on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindEvents();
      initializeBoard();
    });
  } else {
    bindEvents();
    initializeBoard();
  }
})();
