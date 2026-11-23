// js/mobile/boardMobile.js - Mobile Workspace Engine for Hackdeck Board
import { haptic } from './haptics.js';
import { showToast } from './toast.js';
import { openBottomSheet, enhanceExistingModal } from './bottomSheet.js';
import { initOfflineBanner } from './offlineBanner.js';
import { setupPullToRefresh } from './pullToRefresh.js';
import { initStatusStrip } from './statusStrip.js';
import { initKanbanMobile } from './kanbanMobile.js';
import { initChatSheet } from './chatSheet.js';

let boardContext = null;
let tabScrollPositions = { tasks: 0, showcase: 0 };

export function initBoardMobile() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;

  // 1. Initialize offline banner
  initOfflineBanner();

  // 2. Setup Top Bar Back button navigation
  setupTopBarNavigation();

  // 3. Enhance existing desktop modals as bottom sheets
  setupExistingModals();

  // 4. Listen to board ready event from board.js
  window.addEventListener('hackdeck:board-ready', (e) => {
    boardContext = e.detail;
    setupBoardUI(e.detail);
  });

  window.addEventListener('hackdeck:board-updated', (e) => {
    if (boardContext && e.detail?.hackathon) {
      boardContext.hackathon = e.detail.hackathon;
      updateBoardHeaderTitle(e.detail.hackathon.title);
      enhanceMissionCard(e.detail.hackathon);
      enhanceShowcaseMobile(e.detail.hackathon);
    }
  });

  // Check if HackdeckBoard is already exposed
  if (window.HackdeckBoard && window.HackdeckBoard.getHackathon()) {
    const ctx = {
      hackathon: window.HackdeckBoard.getHackathon(),
      user: window.HackdeckBoard.getUser(),
      profile: window.HackdeckBoard.getProfile(),
      isLeader: window.HackdeckBoard.isLeader(),
      isMember: window.HackdeckBoard.isMember(),
      isSpectator: window.HackdeckBoard.isSpectator()
    };
    boardContext = ctx;
    setupBoardUI(ctx);
  }

  // 5. Setup pull to refresh
  setupPullToRefresh(document.body, async () => {
    if (window.HackdeckBoard && typeof window.HackdeckBoard.refreshMembership === 'function') {
      await window.HackdeckBoard.refreshMembership();
      showToast('Workspace refreshed', 'success');
    }
  });
}

/**
 * Top bar back navigation: Closes sheet first if open, or navigates back to index.html
 */
function setupTopBarNavigation() {
  const backLink = document.querySelector('.board-back-link');
  if (!backLink) return;

  backLink.addEventListener('click', (e) => {
    // If a modal or sheet is open, close it first
    const openSheet = document.querySelector('.mobile-bottom-sheet-overlay.open');
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openSheet || openModal) {
      e.preventDefault();
      history.back();
      return;
    }
    // Otherwise normal navigation to index.html occurs
  });
}

function updateBoardHeaderTitle(title) {
  const titleEl = document.getElementById('boardTitle');
  if (titleEl && title) {
    titleEl.textContent = title;
  }
}

/**
 * Setup mobile workspace layout once board context is ready
 */
function setupBoardUI(ctx) {
  const { hackathon, isLeader, isMember, isSpectator, user, profile } = ctx;
  if (!hackathon) return;

  updateBoardHeaderTitle(hackathon.title);

  // 1. Initialize Sticky Status Strip Row 2 & Overflow Menu
  initStatusStrip({
    hackathon,
    isLeader,
    isMember,
    onBoardUpdate: (updated) => {
      ctx.hackathon = updated;
      enhanceMissionCard(updated);
      enhanceShowcaseMobile(updated);
    }
  });

  // 2. Enhance Project Mission Card (3-line clamp, Show More, 44px buttons)
  enhanceMissionCard(hackathon);

  // 3. Enhance Kanban Board (Horizontal scroll-snap, chip strip, card move buttons, instant undo delete)
  const kanbanEl = document.getElementById('kanbanBoard');
  if (kanbanEl) {
    initKanbanMobile({ kanbanEl });
  }

  // 4. Enhance Project Showcase Tab (Stacked cards, 16:9 video embeds, link rows, markdown docs)
  enhanceShowcaseMobile(hackathon);

  // 5. Setup Sticky Segmented Control [Task Board | Project Showcase]
  // Runs after mission card, kanban board, and showcase box exist so switchTab initializes cleanly
  setupSegmentedControl(hackathon.id);

  // 6. Setup Floating Team Chat Pill & Bottom Sheet (~92dvh)
  initChatSheet({
    hackathonId: hackathon.id,
    user,
    profile,
    isMember,
    isSpectator
  });
}

/**
 * Sticky Segmented Control: [Task Board | Project Showcase]
 */
function setupSegmentedControl(boardId) {
  let control = document.getElementById('mobileSegmentedControl');
  if (!control) {
    control = document.createElement('div');
    control.id = 'mobileSegmentedControl';
    control.className = 'mobile-segmented-control';
    control.setAttribute('role', 'tablist');

    control.innerHTML = `
      <button type="button" class="mobile-segment-tab active" data-tab="tasks" role="tab" aria-selected="true">
        <span>Task Board</span>
      </button>
      <button type="button" class="mobile-segment-tab" data-tab="showcase" role="tab" aria-selected="false">
        <span>Project Showcase</span>
      </button>
    `;

    const statusStrip = document.getElementById('mobileStatusStrip');
    if (statusStrip && statusStrip.parentNode) {
      statusStrip.parentNode.insertBefore(control, statusStrip.nextSibling);
    }
  }

  const tabs = control.querySelectorAll('.mobile-segment-tab');
  const kanbanBoardEl = document.getElementById('kanbanBoard');
  const kanbanStripEl = document.getElementById('kanbanMobileStrip');
  const showcaseBoxEl = document.getElementById('projectShowcaseBox');
  const fabAddTask = document.getElementById('mobileFabAddTask');

  // Restore saved active tab for this board
  const savedTabKey = `hackdeck_board_active_tab_${boardId}`;
  const savedTab = sessionStorage.getItem(savedTabKey) || 'tasks';

  function switchTab(targetTab) {
    haptic(10);
    // Save scroll position of outgoing tab
    const currentActive = control.querySelector('.mobile-segment-tab.active')?.getAttribute('data-tab') || 'tasks';
    tabScrollPositions[currentActive] = window.scrollY;

    tabs.forEach(t => {
      const isTarget = t.getAttribute('data-tab') === targetTab;
      t.classList.toggle('active', isTarget);
      t.setAttribute('aria-selected', String(isTarget));
    });

    sessionStorage.setItem(savedTabKey, targetTab);

    // Toggle body classes for strict CSS view separation on mobile
    document.body.classList.toggle('mobile-view-showcase', targetTab === 'showcase');
    document.body.classList.toggle('mobile-view-tasks', targetTab === 'tasks');

    const kanbanBoardEl = document.getElementById('kanbanBoard');
    const kanbanStripEl = document.getElementById('kanbanMobileStrip');
    const showcaseBoxEl = document.getElementById('projectShowcaseBox');
    const missionBarEl = document.getElementById('lockedProjectDetailsBar');
    const fabAddTask = document.getElementById('mobileFabAddTask');

    if (targetTab === 'tasks') {
      if (missionBarEl) missionBarEl.style.removeProperty('display');
      if (kanbanBoardEl) kanbanBoardEl.style.removeProperty('display');
      if (kanbanStripEl) kanbanStripEl.style.removeProperty('display');
      if (showcaseBoxEl) {
        showcaseBoxEl.classList.add('hidden');
        showcaseBoxEl.style.setProperty('display', 'none', 'important');
      }
      if (fabAddTask) fabAddTask.style.setProperty('display', 'flex', 'important');

      // Sync desktop switcher tabs if present
      document.getElementById('tabViewTasks')?.classList.add('active');
      document.getElementById('tabViewShowcase')?.classList.remove('active');
    } else {
      if (missionBarEl) missionBarEl.style.setProperty('display', 'none', 'important');
      if (kanbanBoardEl) kanbanBoardEl.style.setProperty('display', 'none', 'important');
      if (kanbanStripEl) kanbanStripEl.style.setProperty('display', 'none', 'important');
      if (showcaseBoxEl) {
        showcaseBoxEl.classList.remove('hidden');
        showcaseBoxEl.style.setProperty('display', 'block', 'important');
      }
      if (fabAddTask) fabAddTask.style.setProperty('display', 'none', 'important');

      // Sync desktop switcher tabs if present
      document.getElementById('tabViewShowcase')?.classList.add('active');
      document.getElementById('tabViewTasks')?.classList.remove('active');
    }

    // Restore scroll position of incoming tab
    requestAnimationFrame(() => {
      window.scrollTo({ top: tabScrollPositions[targetTab] || 0, behavior: 'auto' });
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchTab(target);
    });
  });

  // Initialize initial tab
  switchTab(savedTab);
}

/**
 * Enhance Project Mission Card:
 * - Description clamped to 3 lines with "Show more" / "Show less"
 * - Equal-width 44px buttons: "Hackathon Page" and "Edit Links"
 */
function enhanceMissionCard(hackathon) {
  const card = document.getElementById('lockedProjectDetailsBar');
  if (!card) return;

  const summaryEl = document.getElementById('lockedIdeaSummary');
  if (summaryEl && !summaryEl._enhanced) {
    summaryEl._enhanced = true;
    summaryEl.classList.add('clamped');

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-show-more-summary';
    toggleBtn.textContent = 'Show more';
    toggleBtn.onclick = () => {
      haptic(10);
      const isClamped = summaryEl.classList.toggle('clamped');
      toggleBtn.textContent = isClamped ? 'Show more' : 'Show less';
    };
    summaryEl.parentNode.insertBefore(toggleBtn, summaryEl.nextSibling);
  }

  // Setup equal-width 44px action buttons below mission summary
  let btnRow = card.querySelector('.mission-card-buttons');
  if (!btnRow) {
    btnRow = document.createElement('div');
    btnRow.className = 'mission-card-buttons';
    card.appendChild(btnRow);
  }

  btnRow.innerHTML = `
    <a href="${hackathon.event_url || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="${hackathon.event_url ? '' : 'opacity: 0.5; pointer-events: none;'}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
      <span>Hackathon Page</span>
    </a>
    <button type="button" id="mobileBtnEditMissionLinks" class="btn btn-primary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      <span>Edit Links</span>
    </button>
  `;

  btnRow.querySelector('#mobileBtnEditMissionLinks')?.addEventListener('click', () => {
    haptic(10);
    openEditDeliverablesSheet(hackathon);
  });
}

/**
 * Enhance Project Showcase Tab on mobile
 */
function enhanceShowcaseMobile(hackathon) {
  const showcaseBox = document.getElementById('projectShowcaseBox');
  if (!showcaseBox) return;

  // 1. Link rows: tap opens in new tab, long-press copies URL
  setupShowcaseLinkRows();

  // 2. Demo video: 16:9 iframe embed, YouTube/Vimeo/Loom conversion
  setupShowcaseVideoSection(hackathon);

  // 3. Edit buttons open bottom sheets
  setupShowcaseEditSheets(hackathon);
}

function setupShowcaseLinkRows() {
  const linkCards = document.querySelectorAll('.showcase-link-card');
  linkCards.forEach(linkCard => {
    const url = linkCard.href;
    if (!url || url === '#' || url.startsWith('javascript:')) return;

    // Tap opens in new tab with noopener
    linkCard.setAttribute('target', '_blank');
    linkCard.setAttribute('rel', 'noopener noreferrer');

    // Long press copies URL
    let timer = null;
    let startX = 0;
    let startY = 0;

    linkCard.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;

      timer = setTimeout(async () => {
        haptic(15);
        try {
          await navigator.clipboard.writeText(url);
          showToast('Link copied to clipboard!', 'success');
        } catch (_) {
          showToast('Could not copy link', 'error');
        }
      }, 400);
    }, { passive: true });

    linkCard.addEventListener('touchmove', (e) => {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 8 || dy > 8) {
        if (timer) clearTimeout(timer);
      }
    }, { passive: true });

    linkCard.addEventListener('touchend', () => {
      if (timer) clearTimeout(timer);
    });

    linkCard.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

function setupShowcaseVideoSection(hackathon) {
  const grid = document.getElementById('showcaseVideosGrid');
  if (!grid) return;

  // Convert watch URLs to embed URLs if needed
  const iframes = grid.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    iframe.setAttribute('loading', 'lazy');
    let src = iframe.src;
    if (src.includes('youtube.com/watch?v=')) {
      const vId = new URL(src).searchParams.get('v');
      if (vId) iframe.src = `https://www.youtube.com/embed/${vId}`;
    }
  });
}

/**
 * Bottom Sheets for Showcase Editors
 */
function setupShowcaseEditSheets(hackathon) {
  // 1. Edit Deliverables & Deployment Links
  const btnEditDeliverables = document.getElementById('btnEditDeliverables');
  if (btnEditDeliverables) {
    btnEditDeliverables.onclick = () => {
      haptic(10);
      openEditDeliverablesSheet(hackathon);
    };
  }

  // 2. Edit Demo Videos
  const btnEditVideos = document.getElementById('btnEditVideos');
  if (btnEditVideos) {
    btnEditVideos.onclick = () => {
      haptic(10);
      openEditVideosSheet(hackathon);
    };
  }

  // 3. Edit Resources
  const btnEditResources = document.getElementById('btnEditResources');
  if (btnEditResources) {
    btnEditResources.onclick = () => {
      haptic(10);
      openEditResourcesSheet(hackathon);
    };
  }

  // 4. Edit Documentation
  const btnEditDocs = document.getElementById('btnEditDocs');
  if (btnEditDocs) {
    btnEditDocs.onclick = () => {
      haptic(10);
      openEditDocsSheet(hackathon);
    };
  }
}

function openEditDeliverablesSheet(hackathon) {
  const repoInput = document.getElementById('inputShowcaseRepoUrl') || document.getElementById('inputRepoUrl');
  const demoInput = document.getElementById('inputShowcaseDemoUrl') || document.getElementById('inputDemoUrl');

  const currentRepo = repoInput ? repoInput.value : (hackathon.repo_url || '');
  const currentDemo = demoInput ? demoInput.value : (hackathon.demo_url || '');

  const form = document.createElement('form');
  form.innerHTML = `
    <div class="form-group" style="margin-bottom: 14px;">
      <label class="form-label" for="sheetRepoUrl">GitHub Repository URL</label>
      <input type="url" id="sheetRepoUrl" class="form-input form-input-standalone" placeholder="https://github.com/org/repo" value="${escapeHtml(currentRepo)}" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
    </div>
    <div class="form-group" style="margin-bottom: 20px;">
      <label class="form-label" for="sheetDemoUrl">Live Demo URL</label>
      <input type="url" id="sheetDemoUrl" class="form-input form-input-standalone" placeholder="https://myproject.vercel.app" value="${escapeHtml(currentDemo)}" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
    </div>
  `;

  // Auto-prepend https:// on blur
  const repoIn = form.querySelector('#sheetRepoUrl');
  const demoIn = form.querySelector('#sheetDemoUrl');
  [repoIn, demoIn].forEach(input => {
    input.addEventListener('blur', () => {
      let val = input.value.trim();
      if (val && !/^https?:\/\//i.test(val)) input.value = 'https://' + val;
    });
  });

  openBottomSheet({
    title: 'Edit Deliverables & Links',
    subtitle: 'Coordinate repo and live deployment',
    contentHtml: form,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Save Links',
        className: 'btn-primary',
        onClick: async (_, { close }) => {
          haptic(15);
          const newRepo = repoIn.value.trim();
          const newDemo = demoIn.value.trim();

          try {
            if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .update({ repo_url: newRepo || null, demo_url: newDemo || null })
                .eq('id', hackathon.id);
              if (error) throw error;
            }
            hackathon.repo_url = newRepo;
            hackathon.demo_url = newDemo;

            // Sync desktop form inputs
            if (repoInput) repoInput.value = newRepo;
            if (demoInput) demoInput.value = newDemo;

            close();
            showToast('Deliverables links saved!', 'success');
            window.dispatchEvent(new CustomEvent('hackdeck:board-updated', { detail: { hackathon } }));
          } catch (err) {
            showToast(err.message || 'Failed to save links', 'error');
          }
        }
      }
    ]
  });
}

function openEditVideosSheet(hackathon) {
  const container = document.createElement('div');
  const currentVideos = Array.isArray(hackathon.showcase_videos) ? hackathon.showcase_videos : [];

  container.innerHTML = `
    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
      Paste YouTube, Vimeo, or Loom walkthrough URLs.
    </div>
    <div id="sheetVideoRows" style="display: flex; flex-direction: column; gap: 10px;"></div>
    <button type="button" id="btnAddSheetVideoRow" class="btn btn-outline btn-sm" style="margin-top: 10px; width: 100%;">
      + Add Another Video
    </button>
  `;

  const rowsContainer = container.querySelector('#sheetVideoRows');

  function addRow(url = '') {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.innerHTML = `
      <input type="url" class="form-input form-input-standalone sheet-video-url" placeholder="https://youtube.com/watch?v=..." value="${escapeHtml(url)}" style="flex: 1;" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
      <button type="button" class="btn-remove-row" style="background: none; border: 1px solid var(--border); border-radius: 8px; width: 44px; height: 44px; color: var(--danger); font-size: 18px; cursor: pointer;">×</button>
    `;
    row.querySelector('.btn-remove-row').onclick = () => row.remove();
    rowsContainer.appendChild(row);
  }

  if (currentVideos.length > 0) {
    currentVideos.forEach(v => addRow(v.url || v));
  } else {
    addRow('');
  }

  container.querySelector('#btnAddSheetVideoRow').onclick = () => addRow('');

  openBottomSheet({
    title: 'Edit Demo Videos',
    subtitle: 'Embed walkthroughs for judges',
    contentHtml: container,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Save Videos',
        className: 'btn-primary',
        onClick: async (_, { close }) => {
          haptic(15);
          const urls = Array.from(rowsContainer.querySelectorAll('.sheet-video-url'))
            .map(i => i.value.trim())
            .filter(Boolean)
            .map(url => ({ url }));

          try {
            if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .update({ showcase_videos: urls })
                .eq('id', hackathon.id);
              if (error) throw error;
            }
            hackathon.showcase_videos = urls;
            close();
            showToast('Demo videos saved!', 'success');
            window.dispatchEvent(new CustomEvent('hackdeck:board-updated', { detail: { hackathon } }));
          } catch (err) {
            showToast(err.message || 'Failed to save videos', 'error');
          }
        }
      }
    ]
  });
}

function openEditResourcesSheet(hackathon) {
  const container = document.createElement('div');
  const currentResources = Array.isArray(hackathon.showcase_resources) ? hackathon.showcase_resources : [];

  container.innerHTML = `
    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
      Link Figma designs, pitch slides, APIs, or documentation.
    </div>
    <div id="sheetResourceRows" style="display: flex; flex-direction: column; gap: 10px;"></div>
    <button type="button" id="btnAddSheetResourceRow" class="btn btn-outline btn-sm" style="margin-top: 10px; width: 100%;">
      + Add Resource Link
    </button>
  `;

  const rowsContainer = container.querySelector('#sheetResourceRows');

  function addRow(label = '', url = '') {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-direction: column; gap: 6px; padding: 10px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; position: relative;';
    row.innerHTML = `
      <input type="text" class="form-input form-input-standalone sheet-res-label" placeholder="Resource Title (e.g. Figma Deck)" value="${escapeHtml(label)}">
      <input type="url" class="form-input form-input-standalone sheet-res-url" placeholder="https://..." value="${escapeHtml(url)}" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
      <button type="button" class="btn-remove-row" style="position: absolute; top: 6px; right: 6px; background: none; border: none; color: var(--danger); font-size: 18px; cursor: pointer;">×</button>
    `;
    row.querySelector('.btn-remove-row').onclick = () => row.remove();
    rowsContainer.appendChild(row);
  }

  if (currentResources.length > 0) {
    currentResources.forEach(r => addRow(r.label || r.title, r.url));
  } else {
    addRow('', '');
  }

  container.querySelector('#btnAddSheetResourceRow').onclick = () => addRow('', '');

  openBottomSheet({
    title: 'Edit Project Resources',
    subtitle: 'Figma, slide decks, API references',
    contentHtml: container,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Save Resources',
        className: 'btn-primary',
        onClick: async (_, { close }) => {
          haptic(15);
          const resources = Array.from(rowsContainer.children).map(row => {
            const label = row.querySelector('.sheet-res-label')?.value.trim();
            const url = row.querySelector('.sheet-res-url')?.value.trim();
            return { label, url };
          }).filter(r => r.url);

          try {
            if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .update({ showcase_resources: resources })
                .eq('id', hackathon.id);
              if (error) throw error;
            }
            hackathon.showcase_resources = resources;
            close();
            showToast('Resources saved!', 'success');
            window.dispatchEvent(new CustomEvent('hackdeck:board-updated', { detail: { hackathon } }));
          } catch (err) {
            showToast(err.message || 'Failed to save resources', 'error');
          }
        }
      }
    ]
  });
}

function openEditDocsSheet(hackathon) {
  const currentDocs = hackathon.showcase_description || '';

  const container = document.createElement('div');
  container.innerHTML = `
    <div style="display: flex; gap: 8px; margin-bottom: 10px;">
      <button type="button" id="tabSheetWriteMd" class="btn btn-outline btn-xs" style="font-weight: 600;">Write</button>
      <button type="button" id="tabSheetPreviewMd" class="btn btn-outline btn-xs">Preview</button>
    </div>
    <div id="sheetWriteMdContainer">
      <textarea id="sheetDocsTextarea" class="form-input form-input-standalone" rows="12" style="font-family: var(--font-mono); font-size: 14px; line-height: 1.5;" placeholder="## Project Overview&#10;&#10;Describe architecture, setup steps, and features...">${escapeHtml(currentDocs)}</textarea>
    </div>
    <div id="sheetPreviewMdContainer" class="showcase-markdown-body markdown-body" style="display: none; min-height: 200px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card);"></div>
  `;

  const writeTab = container.querySelector('#tabSheetWriteMd');
  const prevTab = container.querySelector('#tabSheetPreviewMd');
  const writeBox = container.querySelector('#sheetWriteMdContainer');
  const prevBox = container.querySelector('#sheetPreviewMdContainer');
  const textarea = container.querySelector('#sheetDocsTextarea');

  writeTab.onclick = () => {
    writeTab.classList.add('btn-primary');
    writeTab.classList.remove('btn-outline');
    prevTab.classList.remove('btn-primary');
    prevTab.classList.add('btn-outline');
    writeBox.style.display = 'block';
    prevBox.style.display = 'none';
  };

  prevTab.onclick = () => {
    prevTab.classList.add('btn-primary');
    prevTab.classList.remove('btn-outline');
    writeTab.classList.remove('btn-primary');
    writeTab.classList.add('btn-outline');
    writeBox.style.display = 'none';
    prevBox.style.display = 'block';

    const raw = textarea.value;
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      prevBox.innerHTML = DOMPurify.sanitize(marked.parse(raw));
    } else {
      prevBox.textContent = raw;
    }
  };

  writeTab.classList.add('btn-primary');

  openBottomSheet({
    title: 'Edit Documentation',
    subtitle: 'Architecture notes and instructions',
    contentHtml: container,
    buttons: [
      { text: 'Cancel', className: 'btn-outline', onClick: (_, { close }) => close() },
      {
        text: 'Save Documentation',
        className: 'btn-primary',
        onClick: async (_, { close }) => {
          haptic(15);
          const newDesc = textarea.value;

          try {
            if (window.supabaseClient) {
              const { error } = await window.supabaseClient
                .from('hackathons')
                .update({ showcase_description: newDesc })
                .eq('id', hackathon.id);
              if (error) throw error;
            }
            hackathon.showcase_description = newDesc;
            close();
            showToast('Documentation saved!', 'success');
            window.dispatchEvent(new CustomEvent('hackdeck:board-updated', { detail: { hackathon } }));
          } catch (err) {
            showToast(err.message || 'Failed to save documentation', 'error');
          }
        }
      }
    ]
  });
}

function setupExistingModals() {
  const taskModal = document.getElementById('createTaskModal');
  if (taskModal) enhanceExistingModal(taskModal);

  const pitchModal = document.getElementById('pitchIdeaModal');
  if (pitchModal) enhanceExistingModal(pitchModal);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Auto-run if mobile
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBoardMobile);
} else {
  initBoardMobile();
}
