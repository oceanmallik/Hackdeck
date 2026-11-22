// js/invitations.js - Top Invitation Notification Bar & Realtime Handling for Hackdeck
(() => {
  let currentUser = null;
  let userInvitesRealtimeChannel = null;
  let cachedInvitations = [];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getBannerContainer() {
    let banner = document.getElementById('invitationBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'invitationBanner';
      document.body.insertBefore(banner, document.body.firstChild);
    }
    return banner;
  }

  /**
   * Load pending invitations where invitee_id = currentUser.id and status = 'pending'
   */
  async function loadUserInvitations() {
    if (!window.supabaseClient || !currentUser) {
      const banner = getBannerContainer();
      if (banner) {
        banner.innerHTML = '';
        banner.classList.add('hidden');
      }
      return;
    }

    try {
      let invitations = [];

      // Joined query first
      try {
        const { data, error } = await window.supabaseClient
          .from('hackathon_invitations')
          .select(`
            id,
            hackathon_id,
            inviter_id,
            invitee_id,
            status,
            created_at,
            hackathons (
              id,
              title
            ),
            inviter:profiles!inviter_id (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('invitee_id', currentUser.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (!error && data) {
          invitations = data;
        } else {
          throw error;
        }
      } catch (joinErr) {
        // Fallback: 2-step lookup in case relation name differs in PostgREST
        const { data: rawInvites, error: rawErr } = await window.supabaseClient
          .from('hackathon_invitations')
          .select('*')
          .eq('invitee_id', currentUser.id)
          .eq('status', 'pending');

        if (rawErr) throw rawErr;

        if (rawInvites && rawInvites.length > 0) {
          const hackathonIds = rawInvites.map(i => i.hackathon_id).filter(Boolean);
          const inviterIds = rawInvites.map(i => i.inviter_id).filter(Boolean);

          const [hackathonsRes, profilesRes] = await Promise.all([
            window.supabaseClient.from('hackathons').select('id, title').in('id', hackathonIds),
            window.supabaseClient.from('profiles').select('id, username, display_name, avatar_url').in('id', inviterIds)
          ]);

          const hackathonMap = new Map((hackathonsRes.data || []).map(h => [h.id, h]));
          const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p]));

          invitations = rawInvites.map(i => ({
            ...i,
            hackathons: hackathonMap.get(i.hackathon_id) || null,
            inviter: profileMap.get(i.inviter_id) || null
          }));
        } else {
          invitations = [];
        }
      }

      cachedInvitations = invitations;
      renderInvitationBanner(cachedInvitations);

    } catch (err) {
      console.warn('Notice loading user invitations:', err);
    }
  }

  /**
   * Render top invitation banner rows
   */
  function renderInvitationBanner(invitations) {
    const banner = getBannerContainer();
    if (!banner) return;

    if (!invitations || invitations.length === 0) {
      banner.innerHTML = '';
      banner.classList.add('hidden');
      return;
    }

    banner.classList.remove('hidden');

    banner.innerHTML = invitations.map(inv => {
      const inviterName = inv.inviter?.username || inv.inviter?.display_name || 'A team leader';
      const hackathonTitle = inv.hackathons?.title || 'a hackathon board';
      const hackathonId = inv.hackathon_id;

      return `
        <div class="invitation-banner-row" data-invite-id="${escapeHtml(inv.id)}" data-hackathon-id="${escapeHtml(hackathonId)}" data-hackathon-title="${escapeHtml(hackathonTitle)}">
          <div class="invitation-banner-content">
            <span class="invitation-banner-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </span>
            <div class="invitation-banner-text">
              <span class="inviter-tag">@${escapeHtml(inviterName)}</span>
              <span>invited you to join</span>
              <strong class="hackathon-tag">${escapeHtml(hackathonTitle)}</strong>
            </div>
          </div>
          <div class="invitation-banner-actions">
            <button type="button" class="btn btn-invitation-accept" data-invite-id="${escapeHtml(inv.id)}" data-hackathon-id="${escapeHtml(hackathonId)}">
              <span>Accept</span>
            </button>
            <button type="button" class="btn btn-invitation-reject" data-invite-id="${escapeHtml(inv.id)}">
              <span>Reject</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Accept Invitation
   */
  async function handleAccept(inviteId, hackathonId, rowEl) {
    if (!window.supabaseClient || !currentUser) return;

    const acceptBtn = rowEl?.querySelector('.btn-invitation-accept');
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.innerHTML = '<span>Joining...</span>';
    }

    const hackathonTitle = rowEl?.getAttribute('data-hackathon-title') || 'Hackathon';

    try {
      // 1. Update public.hackathon_invitations setting status = 'accepted'
      const { error: updateErr } = await window.supabaseClient
        .from('hackathon_invitations')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString()
        })
        .eq('id', inviteId);

      if (updateErr) throw updateErr;

      // 2. Fallback ensure user is in hackathon_members if DB trigger didn't immediately add
      try {
        await window.supabaseClient
          .from('hackathon_members')
          .insert([{
            hackathon_id: hackathonId,
            user_id: currentUser.id,
            role: 'member'
          }]);
      } catch (_) {
        // Ignored if DB trigger already fired
      }

      if (typeof window.showToast === 'function') {
        window.showToast(`Joined "${hackathonTitle}"!`, 'success');
      }

      // Remove row from banner
      if (rowEl) {
        rowEl.remove();
        cachedInvitations = cachedInvitations.filter(i => i.id !== inviteId);
        const banner = getBannerContainer();
        if (banner && banner.querySelectorAll('.invitation-banner-row').length === 0) {
          banner.classList.add('hidden');
        }
      }

      // Refresh Dashboard hackathon grid if on index.html
      if (typeof window.loadMyHackathons === 'function') {
        window.loadMyHackathons();
      }

      // If currently on board.html with this hackathon ID, reload board permissions
      const urlParams = new URLSearchParams(window.location.search);
      const currentBoardId = urlParams.get('id');
      if (currentBoardId && currentBoardId === hackathonId) {
        window.location.reload();
      }

    } catch (err) {
      console.error('Error accepting invitation:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Could not accept invitation.', 'error');
      }
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.innerHTML = '<span>Accept</span>';
      }
    }
  }

  /**
   * Reject Invitation
   */
  async function handleReject(inviteId, rowEl) {
    if (!window.supabaseClient || !currentUser) return;

    const rejectBtn = rowEl?.querySelector('.btn-invitation-reject');
    if (rejectBtn) {
      rejectBtn.disabled = true;
    }

    try {
      const { error } = await window.supabaseClient
        .from('hackathon_invitations')
        .update({
          status: 'rejected',
          responded_at: new Date().toISOString()
        })
        .eq('id', inviteId);

      if (error) throw error;

      if (typeof window.showToast === 'function') {
        window.showToast('Declined invitation.', 'info');
      }

      // Remove row immediately
      if (rowEl) {
        rowEl.remove();
        cachedInvitations = cachedInvitations.filter(i => i.id !== inviteId);
        const banner = getBannerContainer();
        if (banner && banner.querySelectorAll('.invitation-banner-row').length === 0) {
          banner.classList.add('hidden');
        }
      }

    } catch (err) {
      console.error('Error declining invitation:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Could not decline invitation.', 'error');
      }
      if (rejectBtn) {
        rejectBtn.disabled = false;
      }
    }
  }

  /**
   * Realtime subscription for incoming invitations
   */
  function subscribeToUserInvites() {
    if (!window.supabaseClient || !currentUser) return;

    if (userInvitesRealtimeChannel) {
      window.supabaseClient.removeChannel(userInvitesRealtimeChannel);
    }

    userInvitesRealtimeChannel = window.supabaseClient
      .channel(`user-invites:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hackathon_invitations',
          filter: `invitee_id=eq.${currentUser.id}`
        },
        (payload) => {
          console.log('Realtime user invitation event:', payload);
          loadUserInvitations();
        }
      )
      .subscribe();
  }

  function init() {
    const banner = getBannerContainer();

    // Event delegation for Accept / Reject
    if (banner) {
      banner.addEventListener('click', (e) => {
        const acceptBtn = e.target.closest('.btn-invitation-accept');
        const rejectBtn = e.target.closest('.btn-invitation-reject');
        const row = e.target.closest('.invitation-banner-row');

        if (acceptBtn && row) {
          const inviteId = acceptBtn.getAttribute('data-invite-id');
          const hackathonId = acceptBtn.getAttribute('data-hackathon-id');
          handleAccept(inviteId, hackathonId, row);
        } else if (rejectBtn && row) {
          const inviteId = rejectBtn.getAttribute('data-invite-id');
          handleReject(inviteId, row);
        }
      });
    }

    // Listen for auth change
    window.addEventListener('hackdeck:auth-change', (e) => {
      currentUser = e.detail?.user || null;
      if (currentUser) {
        loadUserInvitations();
        subscribeToUserInvites();
      } else {
        if (banner) {
          banner.innerHTML = '';
          banner.classList.add('hidden');
        }
        if (userInvitesRealtimeChannel && window.supabaseClient) {
          window.supabaseClient.removeChannel(userInvitesRealtimeChannel);
          userInvitesRealtimeChannel = null;
        }
      }
    });

    // Check if session is already active
    if (window.currentUser) {
      currentUser = window.currentUser;
      loadUserInvitations();
      subscribeToUserInvites();
    } else if (window.supabaseClient) {
      window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session && session.user) {
          currentUser = session.user;
          loadUserInvitations();
          subscribeToUserInvites();
        }
      });
    }
  }

  window.HackdeckInvitations = {
    loadUserInvitations,
    getInvitations: () => cachedInvitations
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
