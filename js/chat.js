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
   * Show toast / notification
   */
  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    } else if (window.HackdeckToast && typeof window.HackdeckToast.show === 'function') {
      window.HackdeckToast.show(message, type);
    }
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
   * Inline message editing
   */
  function startEditingMessage(msg, row, wrapper, bubble, bubbleRow) {
    if (!wrapper || !bubbleRow) return;

    // Close any other active inline edit boxes in the chat
    if (teamChatMessages) {
      const activeEditBoxes = teamChatMessages.querySelectorAll('.chat-edit-box');
      activeEditBoxes.forEach(box => {
        const parentRow = box.closest('.chat-msg-row');
        if (parentRow) {
          const bRow = parentRow.querySelector('.chat-bubble-row');
          if (bRow) bRow.classList.remove('hidden');
          const pWrap = parentRow.querySelector('.chat-msg-wrapper');
          if (pWrap) pWrap.classList.remove('is-editing');
        }
        box.remove();
      });
    }

    bubbleRow.classList.add('hidden');
    wrapper.classList.add('is-editing');

    const editBox = document.createElement('div');
    editBox.className = 'chat-edit-box';

    const textarea = document.createElement('textarea');
    textarea.className = 'chat-edit-textarea';
    textarea.rows = 2;
    textarea.maxLength = 1000;
    textarea.value = msg.content;

    const footer = document.createElement('div');
    footer.className = 'chat-edit-footer';

    const hint = document.createElement('span');
    hint.className = 'chat-edit-hint';
    hint.textContent = 'Enter to save • Esc to cancel';

    const btnGroup = document.createElement('div');
    btnGroup.className = 'chat-edit-buttons';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn btn-secondary btn-xs btn-chat-cancel-edit';
    btnCancel.textContent = 'Cancel';

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'btn btn-primary btn-xs btn-chat-save-edit';
    btnSave.textContent = 'Save';

    btnGroup.appendChild(btnCancel);
    btnGroup.appendChild(btnSave);

    footer.appendChild(hint);
    footer.appendChild(btnGroup);

    editBox.appendChild(textarea);
    editBox.appendChild(footer);

    wrapper.appendChild(editBox);

    function cancelEdit() {
      editBox.remove();
      wrapper.classList.remove('is-editing');
      bubbleRow.classList.remove('hidden');
    }

    async function saveEdit() {
      const newContent = textarea.value.trim();
      if (!newContent) {
        notify('Message cannot be empty. Delete it instead if you want to remove it.', 'warning');
        return;
      }

      if (newContent === msg.content) {
        cancelEdit();
        return;
      }

      btnSave.disabled = true;
      btnCancel.disabled = true;
      btnSave.textContent = 'Saving...';

      try {
        const { error } = await window.supabaseClient
          .from('messages')
          .update({ content: newContent })
          .eq('id', msg.id);

        if (error) throw error;

        msg.content = newContent;
        bubble.textContent = newContent;

        cancelEdit();
        notify('Message updated.', 'info');
      } catch (err) {
        console.error('Error updating message:', err);
        btnSave.disabled = false;
        btnCancel.disabled = false;
        btnSave.textContent = 'Save';
        notify('Failed to update message: ' + (err.message || 'Network error'), 'error');
      }
    }

    btnCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelEdit();
    });

    btnSave.addEventListener('click', (e) => {
      e.stopPropagation();
      saveEdit();
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      }
    });

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  /**
   * Delete message
   */
  async function deleteMessage(msgId, rowEl) {
    if (!window.supabaseClient || !hackathonId) return;

    const confirmed = window.confirm('Are you sure you want to delete this message?');
    if (!confirmed) return;

    try {
      const { error } = await window.supabaseClient
        .from('messages')
        .delete()
        .eq('id', msgId);

      if (error) throw error;

      if (rowEl) {
        rowEl.remove();
        if (teamChatMessages && !teamChatMessages.querySelector('.chat-msg-row')) {
          renderEmptyState();
        }
      }

      notify('Message deleted.', 'info');
    } catch (err) {
      console.error('Error deleting message:', err);
      notify('Failed to delete message: ' + (err.message || 'Network error'), 'error');
    }
  }

  /**
   * Build message DOM element
   */
  function createMessageElement(msg, profile) {
    const isMe = currentUser && msg.user_id === currentUser.id;
    const canEdit = isMe && !isSpectator && isMember;
    const canDelete = (isMe || isLeader) && !isSpectator && isMember;
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
    row.dataset.msgId = msg.id;
    row.dataset.userId = msg.user_id;

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

    // Bubble + actions row
    const bubbleRow = document.createElement('div');
    bubbleRow.className = `chat-bubble-row ${isMe ? 'chat-bubble-row-me' : 'chat-bubble-row-peer'}`;

    // Message bubble
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMe ? 'chat-bubble-me' : 'chat-bubble-peer'}`;
    bubble.textContent = msg.content; // textContent handles escaping automatically

    // Action buttons (Edit & Delete)
    if (canEdit || canDelete) {
      const actions = document.createElement('div');
      actions.className = 'chat-msg-actions';

      if (canEdit) {
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn-chat-action btn-chat-edit';
        btnEdit.title = 'Edit message';
        btnEdit.setAttribute('aria-label', 'Edit message');
        btnEdit.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        `;
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          startEditingMessage(msg, row, wrapper, bubble, bubbleRow);
        });
        actions.appendChild(btnEdit);
      }

      if (canDelete) {
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'btn-chat-action btn-chat-delete';
        btnDelete.title = 'Delete message';
        btnDelete.setAttribute('aria-label', 'Delete message');
        btnDelete.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        `;
        btnDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteMessage(msg.id, row);
        });
        actions.appendChild(btnDelete);
      }

      if (isMe) {
        bubbleRow.appendChild(actions);
        bubbleRow.appendChild(bubble);
      } else {
        bubbleRow.appendChild(bubble);
        bubbleRow.appendChild(actions);
      }
    } else {
      bubbleRow.appendChild(bubble);
    }

    wrapper.appendChild(bubbleRow);
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
          <span class="spinner-small" style="width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--text-primary); border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span>
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
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `hackathon_id=eq.${hackathonId}`
      }, (payload) => {
        const updated = payload.new;
        if (!updated) return;
        const row = document.getElementById(`chat-msg-${updated.id}`);
        if (!row) return;

        // Update bubble text if not currently actively editing in this client
        const editBox = row.querySelector('.chat-edit-box');
        if (!editBox) {
          const bubble = row.querySelector('.chat-bubble');
          if (bubble) {
            bubble.textContent = updated.content;
          }
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const deletedId = payload.old?.id;
        if (!deletedId) return;
        const row = document.getElementById(`chat-msg-${deletedId}`);
        if (row) {
          row.remove();
          if (teamChatMessages && !teamChatMessages.querySelector('.chat-msg-row')) {
            renderEmptyState();
          }
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
      notify('Only active team members can participate in team chat.', 'warning');
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
      notify('Failed to send message: ' + (err.message || 'Network error'), 'error');
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

    // Expose Chat context for mobile layer
    window.HackdeckChat = {
      sendMessage: async (content) => {
        if (!chatMessageInput) return;
        chatMessageInput.value = content;
        await handleSendMessage();
      },
      loadExistingMessages,
      getProfileCache: () => profileCache
    };
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
