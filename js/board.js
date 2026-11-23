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
  const btnMarkSubmitted = document.getElementById('btnMarkSubmitted');
  const btnReopenBuild = document.getElementById('btnReopenBuild');
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
  const btnDeleteBoard = document.getElementById('btnDeleteBoard');

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
    if (!currentHackathon) {
      if (countdownTimerText) countdownTimerText.textContent = '--d --h --m --s';
      return;
    }

    // Freeze timer into static status badge when project is submitted
    if (currentHackathon.phase === 'submitted') {
      const d = currentHackathon.submitted_at ? new Date(currentHackathon.submitted_at) : new Date();
      const formattedTime = !isNaN(d.getTime()) 
        ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Submitted';

      if (countdownTimerText) countdownTimerText.textContent = `Submitted • ${formattedTime}`;
      if (deadlineCountdown) {
        deadlineCountdown.className = 'countdown-badge countdown-submitted';
        deadlineCountdown.title = `Project was submitted for judging on ${formattedTime}`;
      }
      return;
    }

    if (!currentHackathon.deadline_at) {
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
    // Do not continuously tick if already submitted
    if (currentHackathon?.phase === 'submitted') return;
    countdownIntervalId = setInterval(updateCountdownTimer, 1000);
  }

  /**
   * Apply Phase UI (Brainstorm vs Build vs Submitted)
   */
  function applyPhaseUI(phase) {
    const p = (phase && String(phase).toLowerCase()) || 'brainstorm';
    const isSubmittedPhase = (p === 'submitted');
    const isBuildPhase = (p === 'build');

    if (isSubmittedPhase) {
      // 1. Submitted for Judging Phase UI
      if (phaseBrainstormContainer) phaseBrainstormContainer.classList.add('hidden');
      if (phaseBuildContainer) phaseBuildContainer.classList.remove('hidden');

      // Update Phase Badge in Header (Clean emerald badge)
      if (boardPhaseBadge) {
        boardPhaseBadge.className = 'badge-phase badge-phase-submitted';
      }
      if (phaseBadgeIcon) phaseBadgeIcon.textContent = '🏆';
      if (phaseBadgeText) phaseBadgeText.textContent = 'Submitted for Judging';

      // Freeze Countdown Timer into static "Submitted" status badge
      updateCountdownTimer();

      // Header Leader Buttons
      if (btnMarkSubmitted) btnMarkSubmitted.classList.add('hidden');
      if (btnTogglePhase) btnTogglePhase.classList.add('hidden');
      if (btnReopenBuild) {
        if (isLeader) {
          btnReopenBuild.classList.remove('hidden');
        } else {
          btnReopenBuild.classList.add('hidden');
        }
      }

      // Notify submodules (build.js, chat.js, etc.)
      window.dispatchEvent(new CustomEvent('hackdeck:phase-changed', {
        detail: { phase: 'submitted', hackathon: currentHackathon }
      }));

    } else if (isBuildPhase) {
      // 2. Build Sprint Phase UI
      if (phaseBrainstormContainer) phaseBrainstormContainer.classList.add('hidden');
      if (phaseBuildContainer) phaseBuildContainer.classList.remove('hidden');

      // Update Phase Badge in Header
      if (boardPhaseBadge) {
        boardPhaseBadge.className = 'badge-phase badge-phase-build';
      }
      if (phaseBadgeIcon) phaseBadgeIcon.textContent = '🔨';
      if (phaseBadgeText) phaseBadgeText.textContent = 'Build Phase';

      // Live Countdown Timer
      startCountdownTicker();

      // Header Leader Buttons
      if (btnReopenBuild) btnReopenBuild.classList.add('hidden');
      if (isLeader) {
        if (btnTogglePhase) {
          btnTogglePhase.classList.remove('hidden');
          if (phaseActionText) phaseActionText.textContent = 'Switch to Brainstorm Phase ←';
        }
        if (btnMarkSubmitted) btnMarkSubmitted.classList.remove('hidden');
      } else {
        if (btnTogglePhase) btnTogglePhase.classList.add('hidden');
        if (btnMarkSubmitted) btnMarkSubmitted.classList.add('hidden');
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

      // Notify submodules
      window.dispatchEvent(new CustomEvent('hackdeck:phase-changed', {
        detail: { phase: 'build', hackathon: currentHackathon }
      }));

    } else {
      // 3. Brainstorm Phase UI
      if (phaseBuildContainer) phaseBuildContainer.classList.add('hidden');
      if (phaseBrainstormContainer) phaseBrainstormContainer.classList.remove('hidden');

      // Update Phase Badge in Header
      if (boardPhaseBadge) {
        boardPhaseBadge.className = 'badge-phase badge-phase-brainstorm';
      }
      if (phaseBadgeIcon) phaseBadgeIcon.textContent = '💡';
      if (phaseBadgeText) phaseBadgeText.textContent = 'Brainstorm Phase';

      // Live Countdown Timer
      startCountdownTicker();

      // Header Leader Buttons
      if (btnMarkSubmitted) btnMarkSubmitted.classList.add('hidden');
      if (btnReopenBuild) btnReopenBuild.classList.add('hidden');
      if (isLeader) {
        if (btnTogglePhase) {
          btnTogglePhase.classList.remove('hidden');
          if (phaseActionText) phaseActionText.textContent = 'Switch to Build Phase →';
        }
      } else {
        if (btnTogglePhase) btnTogglePhase.classList.add('hidden');
      }

      // Notify submodules
      window.dispatchEvent(new CustomEvent('hackdeck:phase-changed', {
        detail: { phase: 'brainstorm', hackathon: currentHackathon }
      }));
    }
  }

  /**
   * Leader "Mark as Submitted" Action
   */
  async function markProjectAsSubmitted() {
    if (!isLeader || !currentHackathon) return;

    const confirmed = window.confirm(
      'Mark this project as finished and submit for judging?\n\n' +
      '• Your Project Showcase & Documentation will be displayed prominently at the top for judges and visitors.\n' +
      '• The Kanban Task Board will be locked in read-only archive mode.\n\n' +
      'You can reopen the build phase at any time if last-minute adjustments are needed before the deadline.'
    );

    if (!confirmed) return;

    if (btnMarkSubmitted) {
      btnMarkSubmitted.disabled = true;
      btnMarkSubmitted.innerHTML = '<span>Submitting...</span>';
    }

    const submittedAt = new Date().toISOString();

    try {
      const { error } = await window.supabaseClient
        .from('hackathons')
        .update({
          phase: 'submitted',
          submitted_at: submittedAt
        })
        .eq('id', currentHackathon.id);

      if (error) throw error;

      currentHackathon.phase = 'submitted';
      currentHackathon.submitted_at = submittedAt;

      applyPhaseUI('submitted');

      if (typeof window.showToast === 'function') {
        window.showToast('🏆 Project successfully marked as submitted for judging!', 'success');
      }
    } catch (err) {
      console.error('Error submitting project:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to submit project', 'error');
      }
    } finally {
      if (btnMarkSubmitted) {
        btnMarkSubmitted.disabled = false;
        btnMarkSubmitted.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Mark as Submitted</span>
        `;
      }
    }
  }

  /**
   * Leader "Reopen Build Phase" Action
   */
  async function reopenBuildPhase() {
    if (!isLeader || !currentHackathon) return;

    const confirmed = window.confirm(
      'Reopen the Build Phase?\n\n' +
      '• The Kanban sprint task board will be unlocked for teammates to make last-minute edits.\n' +
      '• You can mark as submitted again once deliverables are finalized.'
    );

    if (!confirmed) return;

    if (btnReopenBuild) {
      btnReopenBuild.disabled = true;
      btnReopenBuild.innerHTML = '<span>Reopening...</span>';
    }

    try {
      const { error } = await window.supabaseClient
        .from('hackathons')
        .update({ phase: 'build' })
        .eq('id', currentHackathon.id);

      if (error) throw error;

      currentHackathon.phase = 'build';
      applyPhaseUI('build');

      if (typeof window.showToast === 'function') {
        window.showToast('Workspace reopened to BUILD phase!', 'success');
      }
    } catch (err) {
      console.error('Error reopening build phase:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to reopen build phase', 'error');
      }
    } finally {
      if (btnReopenBuild) {
        btnReopenBuild.disabled = false;
        btnReopenBuild.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>
          <span>Reopen Build Phase</span>
        `;
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
   * Delete Hackathon (Leader Only)
   */
  async function deleteCurrentHackathon() {
    if (!isLeader || !currentHackathon) {
      if (typeof window.showToast === 'function') {
        window.showToast('Only team leaders can delete this hackathon workspace.', 'error');
      }
      return;
    }

    const title = currentHackathon.title || 'this hackathon';
    const confirmed = window.confirm(`Are you sure you want to delete "${title}"? This will permanently remove the entire hackathon workspace, tasks, brainstorm ideas, and team chat.`);
    if (!confirmed) return;

    if (btnDeleteBoard) {
      btnDeleteBoard.disabled = true;
      btnDeleteBoard.classList.add('is-deleting');
    }

    try {
      if (!window.supabaseClient) throw new Error('Supabase client not initialized');

      const { error } = await window.supabaseClient
        .from('hackathons')
        .delete()
        .eq('id', currentHackathon.id);

      if (error) throw error;

      if (typeof window.showToast === 'function') {
        window.showToast(`Hackathon "${title}" was successfully deleted.`, 'success');
      }

      // Redirect back to dashboard after deletion
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    } catch (err) {
      console.error('Error deleting hackathon:', err);
      if (btnDeleteBoard) {
        btnDeleteBoard.disabled = false;
        btnDeleteBoard.classList.remove('is-deleting');
      }
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to delete hackathon', 'error');
      }
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
          const previousPhase = currentHackathon.phase;
          Object.assign(currentHackathon, updated);

          // 1. Phase change transition
          if (updated.phase && updated.phase !== previousPhase) {
            applyPhaseUI(updated.phase);
            if (typeof window.showToast === 'function') {
              const label = updated.phase === 'submitted' ? 'SUBMITTED FOR JUDGING' : updated.phase.toUpperCase();
              window.showToast(`🔔 Workspace transitioned to ${label} phase!`, 'info');
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
   * Verify Membership Using user.id and Apply UI Permissions
   * Explicitly checks public.hackathon_members to set isMember and isLeader,
   * unlocks member UI, hides spectator banner, and broadcasts board readiness.
   */
  async function verifyMembershipAndApplyUI(user) {
    if (!currentHackathon || !window.supabaseClient) return;

    currentUser = user || null;

    if (currentUser) {
      // Fetch profile for header badge if not already fetched
      if (!currentProfile || currentProfile.id !== currentUser.id) {
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
      }
      renderUserNav(currentProfile);
    } else {
      currentProfile = null;
      renderUserNav(null);
    }

    // Direct Membership Query against public.hackathon_members using user.id
    let memberData = null;
    if (currentUser) {
      const { data, error: memberError } = await window.supabaseClient
        .from('hackathon_members')
        .select('*')
        .eq('hackathon_id', currentHackathon.id)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (memberError) {
        console.warn('Direct membership query notice:', memberError);
      }
      memberData = data;
    }

    // Set isMember and isLeader:
    // isMember = Boolean(memberData) (or leader), and isLeader = (hackathon.leader_id === user.id || memberData?.role === 'leader')
    isLeader = Boolean(currentUser && (currentHackathon.leader_id === currentUser.id || memberData?.role === 'leader'));
    isMember = Boolean(memberData) || isLeader;

    // Access Control Decisions:
    // If private board and user is not a member -> Not Found / Access Denied
    if (!currentHackathon.is_public && !isMember) {
      showNotFoundScreen();
      return;
    }

    // If public board and not a member -> Read-Only Public Spectator Mode
    isSpectator = Boolean(currentHackathon.is_public && !isMember);

    // Hide loading / access denied screens, reveal board workspace
    if (boardLoadingState) boardLoadingState.classList.add('hidden');
    if (accessDeniedScreen) accessDeniedScreen.classList.add('hidden');
    if (boardMainContent) boardMainContent.classList.remove('hidden');

    // Render Header Info
    if (boardTitle) boardTitle.textContent = currentHackathon.title;
    document.title = `${currentHackathon.title} — Hackdeck`;

    updateEventUrlBadge(currentHackathon.event_url);

    // Leader Controls
    if (isLeader) {
      if (leaderControlsContainer) leaderControlsContainer.classList.remove('hidden');
      updatePrivacyUI(currentHackathon.is_public);
    } else {
      if (leaderControlsContainer) leaderControlsContainer.classList.add('hidden');
    }

    // Spectator Mode UI Restrictions & Member Mode Unlocking
    if (isSpectator) {
      document.body.classList.add('spectator-mode');
      if (boardMainContent) boardMainContent.classList.add('spectator-mode');
      if (spectatorBadge) spectatorBadge.classList.remove('hidden');
      if (spectatorBanner) spectatorBanner.classList.remove('hidden');
      if (teamChatPanel) teamChatPanel.classList.add('hidden');
    } else {
      // isMember is true: hide spectator banner (and Join Hackdeck button), hide spectator badge, unlock UI, show private team chat
      document.body.classList.remove('spectator-mode');
      if (boardMainContent) boardMainContent.classList.remove('spectator-mode');
      if (spectatorBadge) spectatorBadge.classList.add('hidden');
      if (spectatorBanner) spectatorBanner.classList.add('hidden');
      if (teamChatPanel) teamChatPanel.classList.remove('hidden');
    }

    // Phase Routing: Initial UI State (Brainstorm vs Build)
    applyPhaseUI(currentHackathon.phase || 'brainstorm');

    // Expose global board context for brainstorm.js, build.js, chat.js
    window.HackdeckBoard = {
      getHackathon: () => currentHackathon,
      getUser: () => currentUser,
      getProfile: () => currentProfile,
      isLeader: () => isLeader,
      isMember: () => isMember,
      isSpectator: () => isSpectator,
      refreshMembership: () => verifyMembershipAndApplyUI(currentUser)
    };

    // Dispatch board-ready event so dependent modules (brainstorm, build, chat) update instantly
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

    // 1. Await Auth Session directly inside initializeBoard
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const user = session?.user || null;
    currentUser = user;

    // 2. Read hackathon ID from window.location.search
    const urlParams = new URLSearchParams(window.location.search);
    const hackathonId = urlParams.get('id');

    if (!hackathonId || !hackathonId.trim()) {
      showNotFoundScreen();
      return;
    }

    try {
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

      // 4. Verify membership using user.id and apply UI permissions
      await verifyMembershipAndApplyUI(user);

      // 5. Start Countdown Timer Ticker
      startCountdownTicker();

      // 6. Subscribe to Supabase Realtime for instant Phase 2 transition
      setupRealtimeSubscription(hackathon.id);

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
    if (btnMarkSubmitted) {
      btnMarkSubmitted.addEventListener('click', markProjectAsSubmitted);
    }
    if (btnReopenBuild) {
      btnReopenBuild.addEventListener('click', reopenBuildPhase);
    }
    if (btnDeleteBoard) {
      btnDeleteBoard.addEventListener('click', deleteCurrentHackathon);
    }

    // Team Chat Toggle
    if (btnToggleChat && teamChatPopup) {
      btnToggleChat.addEventListener('click', () => {
        teamChatPopup.classList.toggle('hidden');
        if (teamChatPanel) {
          if (teamChatPopup.classList.contains('hidden')) {
            teamChatPanel.classList.add('drawer-collapsed');
          } else {
            teamChatPanel.classList.remove('drawer-collapsed');
          }
        }
      });
    }
    if (btnCloseChat && teamChatPopup) {
      btnCloseChat.addEventListener('click', () => {
        teamChatPopup.classList.add('hidden');
        if (teamChatPanel) {
          teamChatPanel.classList.add('drawer-collapsed');
        }
      });
    }

    // Close chat on click outside (only in mobile / small-screen overlay mode)
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 1024) {
        if (teamChatPanel && teamChatPopup && !teamChatPopup.classList.contains('hidden')) {
          if (!teamChatPanel.contains(e.target) && (!btnToggleChat || !btnToggleChat.contains(e.target))) {
            teamChatPopup.classList.add('hidden');
            if (teamChatPanel) {
              teamChatPanel.classList.add('drawer-collapsed');
            }
          }
        }
      }
    });

    // Re-sync on Auth Changes: listen to supabaseClient.auth.onAuthStateChange
    if (window.supabaseClient) {
      window.supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        console.log('board.js auth.onAuthStateChange:', _event, session?.user?.id);
        const user = session?.user || null;
        if (currentHackathon) {
          await verifyMembershipAndApplyUI(user);
        }
      });
    }

    // Also listen for Hackdeck custom auth-change event
    window.addEventListener('hackdeck:auth-change', async (e) => {
      const user = e.detail?.user || null;
      if (currentHackathon) {
        await verifyMembershipAndApplyUI(user);
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
