// js/mobile/chatSheet.js - Mobile Team Room Chat Bottom Sheet (~92dvh)
import { haptic } from './haptics.js';
import { showToast } from './toast.js';
import { openBottomSheet } from './bottomSheet.js';
import { checkOnlineAction } from './offlineBanner.js';

let activeChatSheet = null;
let hasUnreadMessages = false;
let messageFeedEl = null;
let newMsgPillEl = null;

export function initChatSheet({ hackathonId, user, profile, isMember, isSpectator }) {
  if (isSpectator || !isMember) {
    const pill = document.getElementById('mobileTeamChatPill');
    if (pill) pill.style.display = 'none';
    return;
  }

  // Setup bottom-left floating "Team" pill
  setupChatPill(hackathonId);

  // Listen to realtime / DOM mutations from chat.js to update unread dot
  listenForTeammateMessages(hackathonId, user);
}

function setupChatPill(hackathonId) {
  let pill = document.getElementById('mobileTeamChatPill');
  if (!pill) {
    pill = document.createElement('button');
    pill.id = 'mobileTeamChatPill';
    pill.className = 'mobile-chat-pill';
    pill.type = 'button';
    pill.setAttribute('aria-label', 'Open Team Chat');
    pill.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span>Team</span>
      <span id="mobileChatUnreadDot" class="unread-dot" style="display: none;"></span>
    `;
    document.body.appendChild(pill);
  }

  pill.onclick = () => {
    haptic(10);
    clearUnreadDot();
    openTeamChatSheet(hackathonId);
  };
}

function showUnreadDot() {
  hasUnreadMessages = true;
  const dot = document.getElementById('mobileChatUnreadDot');
  if (dot) dot.style.display = 'inline-block';
}

function clearUnreadDot() {
  hasUnreadMessages = false;
  const dot = document.getElementById('mobileChatUnreadDot');
  if (dot) dot.style.display = 'none';
}

function listenForTeammateMessages(hackathonId, user) {
  // Check desktop chat messages container for new messages
  const desktopFeed = document.getElementById('teamChatMessages');
  if (desktopFeed) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.classList.contains('chat-msg-row')) {
              const senderId = node.dataset?.userId;
              if (senderId && senderId !== user?.id) {
                if (!activeChatSheet) {
                  showUnreadDot();
                } else if (messageFeedEl) {
                  // If sheet is open and not near bottom, show "New messages ↓" pill
                  if (!isScrolledNearBottom(messageFeedEl)) {
                    showNewMessagesPill();
                  } else {
                    scrollToBottom(messageFeedEl, true);
                  }
                }
              }
            }
          });
        }
      }
    });
    observer.observe(desktopFeed, { childList: true });
  }
}

/**
 * Open Team Room Bottom Sheet (~92dvh)
 */
function openTeamChatSheet(hackathonId) {
  const container = document.createElement('div');
  container.className = 'chat-sheet-container';

  // Feed container
  messageFeedEl = document.createElement('div');
  messageFeedEl.className = 'chat-sheet-feed';

  // Render current chat history
  renderChatMessages(messageFeedEl);

  // New messages pill
  newMsgPillEl = document.createElement('div');
  newMsgPillEl.className = 'chat-new-msg-pill';
  newMsgPillEl.style.display = 'none';
  newMsgPillEl.textContent = 'New messages ↓';
  newMsgPillEl.onclick = () => {
    haptic(10);
    scrollToBottom(messageFeedEl, true);
    newMsgPillEl.style.display = 'none';
  };

  // Input Row
  const inputRow = document.createElement('div');
  inputRow.className = 'chat-sheet-input-row';

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-sheet-textarea';
  textarea.placeholder = 'Type message...';
  textarea.rows = 1;
  textarea.setAttribute('autocapitalize', 'sentences');

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'chat-sheet-send-btn';
  sendBtn.disabled = true;
  sendBtn.setAttribute('aria-label', 'Send message');
  sendBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="22" y1="2" x2="11" y2="13"></line>
      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    </svg>
  `;

  // Auto-grow textarea up to 4 lines
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    sendBtn.disabled = !textarea.value.trim();
  });

  // Enter to send on desktop browsers, Enter = newline on touch devices
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (!isTouchDevice && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    }
  });

  sendBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    if (!checkOnlineAction('send messages')) return;

    haptic(10);
    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;

    // Optimistic Bubble
    const optimisticRow = renderOptimisticBubble(content, messageFeedEl);
    scrollToBottom(messageFeedEl, true);

    try {
      if (window.HackdeckChat && typeof window.HackdeckChat.sendMessage === 'function') {
        await window.HackdeckChat.sendMessage(content);
      } else if (window.supabaseClient) {
        const user = window.currentUser || (window.HackdeckBoard && window.HackdeckBoard.getUser());
        const { error } = await window.supabaseClient.from('messages').insert([{
          hackathon_id: hackathonId,
          user_id: user.id,
          content
        }]);
        if (error) throw error;
      }
      optimisticRow.querySelector('.sending-indicator')?.remove();
    } catch (err) {
      const ind = optimisticRow.querySelector('.sending-indicator');
      if (ind) {
        ind.textContent = 'Failed. Tap to retry';
        ind.style.color = 'var(--danger)';
        ind.style.cursor = 'pointer';
        ind.onclick = () => {
          textarea.value = content;
          textarea.focus();
        };
      }
    }
  });

  inputRow.appendChild(textarea);
  inputRow.appendChild(sendBtn);

  container.appendChild(messageFeedEl);
  container.appendChild(newMsgPillEl);
  container.appendChild(inputRow);

  activeChatSheet = openBottomSheet({
    title: '💬 Team Room',
    subtitle: 'Live Teammate Chat',
    contentHtml: container,
    className: 'team-chat-sheet-modal',
    onClose: () => {
      activeChatSheet = null;
      messageFeedEl = null;
    }
  });

  // Scroll to bottom immediately
  setTimeout(() => {
    scrollToBottom(messageFeedEl, false);
  }, 50);

  // Handle keyboard visualViewport adjustments
  setupVisualViewportAdjustment(activeChatSheet.sheet);
}

function isScrolledNearBottom(el) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function showNewMessagesPill() {
  if (newMsgPillEl) newMsgPillEl.style.display = 'block';
}

function scrollToBottom(el, smooth = false) {
  if (!el) return;
  requestAnimationFrame(() => {
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  });
}

function renderChatMessages(feedEl) {
  const desktopMessages = document.querySelectorAll('#teamChatMessages .chat-msg-row');

  if (!desktopMessages || desktopMessages.length === 0) {
    feedEl.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
        <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Team Room</div>
        <div style="font-size: 13px;">Say hi to your team! Realtime chat is active for this board.</div>
      </div>
    `;
    return;
  }

  feedEl.innerHTML = '';
  let lastSenderId = null;
  let currentGroup = null;

  desktopMessages.forEach((row) => {
    const isMe = row.classList.contains('chat-msg-row-me');
    const senderId = row.dataset.userId || (isMe ? 'me' : 'peer');
    const content = row.querySelector('.chat-bubble')?.textContent || '';
    const time = row.querySelector('.chat-timestamp')?.textContent || '';
    const handle = row.querySelector('.chat-sender-username')?.textContent || '';

    // Sender grouping
    if (senderId !== lastSenderId) {
      lastSenderId = senderId;
      currentGroup = document.createElement('div');
      currentGroup.className = `chat-bubble-group ${isMe ? 'msg-group-me' : 'msg-group-peer'}`;
      currentGroup.style.display = 'flex';
      currentGroup.style.flexDirection = 'column';
      currentGroup.style.alignItems = isMe ? 'flex-end' : 'flex-start';
      currentGroup.style.gap = '4px';

      if (!isMe && handle) {
        const authorLabel = document.createElement('span');
        authorLabel.style.fontSize = '11px';
        authorLabel.style.color = 'var(--text-muted)';
        authorLabel.style.marginBottom = '2px';
        authorLabel.textContent = handle;
        currentGroup.appendChild(authorLabel);
      }

      feedEl.appendChild(currentGroup);
    }

    const bubble = document.createElement('div');
    bubble.style.maxWidth = '82%';
    bubble.style.padding = '10px 14px';
    bubble.style.borderRadius = isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px';
    bubble.style.background = isMe ? 'var(--text-primary)' : 'var(--bg-card)';
    bubble.style.color = isMe ? '#171717' : 'var(--text-primary)';
    bubble.style.border = isMe ? 'none' : '1px solid var(--border)';
    bubble.style.fontSize = '14px';
    bubble.style.lineHeight = '1.4';
    bubble.style.wordBreak = 'break-word';
    bubble.textContent = content;

    if (currentGroup) currentGroup.appendChild(bubble);
  });
}

function renderOptimisticBubble(content, feedEl) {
  const group = document.createElement('div');
  group.className = 'chat-bubble-group msg-group-me';
  group.style.display = 'flex';
  group.style.flexDirection = 'column';
  group.style.alignItems = 'flex-end';
  group.style.gap = '4px';

  const bubble = document.createElement('div');
  bubble.style.maxWidth = '82%';
  bubble.style.padding = '10px 14px';
  bubble.style.borderRadius = '16px 16px 4px 16px';
  bubble.style.background = 'var(--text-primary)';
  bubble.style.color = '#171717';
  bubble.style.fontSize = '14px';
  bubble.style.lineHeight = '1.4';
  bubble.style.wordBreak = 'break-word';
  bubble.textContent = content;

  const sendingInd = document.createElement('span');
  sendingInd.className = 'sending-indicator';
  sendingInd.style.fontSize = '10px';
  sendingInd.style.color = 'var(--text-muted)';
  sendingInd.textContent = 'Sending...';

  group.appendChild(bubble);
  group.appendChild(sendingInd);
  feedEl.appendChild(group);

  return group;
}

/**
 * Keep input above keyboard using window.visualViewport
 */
function setupVisualViewportAdjustment(sheetEl) {
  if (typeof window.visualViewport === 'undefined') return;

  function onViewportResize() {
    const vp = window.visualViewport;
    const offset = window.innerHeight - vp.height;
    if (offset > 50) {
      // Keyboard is open
      sheetEl.style.paddingBottom = `${offset}px`;
    } else {
      sheetEl.style.paddingBottom = '';
    }
  }

  window.visualViewport.addEventListener('resize', onViewportResize);
  window.visualViewport.addEventListener('scroll', onViewportResize);
}
