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

  /**
   * Format countdown string
   */
  function formatCountdown(deadlineStr) {
    if (!deadlineStr) return { text: 'No deadline set', isEnded: false };
    const deadlineTime = new Date(deadlineStr).getTime();
    const now = Date.now();
    const diff = deadlineTime - now;

    if (diff <= 0) {
      return { text: 'Ended', isEnded: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    let text = '';
    if (days > 0) {
      text = `${days}d ${hours}h left`;
    } else if (hours > 0) {
      text = `${hours}h ${minutes}m left`;
    } else {
      text = `${minutes}m ${seconds}s left`;
    }

    return { text, isEnded: false };
  }

  /**
   * Ticker to update countdown previews every second
   */
  function startCountdownTicker() {
    if (countdownTimerId) clearInterval(countdownTimerId);

    const updateAll = () => {
      const countdownElements = document.querySelectorAll('.hackathon-countdown[data-deadline]');
      countdownElements.forEach(el => {
        const deadline = el.getAttribute('data-deadline');
        const { text, isEnded } = formatCountdown(deadline);
        
        if (isEnded) {
          el.className = 'hackathon-countdown countdown-ended';
          el.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <span>Deadline Passed</span>
          `;
        } else {
          el.className = 'hackathon-countdown countdown-active';
          el.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <span>${text}</span>
          `;
        }
      });
    };

    updateAll();
    countdownTimerId = setInterval(updateAll, 1000);
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
      // Re-bind any new buttons
      bindCreateModalTriggers();
      return;
    }

    const cardsHtml = hackathons.map(h => {
      const isBuild = (h.phase && String(h.phase).toLowerCase() === 'build');
      const phaseBadgeClass = isBuild ? 'phase-badge-build' : 'phase-badge-brainstorm';
      const phaseText = isBuild ? 'Build Phase' : 'Brainstorm Phase';
      const phaseIcon = isBuild ? '🔨' : '💡';

      const isPublic = Boolean(h.is_public);
      const privacyClass = isPublic ? 'pill-public' : 'pill-private';
      const privacyText = isPublic ? 'Public' : 'Private';
      const privacyIcon = isPublic ? '🌐' : '🔒';

      const { text: countdownText, isEnded } = formatCountdown(h.deadline_at);
      const countdownClass = isEnded ? 'countdown-ended' : 'countdown-active';

      // Format human-friendly deadline date
      let formattedDate = '';
      if (h.deadline_at) {
        const d = new Date(h.deadline_at);
        formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }

      // Event URL link
      let eventUrlMarkup = '';
      if (h.event_url) {
        const cleanUrl = escapeHtml(h.event_url);
        let domain = 'Event Page';
        try {
          const parsed = new URL(h.event_url);
          domain = parsed.hostname.replace('www.', '');
        } catch (_) {}

        eventUrlMarkup = `
          <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="hackathon-card-extlink" title="Open ${domain}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            <span>${escapeHtml(domain)}</span>
          </a>
        `;
      }

      return `
        <div class="white-hackathon-card" data-hackathon-id="${escapeHtml(h.id)}">
          <!-- Card Header Badges -->
          <div class="hackathon-card-header">
            <span class="phase-badge ${phaseBadgeClass}">
              <span>${phaseIcon}</span>
              <span>${phaseText}</span>
            </span>
            <span class="privacy-pill ${privacyClass}">
              <span>${privacyIcon}</span>
              <span>${privacyText}</span>
            </span>
          </div>

          <!-- Title & Countdown -->
          <div class="hackathon-card-body">
            <h4 class="hackathon-card-title">${escapeHtml(h.title)}</h4>
            
            <div class="hackathon-card-meta">
              <div class="hackathon-countdown ${countdownClass}" data-deadline="${escapeHtml(h.deadline_at)}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                <span>${countdownText}</span>
              </div>
              ${eventUrlMarkup}
            </div>

            ${formattedDate ? `<div class="hackathon-deadline-hint">Deadline: ${formattedDate}</div>` : ''}
          </div>

          <!-- Card Footer Action -->
          <div class="hackathon-card-footer">
            <a href="board.html?id=${encodeURIComponent(h.id)}" class="btn btn-primary btn-sm btn-open-workspace">
              <span>Open Workspace</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          </div>
        </div>
      `;
    }).join('');

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

    // Start live timer ticker
    startCountdownTicker();

    // Re-bind triggers on dynamically created shortcut cards
    bindCreateModalTriggers();
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

    if (myHackathonsGrid) {
      myHackathonsGrid.innerHTML = `
        <div class="loading-hackathons-state">
          <div class="loading-spinner"></div>
          <span>Loading your hackathons...</span>
        </div>
      `;
    }

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
