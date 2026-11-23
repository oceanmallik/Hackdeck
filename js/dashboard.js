// js/dashboard.js - Hackathon Dashboard & Workspace Management for Hackdeck
(() => {
  // DOM Elements
  const myHackathonsGrid = document.getElementById('myHackathonsGrid');
  const statActiveBoards = document.getElementById('statActiveBoards');

  // Create Hackathon Modal Elements
  const createHackathonModal = document.getElementById('createHackathonModal');
  const createHackathonForm = document.getElementById('createHackathonForm');
  const btnCloseCreateModal = document.getElementById('btnCloseCreateModal');
  const btnCancelCreateModal = document.getElementById('btnCancelCreateModal');
  const btnSubmitCreateHackathon = document.getElementById('btnSubmitCreateHackathon');
  
  const hackathonTitle = document.getElementById('hackathonTitle');
  const hackathonEventUrl = document.getElementById('hackathonEventUrl');
  const hackathonDeadline = document.getElementById('hackathonDeadline');
  const hackathonIsPublic = document.getElementById('hackathonIsPublic');
  const visibilityStatusLabel = document.getElementById('visibilityStatusLabel');
  const visibilityStatusDesc = document.getElementById('visibilityStatusDesc');
  const createModalErrorBanner = document.getElementById('createModalErrorBanner');
  const createModalErrorMessage = document.getElementById('createModalErrorMessage');

  // Filter Buttons
  const filterChips = document.querySelectorAll('.filter-chip');
  let currentFilter = 'all';

  // Cached hackathons state
  let cachedHackathons = [];
  let countdownTimerId = null;

  /**
   * Helper: Escape HTML to avoid XSS injection
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
   * Helper: Set default deadline (7 days from now, rounded to next hour)
   */
  function setDefaultDeadline() {
    if (!hackathonDeadline) return;
    const now = new Date();
    // 7 days ahead
    const target = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    target.setMinutes(0, 0, 0);
    // Convert to local datetime string YYYY-MM-DDTHH:mm
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const hours = String(target.getHours()).padStart(2, '0');
    const minutes = String(target.getMinutes()).padStart(2, '0');
    hackathonDeadline.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    // Set min to current time
    const minMonth = String(now.getMonth() + 1).padStart(2, '0');
    const minDay = String(now.getDate()).padStart(2, '0');
    const minHours = String(now.getHours()).padStart(2, '0');
    const minMinutes = String(now.getMinutes()).padStart(2, '0');
    hackathonDeadline.min = `${now.getFullYear()}-${minMonth}-${minDay}T${minHours}:${minMinutes}`;
  }

  /**
   * Open Create Hackathon Modal
   */
  function openCreateModal() {
    if (!createHackathonModal) return;
    
    // Reset form
    if (createHackathonForm) createHackathonForm.reset();
    if (createModalErrorBanner) createModalErrorBanner.classList.add('hidden');
    
    // Default deadline & visibility
    setDefaultDeadline();
    if (hackathonIsPublic) {
      hackathonIsPublic.checked = true;
      updateVisibilityLabel(true);
    }

    createHackathonModal.classList.remove('hidden');
    if (hackathonTitle) hackathonTitle.focus();
  }

  /**
   * Close Create Hackathon Modal
   */
  function closeCreateModal() {
    if (!createHackathonModal) return;
    createHackathonModal.classList.add('hidden');
    if (createModalErrorBanner) createModalErrorBanner.classList.add('hidden');
    if (btnSubmitCreateHackathon) {
      btnSubmitCreateHackathon.disabled = false;
      btnSubmitCreateHackathon.innerHTML = '<span>+ Create Hackathon</span>';
    }
  }

  /**
   * Update visibility toggle UI description
   */
  function updateVisibilityLabel(isPublic) {
    if (visibilityStatusLabel) {
      visibilityStatusLabel.textContent = isPublic ? 'Public Board' : 'Private Board';
    }
    if (visibilityStatusDesc) {
      visibilityStatusDesc.textContent = isPublic 
        ? 'Anyone with the workspace link can discover and join.' 
        : 'Only team members and invited collaborators can access.';
    }
  }

  /**
   * Show error inside modal banner
   */
  function showModalError(msg) {
    if (createModalErrorMessage) createModalErrorMessage.textContent = msg;
    if (createModalErrorBanner) createModalErrorBanner.classList.remove('hidden');
  }

  /**
   * Handle Create Hackathon Form Submission
   */
  async function handleCreateHackathon(e) {
    e.preventDefault();
    if (!window.supabaseClient) return;

    // Get current user from window or supabase session
    let user = window.currentUser;
    if (!user) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      user = session?.user;
    }

    if (!user) {
      showModalError('You must be signed in to create a hackathon board.');
      return;
    }

    const titleVal = (hackathonTitle?.value || '').trim();
    const eventUrlVal = (hackathonEventUrl?.value || '').trim();
    const deadlineVal = hackathonDeadline?.value;
    const isPublicVal = Boolean(hackathonIsPublic?.checked);

    // Validation
    if (!titleVal) {
      showModalError('Please enter a hackathon title.');
      hackathonTitle?.focus();
      return;
    }

    if (!deadlineVal) {
      showModalError('Please select a valid deadline date and time.');
      hackathonDeadline?.focus();
      return;
    }

    const deadlineDate = new Date(deadlineVal);
    if (isNaN(deadlineDate.getTime())) {
      showModalError('Invalid deadline date format.');
      hackathonDeadline?.focus();
      return;
    }

    const deadlineIso = deadlineDate.toISOString();

    // Prepare insert payload
    const newHackathon = {
      title: titleVal,
      event_url: eventUrlVal || null,
      deadline_at: deadlineIso,
      is_public: isPublicVal,
      leader_id: user.id
    };

    if (btnSubmitCreateHackathon) {
      btnSubmitCreateHackathon.disabled = true;
      btnSubmitCreateHackathon.innerHTML = '<span>Creating workspace...</span>';
    }
    if (createModalErrorBanner) createModalErrorBanner.classList.add('hidden');

    try {
      const { data, error } = await window.supabaseClient
        .from('hackathons')
        .insert([newHackathon])
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Also ensure leader is recorded in hackathon_members if not automatically done by DB trigger
      try {
        await window.supabaseClient
          .from('hackathon_members')
          .insert([{
            hackathon_id: data.id,
            user_id: user.id,
            role: 'leader'
          }]);
      } catch (memberInsertErr) {
        // Trigger or duplicate primary key may safely ignore
        console.log('Leader membership auto-link info:', memberInsertErr);
      }

      // Success
      closeCreateModal();
      if (typeof window.showToast === 'function') {
        window.showToast(`Hackathon "${titleVal}" created successfully!`, 'success');
      }

      // Refresh My Hackathons Grid
      await loadMyHackathons();

    } catch (err) {
      console.error('Error creating hackathon:', err);
      showModalError(err.message || 'Failed to create hackathon. Please check database permissions.');
    } finally {
      if (btnSubmitCreateHackathon) {
        btnSubmitCreateHackathon.disabled = false;
        btnSubmitCreateHackathon.innerHTML = '<span>+ Create Hackathon</span>';
      }
    }
  }

  // Ordered phases and display configurations
  const ORDERED_PHASES = ['register', 'ideate', 'build', 'judge'];
  const PHASE_LABELS = {
    register: 'Register',
    ideate: 'Ideate',
    build: 'Build',
    judge: 'Judge'
  };

  const PHASE_ICONS = {
    register: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`,
    ideate: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"></path></svg>`,
    build: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`,
    judge: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path></svg>`,
    ended: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`
  };

  /**
   * Map database phase or status to allowed values: register, ideate, build, judge
   */
  function normalizePhase(phase) {
    if (!phase) return null;
    const p = String(phase).trim().toLowerCase();
    if (p === 'register' || p === 'registration' || p === 'reg') return 'register';
    if (p === 'ideate' || p === 'brainstorm' || p === 'idea' || p === 'ideation') return 'ideate';
    if (p === 'build' || p === 'building' || p === 'dev' || p === 'development') return 'build';
    if (p === 'judge' || p === 'judging' || p === 'review' || p === 'eval' || p === 'submitted') return 'judge';
    return null;
  }

  /**
   * Calculate elapsed percentage for current phase if timestamps exist (min 4%, max 100%)
   */
  function getPhaseProgress(h, phase) {
    const startVal = h.phase_start_at || h[`${phase}_start_at`] || h[`${phase}_start`] || h.phase_started_at;
    const endVal = h.phase_end_at || h[`${phase}_end_at`] || h[`${phase}_end`] || h.phase_ends_at;

    if (startVal && endVal) {
      const start = new Date(startVal).getTime();
      const end = new Date(endVal).getTime();
      const now = Date.now();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        const pct = ((now - start) / (end - start)) * 100;
        return Math.min(100, Math.max(4, Math.round(pct)));
      }
    }
    return 100;
  }

  /**
   * Format countdown string
   * Large mono font: "53d 16h". Under 1 day: "5h 20m".
   */
  function formatCountdown(deadlineStr) {
    if (!deadlineStr) return { text: 'No deadline', isEnded: false };
    const deadlineTime = new Date(deadlineStr).getTime();
    if (isNaN(deadlineTime)) return { text: 'No deadline', isEnded: false };

    const now = Date.now();
    const diff = deadlineTime - now;

    if (diff <= 0) {
      return { text: 'Ended', isEnded: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days >= 1) {
      return { text: `${days}d ${hours}h`, isEnded: false };
    }
    return { text: `${hours}h ${minutes}m`, isEnded: false };
  }

  /**
   * Apply Ended UI modifications directly if countdown expires live
   */
  function applyEndedVisualsToCard(card) {
    if (!card) return;
    const topRow = card.querySelector('.hk-card-top-row');
    if (topRow && !topRow.querySelector('.hk-pill-phase.is-ended')) {
      const existingPhasePill = topRow.querySelector('.hk-pill-phase');
      if (existingPhasePill) existingPhasePill.remove();
      const endedPill = document.createElement('span');
      endedPill.className = 'hk-pill hk-pill-phase is-ended';
      endedPill.innerHTML = `${PHASE_ICONS.ended}<span>Ended</span>`;
      topRow.prepend(endedPill);
    }

    const track = card.querySelector('.hk-phase-track');
    if (track) {
      track.setAttribute('aria-label', 'Phase progress: Hackathon ended');
      const fills = track.querySelectorAll('.hk-phase-bar-fill');
      fills.forEach(fill => {
        fill.style.setProperty('--hk-target-width', '100%');
        fill.style.setProperty('--hk-fill-color', '#e6e6e6');
        fill.style.width = '100%';
        fill.style.backgroundColor = '#e6e6e6';
      });
      const labels = track.querySelectorAll('.hk-phase-label');
      labels.forEach(l => l.classList.remove('is-current'));
    }

    const sub = card.querySelector('.hk-countdown-sub');
    if (sub) sub.textContent = 'deadline passed';
  }

  /**
   * Ticker to update countdown previews every minute
   * Cleans up cleanly on unmount / window unload.
   */
  function startCountdownTicker() {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }

    const updateAll = () => {
      const countdownElements = document.querySelectorAll('.hk-countdown-value[data-deadline]');
      countdownElements.forEach(el => {
        const deadline = el.getAttribute('data-deadline');
        const { text, isEnded } = formatCountdown(deadline);
        el.textContent = text;
        
        if (isEnded) {
          const card = el.closest('.hk-card-component');
          if (card) applyEndedVisualsToCard(card);
        }
      });
    };

    updateAll();
    // Update on an interval (every minute)
    countdownTimerId = setInterval(updateAll, 60000);
  }

  // Cleanup interval on page unload / unmount
  window.addEventListener('beforeunload', () => {
    if (countdownTimerId) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }
  });

  /**
   * Render loading skeleton blocks with identical layout (no layout shift)
   */
  function renderLoadingSkeletons() {
    if (!myHackathonsGrid) return;
    const skeletonCard = `
      <div class="hk-card-component hk-card-skeleton" aria-hidden="true">
        <div class="hk-card-top-row">
          <div class="hk-skeleton-block" style="width: 90px; height: 24px; border-radius: 9999px;"></div>
          <div class="hk-skeleton-block" style="width: 65px; height: 24px; border-radius: 9999px;"></div>
        </div>
        <div class="hk-skeleton-block" style="width: 72%; height: 26px; border-radius: 6px;"></div>
        <div class="hk-phase-track">
          <div class="hk-phase-segment">
            <div class="hk-skeleton-block" style="height: 5px; border-radius: 9999px;"></div>
            <div class="hk-skeleton-block" style="height: 11px; width: 42px; margin: 4px auto 0; border-radius: 4px;"></div>
          </div>
          <div class="hk-phase-segment">
            <div class="hk-skeleton-block" style="height: 5px; border-radius: 9999px;"></div>
            <div class="hk-skeleton-block" style="height: 11px; width: 42px; margin: 4px auto 0; border-radius: 4px;"></div>
          </div>
          <div class="hk-phase-segment">
            <div class="hk-skeleton-block" style="height: 5px; border-radius: 9999px;"></div>
            <div class="hk-skeleton-block" style="height: 11px; width: 42px; margin: 4px auto 0; border-radius: 4px;"></div>
          </div>
          <div class="hk-phase-segment">
            <div class="hk-skeleton-block" style="height: 5px; border-radius: 9999px;"></div>
            <div class="hk-skeleton-block" style="height: 11px; width: 42px; margin: 4px auto 0; border-radius: 4px;"></div>
          </div>
        </div>
        <div class="hk-time-row">
          <div>
            <div class="hk-skeleton-block" style="width: 130px; height: 34px; border-radius: 6px;"></div>
            <div class="hk-skeleton-block" style="width: 78px; height: 12px; margin-top: 6px; border-radius: 4px;"></div>
          </div>
          <div style="display: flex; align-items: center;">
            <div class="hk-skeleton-block" style="width: 28px; height: 28px; border-radius: 50%;"></div>
            <div class="hk-skeleton-block" style="width: 28px; height: 28px; border-radius: 50%; margin-left: -8px;"></div>
            <div class="hk-skeleton-block" style="width: 28px; height: 28px; border-radius: 50%; margin-left: -8px;"></div>
          </div>
        </div>
        <div class="hk-info-block">
          <div class="hk-skeleton-block" style="width: 100px; height: 14px; border-radius: 4px;"></div>
          <div class="hk-skeleton-block" style="width: 130px; height: 14px; border-radius: 4px;"></div>
        </div>
        <div class="hk-skeleton-block" style="width: 100%; height: 40px; border-radius: 10px;"></div>
      </div>
    `;

    myHackathonsGrid.innerHTML = skeletonCard.repeat(3);
  }

  /**
   * Render Individual Redesigned Hackathon Card
   */
  function renderHackathonCardHtml(h) {
    const user = window.currentUser || (window.HackdeckAuth && window.HackdeckAuth.getUser && window.HackdeckAuth.getUser());
    const isLeader = Boolean(user && h.leader_id === user.id);
    const isSubmitted = (h.phase && String(h.phase).toLowerCase() === 'submitted');
    const isPublic = Boolean(h.is_public);
    const { text: countdownText, isEnded } = formatCountdown(h.deadline_at);
    const normalizedPhase = normalizePhase(h.phase || h.status);
    const currentPhaseIndex = normalizedPhase ? ORDERED_PHASES.indexOf(normalizedPhase) : -1;

    // 1. Top row pills
    let phasePillHtml = '';
    let trackAriaLabel = 'Phase progress';

    if (isSubmitted) {
      phasePillHtml = `
        <span class="hk-pill hk-pill-phase is-submitted">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Submitted</span>
        </span>
      `;
      trackAriaLabel = 'Phase progress: Project submitted for judging';
    } else if (isEnded) {
      phasePillHtml = `
        <span class="hk-pill hk-pill-phase is-ended">
          ${PHASE_ICONS.ended}
          <span>Ended</span>
        </span>
      `;
      trackAriaLabel = 'Phase progress: Hackathon ended';
    } else if (normalizedPhase && currentPhaseIndex !== -1) {
      const displayName = PHASE_LABELS[normalizedPhase];
      phasePillHtml = `
        <span class="hk-pill hk-pill-phase">
          ${PHASE_ICONS[normalizedPhase]}
          <span>${displayName} phase</span>
        </span>
      `;
      trackAriaLabel = `Phase progress: ${displayName} phase in progress`;
    } else {
      // Phase missing or unknown: phase pill is hidden
      phasePillHtml = '';
      trackAriaLabel = 'Phase progress: Phase not set';
    }

    const visibilityPillHtml = `
      <span class="hk-pill hk-pill-visibility">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span>${isPublic ? 'Public' : 'Private'}</span>
      </span>
    `;

    // 2. Title
    const titleHtml = `<h3 class="hk-card-title" title="${escapeHtml(h.title)}">${escapeHtml(h.title)}</h3>`;

    // 3. Phase track: 4 equal segments in a grid
    const segmentsHtml = ORDERED_PHASES.map((phaseKey, index) => {
      const label = PHASE_LABELS[phaseKey];
      let fillWidth = 0;
      let fillColor = '#363636';
      let isCurrent = false;

      if (isSubmitted) {
        // Submitted: all four segments completed in emerald green
        fillWidth = 100;
        fillColor = '#10b981';
      } else if (isEnded) {
        // All four segments filled in #e6e6e6 with no amber
        fillWidth = 100;
        fillColor = '#e6e6e6';
      } else if (currentPhaseIndex !== -1) {
        if (index < currentPhaseIndex) {
          // Phases before the current one: fully filled, color #e6e6e6
          fillWidth = 100;
          fillColor = '#e6e6e6';
        } else if (index === currentPhaseIndex) {
          // Current phase: amber #f5a524 and label in primary text color, weight 500
          fillWidth = getPhaseProgress(h, phaseKey);
          fillColor = '#f5a524';
          isCurrent = true;
        } else {
          // Phases after the current one: empty bar (#363636), muted label
          fillWidth = 0;
          fillColor = '#363636';
        }
      } else {
        // Phase missing or unknown: no segment is highlighted
        fillWidth = 0;
        fillColor = '#363636';
      }

      return `
        <div class="hk-phase-segment">
          <div class="hk-phase-bar">
            <div class="hk-phase-bar-fill" style="--hk-target-width: ${fillWidth}%; --hk-fill-color: ${fillColor};"></div>
          </div>
          <div class="hk-phase-label ${isCurrent ? 'is-current' : ''}">${label}</div>
        </div>
      `;
    }).join('');

    const trackHtml = `
      <div class="hk-phase-track" role="img" aria-label="${escapeHtml(trackAriaLabel)}">
        ${segmentsHtml}
      </div>
    `;

    // 4. Time row: left = mono countdown (or green Submitted badge if phase === 'submitted'), right = overlapping avatar stack (max 3, then +N)
    const members = Array.isArray(h.team_members) ? h.team_members : [];
    const maxShown = 3;
    const shownMembers = members.slice(0, maxShown);
    const remainingCount = members.length - maxShown;

    let avatarStackHtml = '';
    if (members.length > 0) {
      const circles = shownMembers.map(m => {
        const name = m.display_name || m.username || 'Member';
        const initial = (name[0] || 'U').toUpperCase();
        if (m.avatar_url) {
          return `
            <div class="hk-avatar-circle" title="${escapeHtml(name)}">
              <img src="${escapeHtml(m.avatar_url)}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.parentElement.textContent='${initial}';" />
            </div>
          `;
        }
        return `<div class="hk-avatar-circle" title="${escapeHtml(name)}">${initial}</div>`;
      }).join('');

      const more = remainingCount > 0 ? `
        <div class="hk-avatar-circle hk-avatar-more" title="${remainingCount} more team member${remainingCount > 1 ? 's' : ''}">+${remainingCount}</div>
      ` : '';

      avatarStackHtml = `<div class="hk-team-avatars" aria-label="Team members">${circles}${more}</div>`;
    }

    const timeRowHtml = `
      <div class="hk-time-row">
        <div class="hk-time-left">
          ${isSubmitted
            ? `<div class="hk-submitted-badge">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                 <span>Submitted</span>
               </div>
               <div class="hk-countdown-sub">ready for judging</div>`
            : `<div class="hk-countdown-value" data-deadline="${escapeHtml(h.deadline_at || '')}">${countdownText}</div>
               <div class="hk-countdown-sub">${isEnded ? 'deadline passed' : 'left to submit'}</div>`
          }
        </div>
        ${avatarStackHtml}
      </div>
    `;

    // 5. Info block: Devpost link (truncated) + formatted deadline in user locale
    const rawUrl = h.event_url || h.devpost_url || '';
    let devpostLinkHtml = '';
    if (rawUrl) {
      const cleanUrl = escapeHtml(rawUrl);
      let displayLink = 'Devpost';
      try {
        const parsed = new URL(rawUrl);
        displayLink = parsed.hostname.replace(/^www\./, '');
        if (parsed.pathname && parsed.pathname !== '/') {
          displayLink += parsed.pathname;
        }
      } catch (_) {
        displayLink = rawUrl;
      }

      devpostLinkHtml = `
        <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="hk-devpost-link" title="${cleanUrl}">
          <span>${escapeHtml(displayLink)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      `;
    }

    let deadlineFormattedHtml = '';
    if (h.deadline_at) {
      const deadlineDate = new Date(h.deadline_at);
      if (!isNaN(deadlineDate.getTime())) {
        const datePart = deadlineDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        });
        const timePart = deadlineDate.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit'
        });
        deadlineFormattedHtml = `<div class="hk-deadline-label">Deadline <b>${datePart}, ${timePart}</b></div>`;
      }
    }

    const infoBlockHtml = `
      <div class="hk-info-block">
        ${devpostLinkHtml}
        ${deadlineFormattedHtml}
      </div>
    `;

    // 6. Action button & Leader Delete button
    const deleteButtonHtml = isLeader ? `
      <button type="button" class="hk-delete-btn btn-delete-hackathon" data-hackathon-id="${escapeHtml(h.id)}" data-hackathon-title="${escapeHtml(h.title)}" title="Delete hackathon board">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    ` : '';

    const buttonHtml = `
      <div class="hk-card-actions-row">
        <a href="board.html?id=${encodeURIComponent(h.id)}" class="hk-open-btn">
          <span>Open workspace</span>
          <svg class="hk-btn-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </a>
        ${deleteButtonHtml}
      </div>
    `;

    return `
      <div class="hk-card-component white-hackathon-card" data-hackathon-id="${escapeHtml(h.id)}">
        <div class="hk-card-top-row">
          ${phasePillHtml}
          ${visibilityPillHtml}
        </div>
        ${titleHtml}
        ${trackHtml}
        ${timeRowHtml}
        ${infoBlockHtml}
        ${buttonHtml}
      </div>
    `;
  }

  /**
   * Render Hackathon Cards into the Grid
   */
  function renderHackathons(hackathons) {
    if (!myHackathonsGrid) return;

    if (!hackathons || hackathons.length === 0) {
      myHackathonsGrid.innerHTML = `
        <div class="empty-hackathons-state">
          <div class="empty-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </div>
          <h4 class="empty-title">No hackathon boards yet</h4>
          <p class="empty-desc">Create your first collaborative hackathon workspace to pitch ideas, recruit teammates, and track milestones.</p>
          <button class="btn btn-primary btn-sm btn-open-create-hackathon" style="margin-top: 14px;">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>+ New Hackathon</span>
          </button>
        </div>
      `;
      bindCreateModalTriggers();
      return;
    }

    const cardsHtml = hackathons.map(renderHackathonCardHtml).join('');

    // Append the "+ New Hackathon" shortcut card at the end
    const createShortcutHtml = `
      <div class="create-hackathon-shortcut-card btn-open-create-hackathon" role="button" tabindex="0">
        <div class="create-shortcut-icon">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <div class="create-shortcut-title">+ New Hackathon</div>
        <div class="create-shortcut-sub">Set up a new workspace board</div>
      </div>
    `;

    myHackathonsGrid.innerHTML = cardsHtml + createShortcutHtml;

    // Start live countdown ticker
    startCountdownTicker();

    // Re-bind triggers on dynamically created shortcut cards
    bindCreateModalTriggers();

    // Bind delete hackathon triggers (leader only)
    bindDeleteHackathonTriggers();
  }

  /**
   * Bind Delete Hackathon buttons
   */
  function bindDeleteHackathonTriggers() {
    const deleteBtns = document.querySelectorAll('.btn-delete-hackathon');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        const hackathonId = btn.getAttribute('data-hackathon-id');
        const hackathonTitle = btn.getAttribute('data-hackathon-title') || 'this hackathon';
        if (!hackathonId) return;

        const confirmed = window.confirm(`Are you sure you want to delete "${hackathonTitle}"? This will permanently remove the hackathon workspace, tasks, brainstorm ideas, and chat.`);
        if (!confirmed) return;

        btn.disabled = true;
        btn.classList.add('is-deleting');

        try {
          if (!window.supabaseClient) throw new Error('Supabase client not initialized');

          // Delete from public.hackathons (leader only enforced by RLS)
          const { error } = await window.supabaseClient
            .from('hackathons')
            .delete()
            .eq('id', hackathonId);

          if (error) throw error;

          if (typeof window.showToast === 'function') {
            window.showToast(`Hackathon "${hackathonTitle}" was deleted.`, 'success');
          }

          // Reload hackathons
          await loadMyHackathons();
        } catch (err) {
          console.error('Error deleting hackathon:', err);
          btn.disabled = false;
          btn.classList.remove('is-deleting');
          if (typeof window.showToast === 'function') {
            window.showToast(err.message || 'Failed to delete hackathon', 'error');
          }
        }
      });
    });
  }

  /**
   * Filter hackathons based on selected tab
   */
  function applyFilter(filter) {
    currentFilter = filter;
    
    // Update active tab UI
    filterChips.forEach(chip => {
      const isMatch = (chip.getAttribute('data-filter') || chip.textContent.trim().toLowerCase()) === filter.toLowerCase();
      chip.classList.toggle('active', isMatch);
    });

    if (!cachedHackathons) return;

    const now = Date.now();
    let filtered = [...cachedHackathons];

    if (filter === 'ongoing') {
      filtered = filtered.filter(h => {
        if (!h.deadline_at) return true;
        return new Date(h.deadline_at).getTime() > now;
      });
    } else if (filter === 'ended' || filter === 'past') {
      filtered = filtered.filter(h => {
        if (!h.deadline_at) return false;
        return new Date(h.deadline_at).getTime() <= now;
      });
    } else if (filter === 'public') {
      filtered = filtered.filter(h => Boolean(h.is_public));
    }

    renderHackathons(filtered);
  }

  /**
   * Query user's hackathons:
   * Only returns hackathons where current user is the leader OR a team member in hackathon_members.
   */
  async function loadMyHackathons() {
    if (!window.supabaseClient) return;

    // Render loading skeleton blocks with identical layout (no layout shift)
    renderLoadingSkeletons();

    try {
      // 1. Resolve current user identity
      let user = window.currentUser || (window.HackdeckAuth && window.HackdeckAuth.getUser && window.HackdeckAuth.getUser());
      if (!user && window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        user = session?.user;
      }

      if (!user) {
        cachedHackathons = [];
        if (statActiveBoards) statActiveBoards.textContent = '0';
        if (myHackathonsGrid) {
          myHackathonsGrid.innerHTML = `
            <div class="empty-hackathons-state">
              <div class="empty-icon-wrap">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </div>
              <h4 class="empty-title">Sign in to view your hackathons</h4>
              <p class="empty-desc">Your active hackathon boards and team projects will appear here once signed in.</p>
            </div>
          `;
        }
        return;
      }

      // 2. Fetch hackathons where the user is a team member
      const { data: memberRows, error: memberErr } = await window.supabaseClient
        .from('hackathon_members')
        .select('hackathon_id')
        .eq('user_id', user.id);

      if (memberErr) {
        console.warn('Membership query notice:', memberErr);
      }

      const memberHackathonIds = (memberRows || [])
        .map(r => r.hackathon_id)
        .filter(Boolean);

      // 3. Fetch hackathons led by the user
      let leaderHackathons = [];
      try {
        const { data: leaderData, error: leaderErr } = await window.supabaseClient
          .from('hackathons')
          .select('*')
          .eq('leader_id', user.id)
          .order('created_at', { ascending: false });

        if (leaderErr) {
          console.warn('Leader query with order notice, trying fallback:', leaderErr);
          const fallback = await window.supabaseClient
            .from('hackathons')
            .select('*')
            .eq('leader_id', user.id);
          if (fallback.error) throw fallback.error;
          leaderHackathons = fallback.data || [];
        } else {
          leaderHackathons = leaderData || [];
        }
      } catch (leaderCatchErr) {
        console.warn('Could not fetch led hackathons:', leaderCatchErr);
      }

      // 4. Fetch hackathons where user is a team member
      let memberHackathons = [];
      if (memberHackathonIds.length > 0) {
        try {
          const { data: memberData, error: memberQueryErr } = await window.supabaseClient
            .from('hackathons')
            .select('*')
            .in('id', memberHackathonIds)
            .order('created_at', { ascending: false });

          if (memberQueryErr) {
            console.warn('Member query with order notice, trying fallback:', memberQueryErr);
            const fallback = await window.supabaseClient
              .from('hackathons')
              .select('*')
              .in('id', memberHackathonIds);
            if (fallback.error) throw fallback.error;
            memberHackathons = fallback.data || [];
          } else {
            memberHackathons = memberData || [];
          }
        } catch (memberCatchErr) {
          console.warn('Could not fetch member hackathons:', memberCatchErr);
        }
      }

      // 5. Merge and deduplicate by hackathon ID
      const hackathonMap = new Map();
      leaderHackathons.forEach(h => {
        if (h && h.id) hackathonMap.set(h.id, h);
      });
      memberHackathons.forEach(h => {
        if (h && h.id) hackathonMap.set(h.id, h);
      });

      cachedHackathons = Array.from(hackathonMap.values());
      // Sort by created_at (descending) or deadline
      cachedHackathons.sort((a, b) => {
        const timeA = new Date(a.created_at || a.deadline_at || 0).getTime();
        const timeB = new Date(b.created_at || b.deadline_at || 0).getTime();
        return timeB - timeA;
      });

      // 6. Enrich hackathons with team members
      const hackathonIds = cachedHackathons.map(h => h.id).filter(Boolean);
      if (hackathonIds.length > 0) {
        try {
          const { data: memberRows, error: mErr } = await window.supabaseClient
            .from('hackathon_members')
            .select(`
              hackathon_id,
              user_id,
              role,
              profiles (
                id,
                username,
                display_name,
                avatar_url
              )
            `)
            .in('hackathon_id', hackathonIds);

          if (!mErr && memberRows) {
            const memberMap = {};
            memberRows.forEach(m => {
              if (!memberMap[m.hackathon_id]) memberMap[m.hackathon_id] = [];
              const profile = m.profiles || {
                id: m.user_id,
                username: 'member',
                display_name: 'Member',
                avatar_url: null
              };
              memberMap[m.hackathon_id].push(profile);
            });
            cachedHackathons.forEach(h => {
              h.team_members = memberMap[h.id] || [];
            });
          } else {
            // Fallback 2-step lookup if relation name differs
            const { data: rawMembers } = await window.supabaseClient
              .from('hackathon_members')
              .select('*')
              .in('hackathon_id', hackathonIds);

            if (rawMembers && rawMembers.length > 0) {
              const uids = [...new Set(rawMembers.map(m => m.user_id).filter(Boolean))];
              const { data: profiles } = await window.supabaseClient
                .from('profiles')
                .select('id, username, display_name, avatar_url')
                .in('id', uids);
              const pMap = new Map((profiles || []).map(p => [p.id, p]));
              const memberMap = {};
              rawMembers.forEach(m => {
                if (!memberMap[m.hackathon_id]) memberMap[m.hackathon_id] = [];
                memberMap[m.hackathon_id].push(pMap.get(m.user_id) || {
                  id: m.user_id,
                  username: 'member',
                  display_name: 'Member',
                  avatar_url: null
                });
              });
              cachedHackathons.forEach(h => {
                h.team_members = memberMap[h.id] || [];
              });
            }
          }
        } catch (memErr) {
          console.warn('Could not load team members for cards:', memErr);
        }
      }

      // Update Active Boards stat
      if (statActiveBoards) {
        statActiveBoards.textContent = cachedHackathons.length;
      }

      applyFilter(currentFilter);

    } catch (err) {
      console.error('Error fetching hackathons:', err);
      if (myHackathonsGrid) {
        myHackathonsGrid.innerHTML = `
          <div class="empty-hackathons-state" style="border-color: var(--danger-border); background-color: var(--danger-bg);">
            <h4 class="empty-title" style="color: #b91c1c;">Could not load hackathons</h4>
            <p class="empty-desc" style="color: #991b1b;">${escapeHtml(err.message || 'Database error occurred')}</p>
            <button id="btnRetryLoad" class="btn btn-outline btn-sm" style="margin-top: 12px;">Retry</button>
          </div>
        `;
        const retryBtn = document.getElementById('btnRetryLoad');
        if (retryBtn) retryBtn.addEventListener('click', loadMyHackathons);
      }
    }
  }

  /**
   * Bind all "+ New Hackathon" trigger buttons across DOM
   */
  function bindCreateModalTriggers() {
    const triggers = document.querySelectorAll('.btn-open-create-hackathon');
    triggers.forEach(btn => {
      // Remove prior listener to prevent duplicate binds
      btn.removeEventListener('click', openCreateModal);
      btn.addEventListener('click', openCreateModal);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCreateModal();
        }
      });
    });
  }

  let heroTimerInterval = null;

  /**
   * Initialize live countdown ticker for hero board showcase
   */
  function initHeroTimer() {
    const el = document.getElementById('heroCountdownTimer');
    if (!el) return;
    if (heroTimerInterval) clearInterval(heroTimerInterval);
    let secondsLeft = 18 * 3600 + 42 * 60 + 15;
    heroTimerInterval = setInterval(() => {
      if (secondsLeft > 0) {
        secondsLeft--;
        const h = Math.floor(secondsLeft / 3600);
        const m = Math.floor((secondsLeft % 3600) / 60);
        const s = secondsLeft % 60;
        el.textContent = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
      }
    }, 1000);
  }

  /**
   * Initialize Dashboard
   */
  function init() {
    // Modal buttons
    if (btnCloseCreateModal) btnCloseCreateModal.addEventListener('click', closeCreateModal);
    if (btnCancelCreateModal) btnCancelCreateModal.addEventListener('click', closeCreateModal);
    if (createHackathonForm) createHackathonForm.addEventListener('submit', handleCreateHackathon);

    // Close modal on click outside (backdrop)
    if (createHackathonModal) {
      createHackathonModal.addEventListener('click', (e) => {
        if (e.target === createHackathonModal) {
          closeCreateModal();
        }
      });
    }

    // Close modal on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && createHackathonModal && !createHackathonModal.classList.contains('hidden')) {
        closeCreateModal();
      }
    });

    // Visibility toggle switch change listener
    if (hackathonIsPublic) {
      hackathonIsPublic.addEventListener('change', (e) => {
        updateVisibilityLabel(e.target.checked);
      });
    }

    // Filter Chips
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const filterVal = chip.getAttribute('data-filter') || chip.textContent.trim().toLowerCase();
        applyFilter(filterVal);
      });
    });

    // Bind all create triggers
    bindCreateModalTriggers();

    // Start hero landing board countdown ticker
    initHeroTimer();

    // Listen for auth state change
    window.addEventListener('hackdeck:auth-change', (e) => {
      const user = e.detail?.user;
      if (user) {
        loadMyHackathons();
      } else {
        cachedHackathons = [];
        if (myHackathonsGrid) myHackathonsGrid.innerHTML = '';
        if (statActiveBoards) statActiveBoards.textContent = '0';
        if (countdownTimerId) clearInterval(countdownTimerId);
      }
    });

    // Check if session is already active
    if (window.currentUser) {
      loadMyHackathons();
    } else if (window.supabaseClient) {
      window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user) {
          loadMyHackathons();
        }
      });
    }
  }

  // Export refresh function globally if needed
  window.loadMyHackathons = loadMyHackathons;

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
