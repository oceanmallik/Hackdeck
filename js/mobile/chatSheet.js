// js/mobile/chatSheet.js - Mobile Team Room Chat Bottom Sheet (~92dvh)
import { haptic } from './haptics.js';
import { showToast } from './toast.js';
import { openBottomSheet } from './bottomSheet.js';

let activeChatSheet = null;
let hasUnreadMessages = false;
let originalChatParent = null;
let originalChatNextSibling = null;

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
                } else {
                  desktopFeed.scrollTo({ top: desktopFeed.scrollHeight, behavior: 'smooth' });
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
 * Mounts the real #teamChatMessages and #teamChatForm directly into the sheet
 */
function openTeamChatSheet(hackathonId) {
  const messagesEl = document.getElementById('teamChatMessages');
  const formEl = document.getElementById('teamChatForm');

  if (!messagesEl || !formEl) {
    showToast('Chat is initializing...', 'info');
    return;
  }

  // Preserve desktop parent reference so we can cleanly restore on close
  if (!originalChatParent) {
    originalChatParent = messagesEl.parentNode;
    originalChatNextSibling = formEl.nextSibling;
  }

  const container = document.createElement('div');
  container.className = 'chat-sheet-container';

  // Mount real living messages and form elements into bottom sheet
  container.appendChild(messagesEl);
  container.appendChild(formEl);

  let cleanupViewport = null;

  activeChatSheet = openBottomSheet({
    title: '💬 Team Room',
    subtitle: 'Live Teammate Chat',
    contentHtml: container,
    className: 'team-chat-sheet-modal',
    onMount: (controller) => {
      // Ensure the sheet body has 0 padding and overflow hidden so only #teamChatMessages scrolls
      if (controller.body) {
        controller.body.style.setProperty('padding', '0', 'important');
        controller.body.style.setProperty('margin', '0', 'important');
        controller.body.style.setProperty('overflow', 'hidden', 'important');
        controller.body.style.setProperty('display', 'flex', 'important');
        controller.body.style.setProperty('flex-direction', 'column', 'important');
        controller.body.style.setProperty('flex', '1 1 auto', 'important');
        controller.body.style.setProperty('min-height', '0', 'important');
        controller.body.style.setProperty('height', '100%', 'important');
      }
      if (controller.sheet) {
        controller.sheet.style.setProperty('height', '92dvh', 'important');
        controller.sheet.style.setProperty('max-height', '92dvh', 'important');
        controller.sheet.style.setProperty('display', 'flex', 'important');
        controller.sheet.style.setProperty('flex-direction', 'column', 'important');
        controller.sheet.style.setProperty('overflow', 'hidden', 'important');
      }
      messagesEl.style.setProperty('touch-action', 'pan-y', 'important');
      messagesEl.style.setProperty('overflow-y', 'scroll', 'important');
      messagesEl.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
      messagesEl.style.setProperty('overscroll-behavior-y', 'contain', 'important');
    },
    onClose: () => {
      if (typeof cleanupViewport === 'function') {
        cleanupViewport();
        cleanupViewport = null;
      }
      // Put messages and form back into original desktop container
      if (originalChatParent) {
        if (originalChatNextSibling && originalChatNextSibling.parentNode === originalChatParent) {
          originalChatParent.insertBefore(messagesEl, originalChatNextSibling);
          originalChatParent.insertBefore(formEl, originalChatNextSibling);
        } else {
          originalChatParent.appendChild(messagesEl);
          originalChatParent.appendChild(formEl);
        }
      }
      activeChatSheet = null;
    }
  });

  // Scroll to latest message immediately
  setTimeout(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 100);

  // If messages are empty or loading, trigger loadExistingMessages if available
  if ((messagesEl.children.length === 0 || messagesEl.querySelector('.chat-loading-spinner')) &&
      window.HackdeckChat && typeof window.HackdeckChat.loadExistingMessages === 'function') {
    window.HackdeckChat.loadExistingMessages();
  }

  // Keep input above mobile keyboard
  cleanupViewport = setupVisualViewportAdjustment(activeChatSheet.sheet);
}

/**
 * Keep input above keyboard using window.visualViewport
 */
function setupVisualViewportAdjustment(sheetEl) {
  if (typeof window.visualViewport === 'undefined') return () => {};

  function onViewportResize() {
    const vp = window.visualViewport;
    const offset = window.innerHeight - vp.height;
    if (offset > 50) {
      sheetEl.style.paddingBottom = `${offset}px`;
    } else {
      sheetEl.style.paddingBottom = '';
    }
  }

  window.visualViewport.addEventListener('resize', onViewportResize);

  return () => {
    window.visualViewport.removeEventListener('resize', onViewportResize);
  };
}
