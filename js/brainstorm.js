// js/brainstorm.js - Brainstorming Canvas, Team Roster & Idea Polls System for Hackdeck
(() => {
  // Module state
  let hackathonId = null;
  let currentUser = null;
  let currentProfile = null;
  let isLeader = false;
  let isMember = false;
  let isSpectator = false;

  let currentMembers = [];
  let cachedPolls = [];
  let cachedVotes = [];

  let searchDebounceTimer = null;
  let membersRealtimeChannel = null;
  let pollsRealtimeChannel = null;
  let votesRealtimeChannel = null;

  // DOM Elements - Roster
  const teamRosterSidebar = document.getElementById('teamRosterSidebar');
  const teamMembersList = document.getElementById('teamMembersList');
  const teamMemberCount = document.getElementById('teamMemberCount');
  const leaderAddMemberWrap = document.getElementById('leaderAddMemberWrap');
  const inputSearchMember = document.getElementById('inputSearchMember');
  const memberSearchResults = document.getElementById('memberSearchResults');
  const memberSearchSpinner = document.getElementById('memberSearchSpinner');

  // DOM Elements - Idea Polls
  const ideaPollsGrid = document.getElementById('ideaPollsGrid');
  const btnPitchIdea = document.getElementById('btnPitchIdea');

  // Pitch Modal Elements
  const pitchIdeaModal = document.getElementById('pitchIdeaModal');
  const pitchIdeaForm = document.getElementById('pitchIdeaForm');
  const btnClosePitchModal = document.getElementById('btnClosePitchModal');
  const btnCancelPitchModal = document.getElementById('btnCancelPitchModal');
  const btnSubmitPitchIdea = document.getElementById('btnSubmitPitchIdea');
  const pitchIdeaTitle = document.getElementById('pitchIdeaTitle');
  const pitchIdeaDesc = document.getElementById('pitchIdeaDesc');
  const pitchModalErrorBanner = document.getElementById('pitchModalErrorBanner');
  const pitchModalErrorMessage = document.getElementById('pitchModalErrorMessage');

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

  // =========================================================================
  // 1. Team Roster Sidebar & Member Search
  // =========================================================================

  /**
   * Fetch team members joined with profiles (resilient to schema relations)
   */
  async function loadTeamRoster() {
    if (!window.supabaseClient || !hackathonId) return;

    try {
      let members = [];

      // Attempt joined query first
      try {
        const { data, error } = await window.supabaseClient
          .from('hackathon_members')
          .select(`
            id,
            role,
            user_id,
            profiles (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('hackathon_id', hackathonId);

        if (!error && data) {
          members = data;
        } else {
          throw error;
        }
      } catch (joinErr) {
        // Fallback: 2-step lookup in case relation name differs in PostgREST
        const { data: rawMembers, error: rawErr } = await window.supabaseClient
          .from('hackathon_members')
          .select('*')
          .eq('hackathon_id', hackathonId);

        if (rawErr) throw rawErr;

        if (rawMembers && rawMembers.length > 0) {
          const userIds = rawMembers.map(m => m.user_id).filter(Boolean);
          const { data: profiles } = await window.supabaseClient
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', userIds);

          const profileMap = new Map((profiles || []).map(p => [p.id, p]));
          members = rawMembers.map(m => ({
            ...m,
            profiles: profileMap.get(m.user_id) || null
          }));
        } else {
          members = [];
        }
      }

      currentMembers = members;
      renderTeamRoster(currentMembers);

    } catch (err) {
      console.error('Error fetching team roster:', err);
      if (teamMembersList) {
        teamMembersList.innerHTML = `
          <div style="font-size: 0.8rem; color: var(--danger); padding: 8px;">
            Could not load roster.
          </div>
        `;
      }
    }
  }

  /**
   * Render Team Roster List
   */
  function renderTeamRoster(members) {
    if (!teamMembersList) return;

    if (teamMemberCount) {
      teamMemberCount.textContent = members.length;
    }

    if (members.length === 0) {
      teamMembersList.innerHTML = `
        <div style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 16px 0;">
          No members yet.
        </div>
      `;
      return;
    }

    // Sort: leader first, then by username
    const sorted = [...members].sort((a, b) => {
      const aIsLeader = (a.role === 'leader' || a.user_id === window.HackdeckBoard?.getHackathon()?.leader_id);
      const bIsLeader = (b.role === 'leader' || b.user_id === window.HackdeckBoard?.getHackathon()?.leader_id);
      if (aIsLeader && !bIsLeader) return -1;
      if (!aIsLeader && bIsLeader) return 1;
      const aName = a.profiles?.username || '';
      const bName = b.profiles?.username || '';
      return aName.localeCompare(bName);
    });

    teamMembersList.innerHTML = sorted.map(m => {
      const p = m.profiles || {};
      const username = p.username || 'hacker';
      const displayName = p.display_name || username;
      const avatarUrl = p.avatar_url || '';
      const initial = (displayName || username).charAt(0).toUpperCase();

      const isLeaderMember = (m.role === 'leader' || m.user_id === window.HackdeckBoard?.getHackathon()?.leader_id);
      const roleText = isLeaderMember ? 'Leader' : (m.role || 'Member');
      const roleBadgeClass = isLeaderMember ? 'role-badge-leader' : 'role-badge-member';

      const avatarMarkup = avatarUrl
        ? `<img class="team-member-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(username)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'32\\' height=\\'32\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23232323\\'/><text x=\\'50%\\' y=\\'54%\\' font-family=\\'sans-serif\\' font-size=\\'14\\' font-weight=\\'600\\' fill=\\'%23a1a1a1\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>${escapeHtml(initial)}</text></svg>';">`
        : `<div class="team-member-avatar">${escapeHtml(initial)}</div>`;

      return `
        <div class="team-member-item">
          <div class="team-member-profile">
            ${avatarMarkup}
            <div class="team-member-text">
              <span class="team-member-name">${escapeHtml(displayName)}</span>
              <span class="team-member-handle">@${escapeHtml(username)}</span>
            </div>
          </div>
          <span class="role-badge ${roleBadgeClass}">${escapeHtml(roleText)}</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Search public.profiles by username (Debounced)
   */
  async function searchProfiles(query) {
    if (!window.supabaseClient || !memberSearchResults) return;
    const cleanQuery = query.trim().replace(/^@/, '');

    if (cleanQuery.length < 2) {
      memberSearchResults.classList.add('hidden');
      memberSearchResults.innerHTML = '';
      return;
    }

    if (memberSearchSpinner) memberSearchSpinner.classList.remove('hidden');

    try {
      const { data: profiles, error } = await window.supabaseClient
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${cleanQuery}%`)
        .limit(6);

      if (error) throw error;

      // Filter out users who are already in currentMembers
      const existingUserIds = new Set(currentMembers.map(m => m.user_id));
      const candidates = (profiles || []).filter(p => !existingUserIds.has(p.id));

      if (candidates.length === 0) {
        memberSearchResults.innerHTML = `
          <div style="padding: 10px 12px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
            No users available to add.
          </div>
        `;
      } else {
        memberSearchResults.innerHTML = candidates.map(p => {
          const initial = (p.display_name || p.username || 'U').charAt(0).toUpperCase();
          const avatar = p.avatar_url
            ? `<img class="search-item-avatar" src="${escapeHtml(p.avatar_url)}" alt="${escapeHtml(p.username)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'28\\' height=\\'28\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23232323\\'/><text x=\\'50%\\' y=\\'54%\\' font-family=\\'sans-serif\\' font-size=\\'12\\' font-weight=\\'600\\' fill=\\'%23a1a1a1\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>${escapeHtml(initial)}</text></svg>';">`
            : `<div class="search-item-avatar" style="display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:var(--text-muted);">${escapeHtml(initial)}</div>`;

          return `
            <div class="member-search-item" data-user-id="${escapeHtml(p.id)}" data-username="${escapeHtml(p.username)}">
              <div class="search-item-info">
                ${avatar}
                <div>
                  <div class="search-item-name">${escapeHtml(p.display_name || p.username)}</div>
                  <div class="search-item-handle">@${escapeHtml(p.username)}</div>
                </div>
              </div>
              <button type="button" class="btn btn-outline btn-sm btn-add-candidate" data-user-id="${escapeHtml(p.id)}" style="padding: 3px 8px; font-size: 0.75rem;">
                + Add
              </button>
            </div>
          `;
        }).join('');
      }

      memberSearchResults.classList.remove('hidden');

    } catch (err) {
      console.error('Error searching profiles:', err);
    } finally {
      if (memberSearchSpinner) memberSearchSpinner.classList.add('hidden');
    }
  }

  /**
   * Add selected user to hackathon_members with role = 'member'
   */
  async function addMemberToTeam(userId, username) {
    if (!window.supabaseClient || !isLeader || !hackathonId) return;

    try {
      const newMemberRow = {
        hackathon_id: hackathonId,
        user_id: userId,
        role: 'member'
      };

      const { error } = await window.supabaseClient
        .from('hackathon_members')
        .insert([newMemberRow]);

      if (error) {
        if (error.code === '23505') {
          if (typeof window.showToast === 'function') {
            window.showToast(`@${username} is already on the team.`, 'info');
          }
        } else {
          throw error;
        }
      } else {
        if (typeof window.showToast === 'function') {
          window.showToast(`Added @${username} to the team!`, 'success');
        }
      }

      // Reset search box & dropdown
      if (inputSearchMember) inputSearchMember.value = '';
      if (memberSearchResults) {
        memberSearchResults.classList.add('hidden');
        memberSearchResults.innerHTML = '';
      }

      // Refresh roster
      await loadTeamRoster();

    } catch (err) {
      console.error('Error adding member to team:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to add member', 'error');
      }
    }
  }

  // =========================================================================
  // 2. Idea Poll System & Realtime Voting
  // =========================================================================

  /**
   * Fetch all idea polls and their votes
   */
  async function loadIdeaPolls() {
    if (!window.supabaseClient || !hackathonId) return;

    try {
      // 1. Fetch idea_polls for this hackathon
      const { data: polls, error: pollsErr } = await window.supabaseClient
        .from('idea_polls')
        .select('*')
        .eq('hackathon_id', hackathonId)
        .order('created_at', { ascending: false });

      if (pollsErr) throw pollsErr;

      cachedPolls = polls || [];
      const pollIds = cachedPolls.map(p => p.id);

      // 2. Fetch votes for these polls
      let votes = [];
      if (pollIds.length > 0) {
        const { data: votesData, error: votesErr } = await window.supabaseClient
          .from('idea_votes')
          .select('*')
          .in('poll_id', pollIds);

        if (!votesErr && votesData) {
          votes = votesData;
        }
      }
      cachedVotes = votes;

      // 3. Fetch author profiles
      const authorIds = [...new Set(cachedPolls.map(p => p.created_by).filter(Boolean))];
      let authorMap = new Map();
      if (authorIds.length > 0) {
        const { data: profiles } = await window.supabaseClient
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', authorIds);

        (profiles || []).forEach(p => authorMap.set(p.id, p));
      }

      renderIdeaPolls(cachedPolls, cachedVotes, authorMap);

    } catch (err) {
      console.error('Error loading idea polls:', err);
      if (ideaPollsGrid) {
        ideaPollsGrid.innerHTML = `
          <div class="empty-ideas-state" style="border-color: var(--danger-border); background-color: var(--danger-bg); grid-column: 1/-1;">
            <p style="color:#b91c1c; font-size: 0.9rem;">Could not load ideas: ${escapeHtml(err.message || 'Database error')}</p>
            <button class="btn btn-outline btn-sm" id="btnRetryPolls" style="margin-top: 10px;">Retry</button>
          </div>
        `;
        const retryBtn = document.getElementById('btnRetryPolls');
        if (retryBtn) retryBtn.addEventListener('click', loadIdeaPolls);
      }
    }
  }

  /**
   * Render Idea Polls Grid with Live Vote Counts
   */
  function renderIdeaPolls(polls, votes, authorMap) {
    if (!ideaPollsGrid) return;

    if (!polls || polls.length === 0) {
      ideaPollsGrid.innerHTML = `
        <div class="empty-ideas-state">
          <div style="font-size: 2.2rem; margin-bottom: 12px;">💡</div>
          <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No ideas pitched yet</h4>
          <p style="font-size: 0.88rem; color: var(--text-muted); max-width: 420px; line-height: 1.5; margin-bottom: 16px;">
            Be the first hacker to propose a project direction for this hackathon board. Team members can vote and help decide our focus!
          </p>
          <button class="btn btn-primary btn-sm member-only-control" id="btnPitchIdeaEmpty">
            <span>+ Pitch First Idea</span>
          </button>
        </div>
      `;
      const btnEmpty = document.getElementById('btnPitchIdeaEmpty');
      if (btnEmpty) btnEmpty.addEventListener('click', openPitchModal);
      return;
    }

    // Group votes by poll_id
    const votesByPoll = new Map();
    (votes || []).forEach(v => {
      if (!votesByPoll.has(v.poll_id)) {
        votesByPoll.set(v.poll_id, []);
      }
      votesByPoll.get(v.poll_id).push(v);
    });

    // Sort: highest votes first
    const sorted = [...polls].sort((a, b) => {
      const aCount = votesByPoll.get(a.id)?.length || 0;
      const bCount = votesByPoll.get(b.id)?.length || 0;
      return bCount - aCount;
    });

    ideaPollsGrid.innerHTML = sorted.map(poll => {
      const pollVotes = votesByPoll.get(poll.id) || [];
      const voteCount = pollVotes.length;
      const hasVoted = currentUser ? pollVotes.some(v => v.user_id === currentUser.id) : false;

      const author = authorMap.get(poll.created_by) || {};
      const authorUsername = author.username || 'hacker';
      const authorDisplayName = author.display_name || authorUsername;
      const initial = (authorDisplayName || authorUsername).charAt(0).toUpperCase();

      const authorAvatarMarkup = author.avatar_url
        ? `<img class="idea-author-avatar" src="${escapeHtml(author.avatar_url)}" alt="${escapeHtml(authorUsername)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23232323\\'/><text x=\\'50%\\' y=\\'54%\\' font-family=\\'sans-serif\\' font-size=\\'11\\' font-weight=\\'600\\' fill=\\'%23a1a1a1\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>${escapeHtml(initial)}</text></svg>';">`
        : `<div class="idea-author-avatar">${escapeHtml(initial)}</div>`;

      // Vote Button: Primary if voted, Outline if not voted
      const voteBtnClass = hasVoted ? 'btn btn-primary btn-sm btn-vote-action btn-voted' : 'btn btn-outline btn-sm btn-vote-action';
      const voteBtnText = hasVoted ? '▲ Voted' : '▲ Upvote';

      // Leader Lock Idea Button: Visible only if isLeader
      const lockButtonMarkup = isLeader
        ? `<button class="btn-lock-idea btn-lock-winning-idea" data-poll-id="${escapeHtml(poll.id)}" data-poll-title="${escapeHtml(poll.title)}" data-poll-desc="${escapeHtml(poll.description || '')}" title="Lock this concept as the winning mission and transition workspace to Phase 2">
            <span>🔒 Lock Winning Idea</span>
          </button>`
        : '';

      return `
        <div class="idea-poll-card" data-poll-id="${escapeHtml(poll.id)}">
          <div>
            <div class="idea-poll-header">
              <h3 class="idea-poll-title">${escapeHtml(poll.title)}</h3>
              <span class="idea-votes-count">
                <span>▲</span>
                <span>${voteCount} ${voteCount === 1 ? 'vote' : 'votes'}</span>
              </span>
            </div>

            <p class="idea-poll-desc">${escapeHtml(poll.description || 'No description provided.')}</p>
          </div>

          <div>
            <div class="idea-poll-author">
              ${authorAvatarMarkup}
              <span>Pitched by <strong>@${escapeHtml(authorUsername)}</strong></span>
            </div>

            <div class="idea-poll-actions">
              <!-- Vote Action (Member-only) -->
              <button 
                class="${voteBtnClass} member-only-control btn-trigger-vote" 
                data-poll-id="${escapeHtml(poll.id)}" 
                data-has-voted="${hasVoted ? 'true' : 'false'}"
              >
                ${voteBtnText}
              </button>

              <!-- Leader Lock Idea Button -->
              ${lockButtonMarkup}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind event listeners for vote buttons & lock idea buttons
    bindPollCardActions();
  }

  /**
   * Bind Poll Card Interaction Actions
   */
  function bindPollCardActions() {
    // 1. Vote / Unvote Actions
    const voteBtns = document.querySelectorAll('.btn-trigger-vote');
    voteBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const pollId = btn.getAttribute('data-poll-id');
        const hasVoted = (btn.getAttribute('data-has-voted') === 'true');
        await handleVoteToggle(pollId, hasVoted);
      });
    });

    // 2. Lock Winning Idea Actions (Leader only)
    const lockBtns = document.querySelectorAll('.btn-lock-winning-idea');
    lockBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const pollId = btn.getAttribute('data-poll-id');
        const pollTitle = btn.getAttribute('data-poll-title');
        const pollDesc = btn.getAttribute('data-poll-desc');
        await handleLockIdea(pollId, pollTitle, pollDesc);
      });
    });
  }

  /**
   * Vote / Unvote Handler: Inserts or Deletes user's row in public.idea_votes (poll_id, user_id)
   */
  async function handleVoteToggle(pollId, currentlyVoted) {
    if (!window.supabaseClient || !currentUser) {
      if (typeof window.showToast === 'function') {
        window.showToast('Please sign in to vote on ideas.', 'error');
      }
      return;
    }

    try {
      if (currentlyVoted) {
        // Unvote: Delete user's vote row
        const { error } = await window.supabaseClient
          .from('idea_votes')
          .delete()
          .eq('poll_id', pollId)
          .eq('user_id', currentUser.id);

        if (error) throw error;
        if (typeof window.showToast === 'function') {
          window.showToast('Vote removed.', 'info');
        }
      } else {
        // Vote: Insert user's vote row
        const { error } = await window.supabaseClient
          .from('idea_votes')
          .insert([{
            poll_id: pollId,
            user_id: currentUser.id
          }]);

        if (error) {
          // If already voted (unique constraint)
          if (error.code !== '23505') throw error;
        }
        if (typeof window.showToast === 'function') {
          window.showToast('Vote recorded!', 'success');
        }
      }

      // Re-fetch to update counts immediately
      await loadIdeaPolls();

    } catch (err) {
      console.error('Error toggling vote:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to update vote', 'error');
      }
    }
  }

  // =========================================================================
  // 3. Leader Lock Idea Action
  // =========================================================================

  /**
   * Confirms with the leader, then updates public.hackathons setting:
   * phase = 'build'
   * locked_idea_title = poll.title
   * locked_idea_summary = poll.description
   */
  async function handleLockIdea(pollId, pollTitle, pollDesc) {
    if (!window.supabaseClient || !isLeader || !hackathonId) return;

    const confirmed = window.confirm(
      `Lock "${pollTitle}" as the winning project idea?\n\n` +
      `This will officially advance the entire hackathon workspace to Phase 2 (Build Sprint) for all teammates.`
    );

    if (!confirmed) return;

    try {
      const updatePayload = {
        phase: 'build',
        locked_idea_title: pollTitle,
        locked_idea_summary: pollDesc || ''
      };

      const { error } = await window.supabaseClient
        .from('hackathons')
        .update(updatePayload)
        .eq('id', hackathonId);

      if (error) throw error;

      if (typeof window.showToast === 'function') {
        window.showToast(`Locked winning idea: "${pollTitle}"! Advancing to Build Phase...`, 'success');
      }

      // Realtime subscription in board.js will automatically detect the UPDATE
      // and transition all connected teammates to Phase 2 UI.

    } catch (err) {
      console.error('Error locking idea:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to lock winning idea', 'error');
      }
    }
  }

  // =========================================================================
  // 4. Pitch New Idea Modal Form
  // =========================================================================

  function openPitchModal() {
    if (!pitchIdeaModal) return;
    if (pitchIdeaForm) pitchIdeaForm.reset();
    if (pitchModalErrorBanner) pitchModalErrorBanner.classList.add('hidden');
    pitchIdeaModal.classList.remove('hidden');
    if (pitchIdeaTitle) pitchIdeaTitle.focus();
  }

  function closePitchModal() {
    if (!pitchIdeaModal) return;
    pitchIdeaModal.classList.add('hidden');
    if (pitchModalErrorBanner) pitchModalErrorBanner.classList.add('hidden');
    if (btnSubmitPitchIdea) {
      btnSubmitPitchIdea.disabled = false;
      btnSubmitPitchIdea.innerHTML = '<span>Pitch Idea</span>';
    }
  }

  function showPitchModalError(msg) {
    if (pitchModalErrorMessage) pitchModalErrorMessage.textContent = msg;
    if (pitchModalErrorBanner) pitchModalErrorBanner.classList.remove('hidden');
  }

  async function handlePitchIdeaSubmit(e) {
    e.preventDefault();
    if (!window.supabaseClient || !currentUser || !hackathonId) return;

    const titleVal = (pitchIdeaTitle?.value || '').trim();
    const descVal = (pitchIdeaDesc?.value || '').trim();

    if (!titleVal) {
      showPitchModalError('Please enter an idea title.');
      pitchIdeaTitle?.focus();
      return;
    }

    if (!descVal) {
      showPitchModalError('Please describe the concept.');
      pitchIdeaDesc?.focus();
      return;
    }

    if (btnSubmitPitchIdea) {
      btnSubmitPitchIdea.disabled = true;
      btnSubmitPitchIdea.innerHTML = '<span>Pitching concept...</span>';
    }
    if (pitchModalErrorBanner) pitchModalErrorBanner.classList.add('hidden');

    try {
      const payload = {
        hackathon_id: hackathonId,
        created_by: currentUser.id,
        title: titleVal,
        description: descVal
      };

      const { data, error } = await window.supabaseClient
        .from('idea_polls')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      closePitchModal();
      if (typeof window.showToast === 'function') {
        window.showToast(`Pitched "${titleVal}" successfully!`, 'success');
      }

      // Automatically cast author's initial vote for their idea
      if (data && data.id) {
        try {
          await window.supabaseClient
            .from('idea_votes')
            .insert([{ poll_id: data.id, user_id: currentUser.id }]);
        } catch (_) {}
      }

      await loadIdeaPolls();

    } catch (err) {
      console.error('Error submitting idea poll:', err);
      showPitchModalError(err.message || 'Failed to submit idea. Please check database permissions.');
    } finally {
      if (btnSubmitPitchIdea) {
        btnSubmitPitchIdea.disabled = false;
        btnSubmitPitchIdea.innerHTML = '<span>Pitch Idea</span>';
      }
    }
  }

  // =========================================================================
  // 5. Supabase Realtime Subscriptions
  // =========================================================================

  function setupBrainstormRealtime(id) {
    if (!window.supabaseClient || !id) return;

    // 1. Subscribe to hackathon_members changes
    if (membersRealtimeChannel) window.supabaseClient.removeChannel(membersRealtimeChannel);
    membersRealtimeChannel = window.supabaseClient
      .channel(`members-realtime-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hackathon_members',
          filter: `hackathon_id=eq.${id}`
        },
        (payload) => {
          console.log('Realtime hackathon_members update:', payload);
          loadTeamRoster();
        }
      )
      .subscribe();

    // 2. Subscribe to idea_polls changes
    if (pollsRealtimeChannel) window.supabaseClient.removeChannel(pollsRealtimeChannel);
    pollsRealtimeChannel = window.supabaseClient
      .channel(`polls-realtime-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'idea_polls',
          filter: `hackathon_id=eq.${id}`
        },
        (payload) => {
          console.log('Realtime idea_polls update:', payload);
          loadIdeaPolls();
        }
      )
      .subscribe();

    // 3. Subscribe to idea_votes changes
    if (votesRealtimeChannel) window.supabaseClient.removeChannel(votesRealtimeChannel);
    votesRealtimeChannel = window.supabaseClient
      .channel(`votes-realtime-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'idea_votes'
        },
        (payload) => {
          console.log('Realtime idea_votes update:', payload);
          loadIdeaPolls();
        }
      )
      .subscribe();
  }

  // =========================================================================
  // 6. Initialization & Board Integration
  // =========================================================================

  function setupFromBoardContext(ctx) {
    if (!ctx || !ctx.hackathon) return;
    const hackathon = ctx.hackathon;
    hackathonId = hackathon.id;
    currentUser = ctx.user;
    currentProfile = ctx.profile;
    isLeader = ctx.isLeader;
    isMember = ctx.isMember;
    isSpectator = ctx.isSpectator;

    // Configure Leader Member Search UI visibility
    if (leaderAddMemberWrap) {
      if (isLeader) {
        leaderAddMemberWrap.classList.remove('hidden');
      } else {
        leaderAddMemberWrap.classList.add('hidden');
      }
    }

    // Load initial data
    loadTeamRoster();
    loadIdeaPolls();

    // Setup Realtime subscriptions
    setupBrainstormRealtime(hackathonId);
  }

  function bindEvents() {
    // Pitch Idea Trigger Buttons
    if (btnPitchIdea) btnPitchIdea.addEventListener('click', openPitchModal);
    if (btnClosePitchModal) btnClosePitchModal.addEventListener('click', closePitchModal);
    if (btnCancelPitchModal) btnCancelPitchModal.addEventListener('click', closePitchModal);
    if (pitchIdeaForm) pitchIdeaForm.addEventListener('submit', handlePitchIdeaSubmit);

    // Close pitch modal on backdrop click
    if (pitchIdeaModal) {
      pitchIdeaModal.addEventListener('click', (e) => {
        if (e.target === pitchIdeaModal) closePitchModal();
      });
    }

    // Close pitch modal on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && pitchIdeaModal && !pitchIdeaModal.classList.contains('hidden')) {
        closePitchModal();
      }
    });

    // Leader Member Search Input (Debounced)
    if (inputSearchMember) {
      inputSearchMember.addEventListener('input', (e) => {
        const query = e.target.value;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          searchProfiles(query);
        }, 220);
      });

      // Clear search when clicking outside
      document.addEventListener('click', (e) => {
        if (leaderAddMemberWrap && !leaderAddMemberWrap.contains(e.target)) {
          if (memberSearchResults) memberSearchResults.classList.add('hidden');
        }
      });
    }

    // Delegate "+ Add" candidate buttons in search dropdown
    if (memberSearchResults) {
      memberSearchResults.addEventListener('click', (e) => {
        const btnAdd = e.target.closest('.btn-add-candidate');
        if (btnAdd) {
          const userId = btnAdd.getAttribute('data-user-id');
          const item = btnAdd.closest('.member-search-item');
          const username = item ? item.getAttribute('data-username') : 'user';
          addMemberToTeam(userId, username);
        }
      });
    }
  }

  function init() {
    bindEvents();

    // Listen for board ready event from board.js
    window.addEventListener('hackdeck:board-ready', (e) => {
      setupFromBoardContext(e.detail);
    });

    // Or check if board context is already exposed
    if (window.HackdeckBoard && window.HackdeckBoard.getHackathon()) {
      setupFromBoardContext({
        hackathon: window.HackdeckBoard.getHackathon(),
        user: window.HackdeckBoard.getUser(),
        profile: window.HackdeckBoard.getProfile(),
        isLeader: window.HackdeckBoard.isLeader(),
        isMember: window.HackdeckBoard.isMember(),
        isSpectator: window.HackdeckBoard.isSpectator()
      });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
