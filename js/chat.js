/**
 * Hackdeck Team Chat (js/chat.js)
 * Clean Minimal White Theme (#ffffff, #f8fafc, #e2e8f0, #0f172a, #2563eb)
 *
 * Real-time private team chat for teammates:
 * - Rendered in both Phase 1 (Brainstorm) and Phase 2 (Build) when isMember is true.
 * - Completely hidden in Public Spectator Mode (!isMember).
 * - Queries public.messages ordered by created_at ascending, joined with public.profiles via user_id.
 * - Realtime INSERT subscription filtered by hackathon_id=eq.${hackathonId}.
 * - Auto-scrolls feed to bottom on new messages.
 * - Enter-to-send support & unread badge indicator when popup is closed.
 */

(function () {
  'use strict';

  // State
  let currentHackathon = null;
  let hackathonId = null;
  let currentUser = null;
  let currentProfile = null;
  let isLeader = false;
  let isMember = false;
  let isSpectator = true;
  let isSending = false;

  // Realtime channel
  let chatChannel = null;

  // Profile cache: user_id -> profile
  const profileCache = new Map();

  // DOM Elements
  const teamChatPanel = document.getElementById('teamChatPanel');
  const teamChatPopup = document.getElementById('teamChatPopup');
  const teamChatMessages = document.getElementById('teamChatMessages');
  const teamChatForm = document.getElementById('teamChatForm');
  const chatMessageInput = document.getElementById('chatMessageInput');
  const btnSendChatMessage = document.getElementById('btnSendChatMessage');
  const btnToggleChat = document.getElementById('btnToggleChat');
  const btnCloseChat = document.getElementById('btnCloseChat');
  const chatUnreadDot = document.getElementById('chatUnreadDot');

  /**
   * HTML entity escaper for safe rendering
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format message timestamp (e.g., "10:45 AM" or "Nov 22, 10:45 AM")
   */
  function formatChatTime(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';

      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      if (isToday) {
        return timeString;
      }

      const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${dateString}, ${timeString}`;
    } catch {
      return '';
    }
  }

  /**
   * Format full ISO string for title/tooltip
   */
  function formatFullTime(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return '';
    }
  }

  /**
   * Scroll chat message feed to bottom
   */
  function scrollToBottom(smooth = false) {
    if (!teamChatMessages) return;
    requestAnimationFrame(() => {
      if (smooth) {
        teamChatMessages.scrollTo({
          top: teamChatMessages.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        teamChatMessages.scrollTop = teamChatMessages.scrollHeight;
      }
    });
  }

  /**
   * Show / hide unread notification dot
   */
  function showUnreadDot() {
    if (chatUnreadDot) {
      chatUnreadDot.classList.remove('hidden');
    }
  }

  function hideUnreadDot() {
    if (chatUnreadDot) {
      chatUnreadDot.classList.add('hidden');
    }
  }

  /**
   * Remove empty state placeholder if present
   */
  function removeEmptyStateIfPresent() {
    if (!teamChatMessages) return;
    const empty = teamChatMessages.querySelector('.chat-empty-state');
    if (empty) {
      empty.remove();
    }
  }

  /**
   * Build message DOM element
   */
  function createMessageElement(msg, profile) {
    const isMe = currentUser && msg.user_id === currentUser.id;
    const p = profile || {};
    const username = p.username || (isMe ? (currentProfile?.username || 'me') : 'teammate');
    const displayName = p.display_name || username;
    const avatarUrl = p.avatar_url || (isMe ? currentProfile?.avatar_url : null);
    const initial = (displayName || username).charAt(0).toUpperCase() || 'H';
    const timeFormatted = formatChatTime(msg.created_at);
    const fullTime = formatFullTime(msg.created_at);

    const row = document.createElement('div');
    row.id = `chat-msg-${msg.id}`;
    row.className = `chat-msg-row ${isMe ? 'chat-msg-row-me' : 'chat-msg-row-peer'}`;

    if (!isMe) {
      // Peer avatar
      const avatarContainer = document.createElement('div');
      avatarContainer.className = 'chat-sender-avatar';
      if (avatarUrl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = username;
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          img.remove();
          avatarContainer.textContent = initial;
        };
        avatarContainer.appendChild(img);
      } else {
        avatarContainer.textContent = initial;
      }
      row.appendChild(avatarContainer);
    }

    // Message bubble wrapper
    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg-wrapper ${isMe ? 'chat-msg-wrapper-me' : 'chat-msg-wrapper-peer'}`;

    // Meta header (author name & time)
    const meta = document.createElement('div');
    meta.className = 'chat-meta';

    if (!isMe) {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'chat-sender-name';
      nameSpan.textContent = displayName;

      const handleSpan = document.createElement('span');
      handleSpan.className = 'chat-sender-username';
      handleSpan.textContent = `@${username}`;

      meta.appendChild(nameSpan);
      meta.appendChild(handleSpan);
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-timestamp';
    timeSpan.textContent = timeFormatted;
    timeSpan.title = fullTime;
    meta.appendChild(timeSpan);

    wrapper.appendChild(meta);

    // Message bubble
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-peer'}`;
    bubble.textContent = msg.content; // textContent handles escaping automatically
    wrapper.appendChild(bubble);

    row.appendChild(wrapper);
    return row;
  }

  /**
   * Append message node to chat feed
   */
  function appendMessageNode(msg, profile) {
    if (!teamChatMessages) return;
    const el = createMessageElement(msg, profile);
    teamChatMessages.appendChild(el);
  }

  /**
   * Render error state in chat box
   */
  function renderErrorState(message) {
    if (!teamChatMessages) return;
    teamChatMessages.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">⚠️</div>
        <div class="chat-empty-text">Chat Error</div>
        <div class="chat-empty-hint">${escapeHtml(message)}</div>
      </div>
    `;
  }

  /**
   * Render empty state in chat box
   */
  function renderEmptyState() {
    if (!teamChatMessages) return;
    teamChatMessages.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">💬</div>
        <div class="chat-empty-text">Team Room</div>
        <div class="chat-empty-hint">Say hi to your team! Realtime chat is active for this board.</div>
      </div>
    `;
  }

  /**
   * Render list of messages
   */
  function renderAllMessages(messages) {
    if (!teamChatMessages) return;

    if (!messages || messages.length === 0) {
      renderEmptyState();
      return;
    }

    teamChatMessages.innerHTML = '';
    messages.forEach(msg => {
      const prof = profileCache.get(msg.user_id) || (msg.user_id === currentUser?.id ? currentProfile : null);
      appendMessageNode(msg, prof);
    });
  }

  /**
   * Fetch a single user profile with caching
   */
  async function fetchProfile(userId) {
    if (!userId || !window.supabaseClient) return null;
    if (profileCache.has(userId)) return profileCache.get(userId);

    try {
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        profileCache.set(userId, data);
        return data;
      }
    } catch (e) {
      console.warn('Failed to fetch profile for user:', userId, e);
    }
    return null;
  }

  /**
   * Load existing messages from public.messages
   * Ordered by created_at ascending, joined with public.profiles via user_id
   */
  async function loadExistingMessages() {
    if (!window.supabaseClient || !hackathonId) return;

    if (teamChatMessages) {
      teamChatMessages.innerHTML = `
        <div class="chat-loading-spinner">
          <span class="spinner-small" style="width: 14px; height: 14px; border: 2px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span>
          <span>Loading messages...</span>
        </div>
      `;
    }

    try {
      let messages = null;

      // 1. Attempt join query on public.profiles via user_id
      try {
        const { data, error } = await window.supabaseClient
          .from('messages')
          .select(`
            id,
            hackathon_id,
            user_id,
            content,
            created_at,
            profiles (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq('hackathon_id', hackathonId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          messages = data;
          // Pre-populate profile cache from join results
          messages.forEach(m => {
            if (m.profiles && m.user_id) {
              profileCache.set(m.user_id, m.profiles);
            }
          });
        }
      } catch (joinErr) {
        console.warn('Direct join on profiles threw error, attempting fallback:', joinErr);
      }

      // 2. Fallback query if direct PostgREST join failed or relation alias differed
      if (!messages) {
        const { data, error } = await window.supabaseClient
          .from('messages')
          .select('id, hackathon_id, user_id, content, created_at')
          .eq('hackathon_id', hackathonId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        messages = data || [];

        // Collect unique missing user IDs
        const missingUserIds = [...new Set(messages.map(m => m.user_id).filter(id => id && !profileCache.has(id)))];
        if (missingUserIds.length > 0) {
          const { data: profs } = await window.supabaseClient
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', missingUserIds);

          if (profs) {
            profs.forEach(p => profileCache.set(p.id, p));
          }
        }
      }

      renderAllMessages(messages);
      scrollToBottom(false);

    } catch (err) {
      console.error('Error loading team chat messages:', err);
      renderErrorState(err.message || 'Failed to load conversation history.');
    }
  }

  /**
   * Subscribe to INSERT events on public.messages for this hackathon
   */
  function setupChatRealtime() {
    if (!window.supabaseClient || !hackathonId) return;

    teardownChatRealtime();

    const channelName = `hackdeck-messages-${hackathonId}`;
    chatChannel = window.supabaseClient.channel(channelName);

    chatChannel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `hackathon_id=eq.${hackathonId}`
      }, async (payload) => {
        const newMsg = payload.new;
        if (!newMsg) return;

        // Skip if message row already exists in DOM
        if (document.getElementById(`chat-msg-${newMsg.id}`)) {
          return;
        }

        // Fetch or resolve sender profile
        let sender = profileCache.get(newMsg.user_id);
        if (!sender && newMsg.user_id) {
          if (currentUser && newMsg.user_id === currentUser.id) {
            sender = currentProfile;
          } else {
            sender = await fetchProfile(newMsg.user_id);
          }
        }

        // Remove empty state if currently displayed
        removeEmptyStateIfPresent();

        // Append to DOM
        appendMessageNode(newMsg, sender);

        // Auto-scroll feed to bottom
        scrollToBottom(true);

        // Unread badge indicator if chat popup is collapsed and message is from a teammate
        const isClosed = !teamChatPopup || teamChatPopup.classList.contains('hidden');
        if (isClosed && (!currentUser || newMsg.user_id !== currentUser.id)) {
          showUnreadDot();
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // Realtime connected
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime chat channel error:', err);
        }
      });
  }

  /**
   * Clean up realtime subscription
   */
  function teardownChatRealtime() {
    if (chatChannel && window.supabaseClient) {
      try {
        window.supabaseClient.removeChannel(chatChannel);
      } catch (e) {
        console.warn('Error removing chat channel:', e);
      }
      chatChannel = null;
    }
  }

  /**
   * Send message handler (inserts into public.messages)
   */
  async function handleSendMessage(e) {
    if (e) e.preventDefault();

    if (!isMember || isSpectator) {
      if (window.HackdeckToast) {
        window.HackdeckToast.show('Only active team members can participate in team chat.', 'warning');
      }
      return;
    }

    if (!currentUser || !hackathonId || !window.supabaseClient) {
      return;
    }

    if (!chatMessageInput) return;

    const rawContent = chatMessageInput.value;
    const content = rawContent.trim();
    if (!content) return;

    if (isSending) return;
    isSending = true;

    if (btnSendChatMessage) {
      btnSendChatMessage.disabled = true;
    }

    try {
      const { data, error } = await window.supabaseClient
        .from('messages')
        .insert([{
          hackathon_id: hackathonId,
          user_id: currentUser.id,
          content: content
        }])
        .select()
        .single();

      if (error) throw error;

      // Reset input immediately
      chatMessageInput.value = '';
      chatMessageInput.focus();

      // If the row hasn't been appended by realtime yet, append it now
      if (data && !document.getElementById(`chat-msg-${data.id}`)) {
        removeEmptyStateIfPresent();
        appendMessageNode(data, currentProfile);
        scrollToBottom(true);
      }

    } catch (err) {
      console.error('Error inserting message:', err);
      if (window.HackdeckToast) {
        window.HackdeckToast.show('Failed to send message: ' + (err.message || 'Network error'), 'error');
      } else {
        alert('Failed to send message. Please try again.');
      }
    } finally {
      isSending = false;
      if (btnSendChatMessage) {
        btnSendChatMessage.disabled = false;
      }
    }
  }

  /**
   * Synchronize visibility based on membership & spectator mode
   * Requirement:
   * Show in both Phase 1 (Brainstorm) and Phase 2 (Build) whenever isMember is true,
   * and keep it completely hidden in Public Spectator Mode (!isMember).
   */
  function updateChatVisibility() {
    if (!teamChatPanel) return;

    if (isMember && !isSpectator) {
      teamChatPanel.classList.remove('hidden');
    } else {
      teamChatPanel.classList.add('hidden');
      if (teamChatPopup) {
        teamChatPopup.classList.add('hidden');
      }
      hideUnreadDot();
      teardownChatRealtime();
    }
  }

  /**
   * Bind event listeners
   */
  function bindChatEvents() {
    // Submit on Form
    if (teamChatForm) {
      teamChatForm.addEventListener('submit', handleSendMessage);
    }

    // Submit on Enter key inside chat input (without Shift)
    if (chatMessageInput) {
      chatMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      });

      // Clear unread indicator when typing or focusing
      chatMessageInput.addEventListener('focus', () => {
        hideUnreadDot();
      });
    }

    // Toggle button behavior: open/close popup
    if (btnToggleChat) {
      btnToggleChat.addEventListener('click', () => {
        // Allow board.js toggle to execute or ensure synchronization
        setTimeout(() => {
          if (teamChatPopup && !teamChatPopup.classList.contains('hidden')) {
            hideUnreadDot();
            scrollToBottom(false);
            if (chatMessageInput) {
              chatMessageInput.focus();
            }
          }
        }, 20);
      });
    }

    // Close button
    if (btnCloseChat) {
      btnCloseChat.addEventListener('click', () => {
        if (teamChatPopup) {
          teamChatPopup.classList.add('hidden');
        }
      });
    }
  }

  /**
   * Initialize chat module with board context
   */
  function setupFromBoardContext(context) {
    if (!context || !context.hackathon) return;

    currentHackathon = context.hackathon;
    hackathonId = currentHackathon.id;
    currentUser = context.user;
    currentProfile = context.profile;
    isLeader = !!context.isLeader;
    isMember = !!context.isMember;
    isSpectator = !!context.isSpectator;

    // Cache current user profile
    if (currentUser && currentProfile) {
      profileCache.set(currentUser.id, currentProfile);
    }

    // Update visibility (hidden if spectator, visible if member)
    updateChatVisibility();

    // If member, load messages and subscribe to Realtime
    if (isMember && !isSpectator) {
      loadExistingMessages();
      setupChatRealtime();
    }
  }

  /**
   * Listen for board readiness and updates
   */
  function init() {
    bindChatEvents();

    // Listen to custom event fired by board.js
    window.addEventListener('hackdeck:board-ready', (e) => {
      setupFromBoardContext(e.detail);
    });

    window.addEventListener('hackdeck:board-updated', (e) => {
      if (e.detail?.hackathon) {
        currentHackathon = e.detail.hackathon;
        // Phase changes do not disrupt the chat feed; chat stays docked across phases.
      }
    });

    // Or check if board context is already exposed on window
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

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    teardownChatRealtime();
  });

})();
