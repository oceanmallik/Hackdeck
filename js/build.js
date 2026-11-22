// js/build.js - Phase 2 Build Sprint: Locked Project Details & GitHub Projects-Style Kanban
(() => {
  // State
  let hackathonId = null;
  let currentHackathon = null;
  let currentUser = null;
  let isLeader = false;
  let isMember = false;
  let isSpectator = false;

  let cachedTasks = [];
  let cachedMembers = [];
  let assigneeMap = new Map();
  let draggedTaskId = null;
  let tasksRealtimeChannel = null;

  // DOM Elements - Locked Project Bar
  const lockedProjectDetailsBar = document.getElementById('lockedProjectDetailsBar');
  const lockedIdeaTitle = document.getElementById('lockedIdeaTitle');
  const lockedIdeaSummary = document.getElementById('lockedIdeaSummary');
  const projectEventLink = document.getElementById('projectEventLink');
  
  const viewerRepoLink = document.getElementById('viewerRepoLink');
  const viewerRepoText = document.getElementById('viewerRepoText');
  const viewerDemoLink = document.getElementById('viewerDemoLink');
  const viewerDemoText = document.getElementById('viewerDemoText');

  const btnLeaderEditUrls = document.getElementById('btnLeaderEditUrls');
  const leaderLinkEditBar = document.getElementById('leaderLinkEditBar');
  const inputRepoUrl = document.getElementById('inputRepoUrl');
  const inputDemoUrl = document.getElementById('inputDemoUrl');
  const btnSaveProjectUrls = document.getElementById('btnSaveProjectUrls');
  const btnCancelEditUrls = document.getElementById('btnCancelEditUrls');

  // DOM Elements - Kanban Board
  const kanbanBoard = document.getElementById('kanbanBoard');
  const taskLists = {
    todo: document.getElementById('tasks-list-todo'),
    in_progress: document.getElementById('tasks-list-in_progress'),
    review: document.getElementById('tasks-list-review'),
    done: document.getElementById('tasks-list-done')
  };
  const taskCounters = {
    todo: document.getElementById('count-todo'),
    in_progress: document.getElementById('count-in_progress'),
    review: document.getElementById('count-review'),
    done: document.getElementById('count-done')
  };

  // DOM Elements - Create / Edit Task Modal
  const btnAddTask = document.getElementById('btnAddTask');
  const createTaskModal = document.getElementById('createTaskModal');
  const createTaskModalTitle = document.getElementById('createTaskModalTitle');
  const createTaskModalDesc = document.getElementById('createTaskModalDesc');
  const createTaskForm = document.getElementById('createTaskForm');
  const editingTaskIdInput = document.getElementById('editingTaskId');
  const btnCloseTaskModal = document.getElementById('btnCloseTaskModal');
  const btnCancelTaskModal = document.getElementById('btnCancelTaskModal');
  const btnSubmitTask = document.getElementById('btnSubmitTask');
  
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskDescInput = document.getElementById('taskDescInput');
  const taskStatusInput = document.getElementById('taskStatusInput');
  const taskAssigneeInput = document.getElementById('taskAssigneeInput');
  const createTaskErrorBanner = document.getElementById('createTaskErrorBanner');
  const createTaskErrorMessage = document.getElementById('createTaskErrorMessage');

  // DOM Elements - Project Showcase Box
  const projectShowcaseBox = document.getElementById('projectShowcaseBox');
  const showcaseProjectTitle = document.getElementById('showcaseProjectTitle');
  const btnEditProjectShowcase = document.getElementById('btnEditProjectShowcase');
  const showcaseRepoLink = document.getElementById('showcaseRepoLink');
  const showcaseRepoText = document.getElementById('showcaseRepoText');
  const showcaseDemoLink = document.getElementById('showcaseDemoLink');
  const showcaseDemoText = document.getElementById('showcaseDemoText');
  const showcaseVideosSection = document.getElementById('showcaseVideosSection');
  const showcaseVideosGrid = document.getElementById('showcaseVideosGrid');
  const showcaseResourcesSection = document.getElementById('showcaseResourcesSection');
  const showcaseResourcesList = document.getElementById('showcaseResourcesList');
  const showcaseMarkdownBody = document.getElementById('showcaseMarkdownBody');

  // DOM Elements - Edit Project Details Modal
  const editProjectShowcaseModal = document.getElementById('editProjectShowcaseModal');
  const btnCloseEditShowcaseModal = document.getElementById('btnCloseEditShowcaseModal');
  const btnCancelEditShowcase = document.getElementById('btnCancelEditShowcase');
  const editShowcaseForm = document.getElementById('editShowcaseForm');
  const btnSaveShowcaseDetails = document.getElementById('btnSaveShowcaseDetails');
  const inputShowcaseRepoUrl = document.getElementById('inputShowcaseRepoUrl');
  const inputShowcaseDemoUrl = document.getElementById('inputShowcaseDemoUrl');
  const inputShowcaseDescMd = document.getElementById('inputShowcaseDescMd');
  const tabWriteMd = document.getElementById('tabWriteMd');
  const tabPreviewMd = document.getElementById('tabPreviewMd');
  const tabWriteContainer = document.getElementById('tabWriteContainer');
  const tabPreviewContainer = document.getElementById('tabPreviewContainer');
  const previewMarkdownOutput = document.getElementById('previewMarkdownOutput');
  const btnAddYouTubeRow = document.getElementById('btnAddYouTubeRow');
  const editYouTubeRowsContainer = document.getElementById('editYouTubeRowsContainer');
  const btnAddResourceRow = document.getElementById('btnAddResourceRow');
  const editResourceRowsContainer = document.getElementById('editResourceRowsContainer');
  const editShowcaseErrorBanner = document.getElementById('editShowcaseErrorBanner');
  const editShowcaseErrorMessage = document.getElementById('editShowcaseErrorMessage');

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
  // 1. Locked Project Details Bar
  // =========================================================================

  /**
   * Render project mission, event link, repo link, and demo link
   */
  function renderProjectDetails(hackathon) {
    if (!hackathon) return;
    currentHackathon = hackathon;

    // Mission Title & Summary
    if (lockedIdeaTitle) {
      lockedIdeaTitle.textContent = hackathon.locked_idea_title || 'Project Mission Pending';
    }
    if (lockedIdeaSummary) {
      lockedIdeaSummary.textContent = hackathon.locked_idea_summary || 'Lock a winning idea during Phase 1 to set your mission statement, coordinate code, and launch your prototype.';
    }

    // Original Hackathon Event URL
    if (projectEventLink) {
      if (hackathon.event_url && hackathon.event_url.trim()) {
        projectEventLink.href = hackathon.event_url.trim();
        projectEventLink.classList.remove('hidden');
      } else {
        projectEventLink.classList.add('hidden');
      }
    }

    // GitHub Repo URL (hackathon.repo_url)
    if (viewerRepoLink && viewerRepoText) {
      if (hackathon.repo_url && hackathon.repo_url.trim()) {
        viewerRepoLink.href = hackathon.repo_url.trim();
        viewerRepoText.textContent = 'GitHub Repo ↗';
        viewerRepoLink.classList.remove('hidden');
      } else {
        if (!isLeader) {
          viewerRepoLink.removeAttribute('href');
          viewerRepoText.textContent = 'No Repo Linked';
          viewerRepoLink.classList.remove('hidden');
        } else {
          viewerRepoLink.classList.add('hidden');
        }
      }
    }

    // Live Demo URL (hackathon.demo_url)
    if (viewerDemoLink && viewerDemoText) {
      if (hackathon.demo_url && hackathon.demo_url.trim()) {
        viewerDemoLink.href = hackathon.demo_url.trim();
        viewerDemoText.textContent = 'Live Demo ↗';
        viewerDemoLink.classList.remove('hidden');
      } else {
        if (!isLeader) {
          viewerDemoLink.removeAttribute('href');
          viewerDemoText.textContent = 'No Demo Linked';
          viewerDemoLink.classList.remove('hidden');
        } else {
          viewerDemoLink.classList.add('hidden');
        }
      }
    }

    // Leader Editing Toggle
    if (btnLeaderEditUrls) {
      if (isLeader) {
        btnLeaderEditUrls.classList.remove('hidden');
      } else {
        btnLeaderEditUrls.classList.add('hidden');
      }
    }
  }

  /**
   * Open / Toggle Leader Links Editor
   */
  function toggleLeaderLinksEditor() {
    if (!isLeader || !leaderLinkEditBar) return;
    const isCurrentlyHidden = leaderLinkEditBar.classList.contains('hidden');

    if (isCurrentlyHidden) {
      if (inputRepoUrl) inputRepoUrl.value = currentHackathon?.repo_url || '';
      if (inputDemoUrl) inputDemoUrl.value = currentHackathon?.demo_url || '';
      leaderLinkEditBar.classList.remove('hidden');
      if (inputRepoUrl) inputRepoUrl.focus();
    } else {
      leaderLinkEditBar.classList.add('hidden');
    }
  }

  /**
   * Save repo_url & demo_url into public.hackathons (restricted to leader_id via RLS)
   */
  async function saveProjectUrls() {
    if (!window.supabaseClient || !isLeader || !hackathonId) return;

    const newRepo = (inputRepoUrl?.value || '').trim() || null;
    const newDemo = (inputDemoUrl?.value || '').trim() || null;

    if (btnSaveProjectUrls) {
      btnSaveProjectUrls.disabled = true;
      btnSaveProjectUrls.textContent = 'Saving...';
    }

    try {
      const { error } = await window.supabaseClient
        .from('hackathons')
        .update({
          repo_url: newRepo,
          demo_url: newDemo
        })
        .eq('id', hackathonId);

      if (error) throw error;

      if (currentHackathon) {
        currentHackathon.repo_url = newRepo;
        currentHackathon.demo_url = newDemo;
      }

      if (leaderLinkEditBar) leaderLinkEditBar.classList.add('hidden');
      renderProjectDetails(currentHackathon);

      if (typeof window.showToast === 'function') {
        window.showToast('Project links saved successfully!', 'success');
      }

    } catch (err) {
      console.error('Error updating project links:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to save project links', 'error');
      }
    } finally {
      if (btnSaveProjectUrls) {
        btnSaveProjectUrls.disabled = false;
        btnSaveProjectUrls.textContent = 'Save Links';
      }
    }
  }

  // =========================================================================
  // 2. Project Showcase & Documentation Box
  // =========================================================================

  /**
   * Extract 11-character video ID from various YouTube URL formats
   */
  function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  /**
   * Safe JSON parse helper for array columns
   */
  function safeJsonArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Render Markdown safely using marked & DOMPurify
   */
  function renderMarkdownSafe(mdText) {
    if (!mdText || !mdText.trim()) return '';
    try {
      let rawHtml = '';
      if (window.marked && typeof window.marked.parse === 'function') {
        rawHtml = window.marked.parse(mdText);
      } else {
        rawHtml = escapeHtml(mdText).replace(/\n/g, '<br>');
      }
      if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(rawHtml);
      }
      return rawHtml;
    } catch (e) {
      console.warn('Error parsing markdown:', e);
      return escapeHtml(mdText);
    }
  }

  /**
   * Render Project Showcase, Quick Links, YouTube Videos, Resources & Markdown Documentation
   */
  function renderProjectShowcase(hackathon) {
    if (!hackathon) return;

    // Leader editing button
    if (btnEditProjectShowcase) {
      if (isLeader) {
        btnEditProjectShowcase.classList.remove('hidden');
      } else {
        btnEditProjectShowcase.classList.add('hidden');
      }
    }

    // Title
    if (showcaseProjectTitle) {
      showcaseProjectTitle.textContent = hackathon.locked_idea_title || hackathon.title || 'Deliverables & Technical Overview';
    }

    // 1. Quick Links (GitHub & Live Demo)
    if (showcaseRepoLink && showcaseRepoText) {
      if (hackathon.repo_url && hackathon.repo_url.trim()) {
        const cleanRepo = hackathon.repo_url.trim();
        showcaseRepoLink.href = cleanRepo;
        showcaseRepoLink.classList.remove('disabled');
        showcaseRepoText.textContent = cleanRepo;
      } else {
        showcaseRepoLink.removeAttribute('href');
        showcaseRepoLink.classList.add('disabled');
        showcaseRepoText.textContent = 'Not linked yet';
      }
    }

    if (showcaseDemoLink && showcaseDemoText) {
      if (hackathon.demo_url && hackathon.demo_url.trim()) {
        const cleanDemo = hackathon.demo_url.trim();
        showcaseDemoLink.href = cleanDemo;
        showcaseDemoLink.classList.remove('disabled');
        showcaseDemoText.textContent = cleanDemo;
      } else {
        showcaseDemoLink.removeAttribute('href');
        showcaseDemoLink.classList.add('disabled');
        showcaseDemoText.textContent = 'Not deployed yet';
      }
    }

    // 2. YouTube Video(s)
    if (showcaseVideosGrid) {
      const videos = safeJsonArray(hackathon.youtube_urls);
      if (videos.length === 0) {
        showcaseVideosGrid.innerHTML = `
          <div class="showcase-empty-card" style="grid-column: 1 / -1;">
            No demo videos linked yet. ${isLeader ? 'Click "Edit Project Details" above to embed a YouTube walkthrough.' : ''}
          </div>
        `;
      } else {
        const videoCards = videos.map((item, index) => {
          const url = typeof item === 'string' ? item : (item.url || '');
          const title = typeof item === 'object' && item.title ? item.title : `Demo Video #${index + 1}`;
          const videoId = extractYouTubeId(url);

          if (videoId) {
            return `
              <div class="showcase-video-card">
                <div class="video-responsive-wrap">
                  <iframe 
                    src="https://www.youtube-nocookie.com/embed/${videoId}" 
                    title="${escapeHtml(title)}" 
                    loading="lazy" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    allowfullscreen
                  ></iframe>
                </div>
                <div class="showcase-video-meta">
                  <span class="showcase-video-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
                  <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="showcase-video-link">
                    Watch on YouTube ↗
                  </a>
                </div>
              </div>
            `;
          } else if (url) {
            return `
              <div class="showcase-video-card">
                <div style="padding: 24px 16px; text-align: center; background-color: var(--bg-card);">
                  <div style="font-size: 1.5rem; margin-bottom: 6px;">🎬</div>
                  <div class="showcase-video-title">${escapeHtml(title)}</div>
                  <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="showcase-video-link" style="margin-top: 6px; display: inline-block;">
                    Open Video Link ↗
                  </a>
                </div>
              </div>
            `;
          }
          return '';
        }).filter(Boolean);

        showcaseVideosGrid.innerHTML = videoCards.length > 0 
          ? videoCards.join('') 
          : `<div class="showcase-empty-card" style="grid-column: 1 / -1;">No valid demo videos provided.</div>`;
      }
    }

    // 3. Resource Link(s)
    if (showcaseResourcesList) {
      const resources = safeJsonArray(hackathon.resource_links);
      if (resources.length === 0) {
        showcaseResourcesList.innerHTML = `
          <div class="showcase-empty-card" style="width: 100%;">
            No additional deliverables or links added. ${isLeader ? 'Click "Edit Project Details" to link Figma, slides, or documentation.' : ''}
          </div>
        `;
      } else {
        showcaseResourcesList.innerHTML = resources.map(res => {
          const url = typeof res === 'string' ? res : (res.url || '#');
          const label = typeof res === 'object' && res.label ? res.label : (url.replace(/^https?:\/\//, '') || 'Resource Link');
          return `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="showcase-resource-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <span>${escapeHtml(label)}</span>
              <span style="font-size: 0.78rem; opacity: 0.65;">↗</span>
            </a>
          `;
        }).join('');
      }
    }

    // 4. Project Description (Markdown)
    if (showcaseMarkdownBody) {
      const mdContent = hackathon.project_description_md;
      if (mdContent && mdContent.trim()) {
        showcaseMarkdownBody.innerHTML = renderMarkdownSafe(mdContent);
      } else {
        showcaseMarkdownBody.innerHTML = `
          <div class="showcase-empty-card">
            No documentation written yet. ${isLeader ? 'Click "Edit Project Details" above to add your architecture notes, setup instructions, and project summary.' : ''}
          </div>
        `;
      }
    }
  }

  /**
   * Open Edit Showcase Details Modal
   */
  function openEditShowcaseModal() {
    if (!isLeader || !editProjectShowcaseModal) return;

    if (editShowcaseErrorBanner) editShowcaseErrorBanner.classList.add('hidden');

    if (inputShowcaseRepoUrl) inputShowcaseRepoUrl.value = currentHackathon?.repo_url || '';
    if (inputShowcaseDemoUrl) inputShowcaseDemoUrl.value = currentHackathon?.demo_url || '';
    if (inputShowcaseDescMd) inputShowcaseDescMd.value = currentHackathon?.project_description_md || '';

    // Switch to Write tab
    switchMarkdownTab('write');

    // Populate dynamic YouTube rows
    if (editYouTubeRowsContainer) {
      editYouTubeRowsContainer.innerHTML = '';
      const videos = safeJsonArray(currentHackathon?.youtube_urls);
      if (videos.length === 0) {
        addYouTubeRow('', '');
      } else {
        videos.forEach(v => {
          const url = typeof v === 'string' ? v : (v.url || '');
          const title = typeof v === 'object' ? (v.title || '') : '';
          addYouTubeRow(url, title);
        });
      }
    }

    // Populate dynamic Resource rows
    if (editResourceRowsContainer) {
      editResourceRowsContainer.innerHTML = '';
      const resources = safeJsonArray(currentHackathon?.resource_links);
      if (resources.length === 0) {
        addResourceRow('', '');
      } else {
        resources.forEach(r => {
          const url = typeof r === 'string' ? r : (r.url || '');
          const label = typeof r === 'object' ? (r.label || '') : '';
          addResourceRow(label, url);
        });
      }
    }

    editProjectShowcaseModal.classList.remove('hidden');
  }

  /**
   * Close Edit Showcase Details Modal
   */
  function closeEditShowcaseModal() {
    if (!editProjectShowcaseModal) return;
    editProjectShowcaseModal.classList.add('hidden');
    if (editShowcaseErrorBanner) editShowcaseErrorBanner.classList.add('hidden');
    if (btnSaveShowcaseDetails) {
      btnSaveShowcaseDetails.disabled = false;
      btnSaveShowcaseDetails.innerHTML = '<span>Save Changes</span>';
    }
  }

  /**
   * Toggle between Write and Preview Markdown tabs
   */
  function switchMarkdownTab(tab) {
    if (tab === 'preview') {
      if (tabWriteMd) tabWriteMd.classList.remove('active');
      if (tabPreviewMd) tabPreviewMd.classList.add('active');
      if (tabWriteContainer) tabWriteContainer.classList.add('hidden');
      if (tabPreviewContainer) tabPreviewContainer.classList.remove('hidden');

      const text = inputShowcaseDescMd?.value || '';
      if (previewMarkdownOutput) {
        previewMarkdownOutput.innerHTML = text.trim()
          ? renderMarkdownSafe(text)
          : '<em style="color:var(--text-muted); font-size: 0.88rem;">Nothing to preview yet. Write markdown in the "Write" tab.</em>';
      }
    } else {
      if (tabWriteMd) tabWriteMd.classList.add('active');
      if (tabPreviewMd) tabPreviewMd.classList.remove('active');
      if (tabWriteContainer) tabWriteContainer.classList.remove('hidden');
      if (tabPreviewContainer) tabPreviewContainer.classList.add('hidden');
    }
  }

  /**
   * Add a dynamic YouTube row
   */
  function addYouTubeRow(url = '', title = '') {
    if (!editYouTubeRowsContainer) return;
    const row = document.createElement('div');
    row.className = 'dynamic-item-row youtube-item-row';
    row.innerHTML = `
      <input type="text" class="form-input form-input-standalone input-yt-title" placeholder="Video Title (e.g. 2-Min Demo Pitch)" value="${escapeHtml(title)}" style="flex: 1;">
      <input type="url" class="form-input form-input-standalone input-yt-url" placeholder="https://youtube.com/watch?v=..." value="${escapeHtml(url)}" style="flex: 2;">
      <button type="button" class="btn-remove-dynamic-row" title="Remove video">×</button>
    `;
    const removeBtn = row.querySelector('.btn-remove-dynamic-row');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => row.remove());
    }
    editYouTubeRowsContainer.appendChild(row);
  }

  /**
   * Add a dynamic Resource Link row
   */
  function addResourceRow(label = '', url = '') {
    if (!editResourceRowsContainer) return;
    const row = document.createElement('div');
    row.className = 'dynamic-item-row resource-item-row';
    row.innerHTML = `
      <input type="text" class="form-input form-input-standalone input-res-label" placeholder="Label (e.g. Figma, Slide Deck, API Docs)" value="${escapeHtml(label)}" style="flex: 1;">
      <input type="url" class="form-input form-input-standalone input-res-url" placeholder="https://..." value="${escapeHtml(url)}" style="flex: 2;">
      <button type="button" class="btn-remove-dynamic-row" title="Remove link">×</button>
    `;
    const removeBtn = row.querySelector('.btn-remove-dynamic-row');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => row.remove());
    }
    editResourceRowsContainer.appendChild(row);
  }

  /**
   * Save Project Showcase Details (repo_url, demo_url, project_description_md, youtube_urls, resource_links)
   */
  async function handleSaveShowcaseDetails(e) {
    e.preventDefault();
    if (!window.supabaseClient || !isLeader || !hackathonId) return;

    const repoUrl = (inputShowcaseRepoUrl?.value || '').trim() || null;
    const demoUrl = (inputShowcaseDemoUrl?.value || '').trim() || null;
    const descMd = (inputShowcaseDescMd?.value || '').trim() || null;

    // Collect YouTube URLs
    const youtubeItems = [];
    if (editYouTubeRowsContainer) {
      const rows = editYouTubeRowsContainer.querySelectorAll('.youtube-item-row');
      rows.forEach(r => {
        const u = (r.querySelector('.input-yt-url')?.value || '').trim();
        const t = (r.querySelector('.input-yt-title')?.value || '').trim();
        if (u) {
          youtubeItems.push({ title: t, url: u });
        }
      });
    }

    // Collect Resource Links
    const resourceItems = [];
    if (editResourceRowsContainer) {
      const rows = editResourceRowsContainer.querySelectorAll('.resource-item-row');
      rows.forEach(r => {
        const u = (r.querySelector('.input-res-url')?.value || '').trim();
        const l = (r.querySelector('.input-res-label')?.value || '').trim();
        if (u) {
          resourceItems.push({ label: l || 'Resource', url: u });
        }
      });
    }

    if (btnSaveShowcaseDetails) {
      btnSaveShowcaseDetails.disabled = true;
      btnSaveShowcaseDetails.innerHTML = '<span>Saving changes...</span>';
    }
    if (editShowcaseErrorBanner) editShowcaseErrorBanner.classList.add('hidden');

    try {
      const payload = {
        repo_url: repoUrl,
        demo_url: demoUrl,
        project_description_md: descMd,
        youtube_urls: youtubeItems,
        resource_links: resourceItems
      };

      const { data, error } = await window.supabaseClient
        .from('hackathons')
        .update(payload)
        .eq('id', hackathonId)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      if (currentHackathon) {
        Object.assign(currentHackathon, payload);
      }

      renderProjectDetails(currentHackathon);
      renderProjectShowcase(currentHackathon);

      closeEditShowcaseModal();

      if (typeof window.showToast === 'function') {
        window.showToast('Project showcase details updated!', 'success');
      }

    } catch (err) {
      console.error('Error updating project showcase:', err);
      if (editShowcaseErrorMessage) editShowcaseErrorMessage.textContent = err.message || 'Failed to update project details.';
      if (editShowcaseErrorBanner) editShowcaseErrorBanner.classList.remove('hidden');
    } finally {
      if (btnSaveShowcaseDetails) {
        btnSaveShowcaseDetails.disabled = false;
        btnSaveShowcaseDetails.innerHTML = '<span>Save Changes</span>';
      }
    }
  }

  // =========================================================================
  // 2. Fetch Members & Populate Assignee Dropdown
  // =========================================================================

  async function loadTeamMembers() {
    if (!window.supabaseClient || !hackathonId) return;

    try {
      // Fetch hackathon_members
      const { data: rawMembers, error } = await window.supabaseClient
        .from('hackathon_members')
        .select('*')
        .eq('hackathon_id', hackathonId);

      if (error) throw error;

      if (rawMembers && rawMembers.length > 0) {
        const userIds = rawMembers.map(m => m.user_id).filter(Boolean);
        const { data: profiles } = await window.supabaseClient
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        cachedMembers = rawMembers.map(m => ({
          ...m,
          profile: profileMap.get(m.user_id) || null
        }));
      } else {
        cachedMembers = [];
      }

      populateAssigneeDropdown();

    } catch (err) {
      console.warn('Notice loading members for task assignees:', err);
    }
  }

  function populateAssigneeDropdown() {
    if (!taskAssigneeInput) return;
    const currentVal = taskAssigneeInput.value;

    let optionsHtml = '<option value="">Unassigned</option>';
    cachedMembers.forEach(m => {
      const p = m.profile;
      if (p) {
        optionsHtml += `<option value="${escapeHtml(p.id)}">@${escapeHtml(p.username)} (${escapeHtml(p.display_name || p.username)})</option>`;
      }
    });

    taskAssigneeInput.innerHTML = optionsHtml;
    if (currentVal) taskAssigneeInput.value = currentVal;
  }

  // =========================================================================
  // 3. GitHub Projects-Style Kanban Board
  // =========================================================================

  /**
   * Load tasks from public.tasks matching hackathon_id
   */
  async function loadTasks() {
    if (!window.supabaseClient || !hackathonId) return;

    try {
      const { data: tasks, error } = await window.supabaseClient
        .from('tasks')
        .select('*')
        .eq('hackathon_id', hackathonId)
        .order('position', { ascending: true });

      if (error) throw error;

      cachedTasks = tasks || [];

      // Collect unique assignee_ids and fetch profiles
      const assigneeIds = [...new Set(cachedTasks.map(t => t.assignee_id).filter(Boolean))];
      if (assigneeIds.length > 0) {
        const { data: profiles } = await window.supabaseClient
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', assigneeIds);

        (profiles || []).forEach(p => assigneeMap.set(p.id, p));
      }

      renderKanbanColumns();

    } catch (err) {
      console.error('Error loading tasks:', err);
    }
  }

  /**
   * Render cards into the 4 columns: todo, in_progress, review, done
   */
  function renderKanbanColumns() {
    const columns = {
      todo: [],
      in_progress: [],
      review: [],
      done: []
    };

    // Sort and partition tasks
    cachedTasks.forEach(task => {
      const status = task.status || 'todo';
      if (columns[status]) {
        columns[status].push(task);
      } else {
        columns.todo.push(task);
      }
    });

    // Render each column list and counter
    Object.keys(columns).forEach(status => {
      const listEl = taskLists[status];
      const counterEl = taskCounters[status];
      const tasksInCol = columns[status];

      if (counterEl) counterEl.textContent = tasksInCol.length;
      if (!listEl) return;

      if (tasksInCol.length === 0) {
        listEl.innerHTML = `
          <div class="kanban-empty-col-hint">
            No tasks in this column
          </div>
        `;
      } else {
        listEl.innerHTML = tasksInCol.map(task => renderTaskCard(task)).join('');
      }
    });

    // Re-attach card events (Drag & Drop, Delete)
    bindCardEvents();
  }

  /**
   * Generate HTML for a single Kanban task card
   */
  function renderTaskCard(task) {
    const isDraggable = isMember && !isSpectator;
    const assignee = task.assignee_id ? assigneeMap.get(task.assignee_id) : null;
    
    // Assignee markup
    let assigneeMarkup = '';
    if (assignee) {
      const initial = (assignee.display_name || assignee.username || 'A').charAt(0).toUpperCase();
      const avatar = assignee.avatar_url
        ? `<img class="task-assignee-avatar" src="${escapeHtml(assignee.avatar_url)}" alt="${escapeHtml(assignee.username)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'20\\' height=\\'20\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23f1f5f9\\'/><text x=\\'50%\\' y=\\'54%\\' font-family=\\'sans-serif\\' font-size=\\'10\\' font-weight=\\'700\\' fill=\\'%23475569\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'>${escapeHtml(initial)}</text></svg>';">`
        : `<div class="task-assignee-avatar">${escapeHtml(initial)}</div>`;

      assigneeMarkup = `
        <div class="task-assignee-chip" title="Assigned to @${escapeHtml(assignee.username)}">
          ${avatar}
          <span class="task-assignee-handle">@${escapeHtml(assignee.username)}</span>
        </div>
      `;
    } else {
      assigneeMarkup = `
        <div class="task-assignee-chip" style="color: var(--text-subtle);">
          <span>Unassigned</span>
        </div>
      `;
    }

    // Action Buttons (Edit & Delete, visible when isMember is true)
    const cardActionsMarkup = isMember && !isSpectator
      ? `<div class="task-card-actions">
          <button type="button" class="btn-task-action btn-edit-task btn-trigger-edit-task" data-task-id="${escapeHtml(task.id)}" title="Edit task">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-task-action btn-delete-task btn-trigger-delete-task" data-task-id="${escapeHtml(task.id)}" title="Delete task">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>`
      : '';

    return `
      <div 
        class="kanban-task-card" 
        draggable="${isDraggable ? 'true' : 'false'}"
        data-task-id="${escapeHtml(task.id)}"
        data-status="${escapeHtml(task.status)}"
        data-position="${task.position || 0}"
      >
        <div>
          <h4 class="task-card-title">${escapeHtml(task.title)}</h4>
          ${task.description ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>` : ''}
        </div>
        <div class="task-card-footer">
          ${assigneeMarkup}
          ${cardActionsMarkup}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 4. Native HTML5 Drag and Drop Implementation
  // =========================================================================

  function bindCardEvents() {
    // 1. Native Card Drag Events & Double Click to Edit
    if (isMember && !isSpectator) {
      const cards = document.querySelectorAll('.kanban-task-card[draggable="true"]');
      cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dblclick', () => {
          const taskId = card.getAttribute('data-task-id');
          if (taskId) openEditTaskModal(taskId);
        });
      });
    }

    // 2. Edit Task Buttons
    const editBtns = document.querySelectorAll('.btn-trigger-edit-task');
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        if (taskId) openEditTaskModal(taskId);
      });
    });

    // 3. Delete Task Buttons
    const deleteBtns = document.querySelectorAll('.btn-trigger-delete-task');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        handleDeleteTask(taskId);
      });
    });
  }

  function handleDragStart(e) {
    const card = e.currentTarget;
    const taskId = card.getAttribute('data-task-id');
    draggedTaskId = taskId;

    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  }

  function handleDragEnd(e) {
    const card = e.currentTarget;
    card.classList.remove('is-dragging');
    draggedTaskId = null;

    // Clean up all drag-over visual highlights
    document.querySelectorAll('.kanban-tasks-list.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  function setupKanbanDropzones() {
    const dropzones = Object.values(taskLists);

    dropzones.forEach(dropzone => {
      if (!dropzone) return;

      dropzone.addEventListener('dragover', (e) => {
        if (!isMember || isSpectator) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dropzone.classList.add('drag-over');
      });

      dropzone.addEventListener('dragleave', (e) => {
        // Only remove if leaving the dropzone container itself
        if (e.currentTarget === dropzone && !dropzone.contains(e.relatedTarget)) {
          dropzone.classList.remove('drag-over');
        }
      });

      dropzone.addEventListener('drop', async (e) => {
        if (!isMember || isSpectator) return;
        e.preventDefault();
        dropzone.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
        const targetStatus = dropzone.getAttribute('data-status');

        if (!taskId || !targetStatus) return;

        await moveTaskToStatus(taskId, targetStatus);
      });
    });
  }

  /**
   * Move task to a new column status & position, updating public.tasks
   */
  async function moveTaskToStatus(taskId, targetStatus) {
    const task = cachedTasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.status === targetStatus) {
      return; // Already in this status column
    }

    const previousStatus = task.status;
    const targetColTasks = cachedTasks.filter(t => t.status === targetStatus && t.id !== taskId);
    const newPosition = targetColTasks.length;

    // Optimistic UI update
    task.status = targetStatus;
    task.position = newPosition;
    renderKanbanColumns();

    try {
      const { error } = await window.supabaseClient
        .from('tasks')
        .update({
          status: targetStatus,
          position: newPosition
        })
        .eq('id', taskId);

      if (error) throw error;

    } catch (err) {
      console.error('Error updating task status on drop:', err);
      // Revert on error
      task.status = previousStatus;
      renderKanbanColumns();
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to move task', 'error');
      }
    }
  }

  // =========================================================================
  // =========================================================================
  // 5. Task Creation, Editing & Deletion
  // =========================================================================

  function openCreateTaskModal(defaultStatus = 'todo') {
    if (!isMember || isSpectator || !createTaskModal) return;

    if (createTaskForm) createTaskForm.reset();
    if (editingTaskIdInput) editingTaskIdInput.value = '';
    if (createTaskModalTitle) createTaskModalTitle.textContent = 'New Task';
    if (createTaskModalDesc) createTaskModalDesc.textContent = 'Create an actionable deliverable for your team sprint.';
    if (btnSubmitTask) btnSubmitTask.innerHTML = '<span>Create Task</span>';
    if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');
    if (taskStatusInput) taskStatusInput.value = defaultStatus;

    populateAssigneeDropdown();

    createTaskModal.classList.remove('hidden');
    if (taskTitleInput) taskTitleInput.focus();
  }

  function openEditTaskModal(taskId) {
    if (!isMember || isSpectator || !createTaskModal) return;

    const task = cachedTasks.find(t => t.id === taskId);
    if (!task) return;

    if (createTaskForm) createTaskForm.reset();
    if (editingTaskIdInput) editingTaskIdInput.value = task.id;
    if (createTaskModalTitle) createTaskModalTitle.textContent = 'Edit Task';
    if (createTaskModalDesc) createTaskModalDesc.textContent = 'Update deliverable details, column status, or reassign a teammate.';
    if (btnSubmitTask) btnSubmitTask.innerHTML = '<span>Save Changes</span>';
    if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');

    populateAssigneeDropdown();

    if (taskTitleInput) taskTitleInput.value = task.title || '';
    if (taskDescInput) taskDescInput.value = task.description || '';
    if (taskStatusInput) taskStatusInput.value = task.status || 'todo';
    if (taskAssigneeInput) taskAssigneeInput.value = task.assignee_id || '';

    createTaskModal.classList.remove('hidden');
    if (taskTitleInput) taskTitleInput.focus();
  }

  function closeCreateTaskModal() {
    if (!createTaskModal) return;
    createTaskModal.classList.add('hidden');
    if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');
    if (editingTaskIdInput) editingTaskIdInput.value = '';
    if (btnSubmitTask) {
      btnSubmitTask.disabled = false;
      btnSubmitTask.innerHTML = '<span>Create Task</span>';
    }
  }

  function showTaskModalError(msg) {
    if (createTaskErrorMessage) createTaskErrorMessage.textContent = msg;
    if (createTaskErrorBanner) createTaskErrorBanner.classList.remove('hidden');
  }

  /**
   * Save Task: Inserts new or updates existing in public.tasks
   * (STRICT NOTE: Do NOT use user_id on public.tasks!)
   */
  async function handleCreateTask(e) {
    e.preventDefault();
    if (!window.supabaseClient || !currentUser || !hackathonId) return;

    const titleVal = (taskTitleInput?.value || '').trim();
    const descVal = (taskDescInput?.value || '').trim();
    const statusVal = taskStatusInput?.value || 'todo';
    const assigneeVal = taskAssigneeInput?.value || null;
    const editingId = (editingTaskIdInput?.value || '').trim();

    if (!titleVal) {
      showTaskModalError('Please enter a task title.');
      taskTitleInput?.focus();
      return;
    }

    if (editingId) {
      // 1. UPDATE EXISTING TASK
      if (btnSubmitTask) {
        btnSubmitTask.disabled = true;
        btnSubmitTask.innerHTML = '<span>Saving changes...</span>';
      }
      if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');

      try {
        const { data, error } = await window.supabaseClient
          .from('tasks')
          .update({
            title: titleVal,
            description: descVal || null,
            status: statusVal,
            assignee_id: assigneeVal || null
          })
          .eq('id', editingId)
          .select()
          .single();

        if (error) throw error;

        closeCreateTaskModal();
        if (typeof window.showToast === 'function') {
          window.showToast(`Task "${titleVal}" updated!`, 'success');
        }

        await loadTasks();

      } catch (err) {
        console.error('Error updating task:', err);
        showTaskModalError(err.message || 'Failed to update task.');
      } finally {
        if (btnSubmitTask) {
          btnSubmitTask.disabled = false;
          btnSubmitTask.innerHTML = '<span>Save Changes</span>';
        }
      }
    } else {
      // 2. CREATE NEW TASK
      const tasksInStatus = cachedTasks.filter(t => t.status === statusVal);
      const positionVal = tasksInStatus.length;

      // Payload: uses created_by = currentUser.id (NO user_id on public.tasks!)
      const payload = {
        hackathon_id: hackathonId,
        title: titleVal,
        description: descVal || null,
        status: statusVal,
        position: positionVal,
        assignee_id: assigneeVal || null,
        created_by: currentUser.id
      };

      if (btnSubmitTask) {
        btnSubmitTask.disabled = true;
        btnSubmitTask.innerHTML = '<span>Creating task...</span>';
      }
      if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');

      try {
        const { data, error } = await window.supabaseClient
          .from('tasks')
          .insert([payload])
          .select()
          .single();

        if (error) throw error;

        closeCreateTaskModal();
        if (typeof window.showToast === 'function') {
          window.showToast(`Task "${titleVal}" created!`, 'success');
        }

        await loadTasks();

      } catch (err) {
        console.error('Error creating task:', err);
        showTaskModalError(err.message || 'Failed to create task. Check database permissions.');
      } finally {
        if (btnSubmitTask) {
          btnSubmitTask.disabled = false;
          btnSubmitTask.innerHTML = '<span>Create Task</span>';
        }
      }
    }
  }

  /**
   * Delete Task
   */
  async function handleDeleteTask(taskId) {
    if (!window.supabaseClient || !isMember || isSpectator) return;

    const confirmed = window.confirm('Are you sure you want to delete this task?');
    if (!confirmed) return;

    try {
      const { error } = await window.supabaseClient
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      if (typeof window.showToast === 'function') {
        window.showToast('Task deleted.', 'info');
      }

      await loadTasks();

    } catch (err) {
      console.error('Error deleting task:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(err.message || 'Failed to delete task', 'error');
      }
    }
  }

  // =========================================================================
  // 6. Realtime Subscription on public.tasks
  // =========================================================================

  function setupTasksRealtime(id) {
    if (!window.supabaseClient || !id) return;

    if (tasksRealtimeChannel) {
      window.supabaseClient.removeChannel(tasksRealtimeChannel);
    }

    tasksRealtimeChannel = window.supabaseClient
      .channel(`tasks-realtime-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `hackathon_id=eq.${id}`
        },
        (payload) => {
          console.log('Realtime task event received:', payload);
          loadTasks();
        }
      )
      .subscribe();
  }

  // =========================================================================
  // 7. Initialization & Events Wiring
  // =========================================================================

  function setupFromBoardContext(ctx) {
    if (!ctx || !ctx.hackathon) return;
    const hackathon = ctx.hackathon;
    hackathonId = hackathon.id;
    currentHackathon = hackathon;
    currentUser = ctx.user;
    isLeader = ctx.isLeader;
    isMember = ctx.isMember;
    isSpectator = ctx.isSpectator;

    // Render Locked Project Details Bar
    renderProjectDetails(hackathon);

    // Render Project Showcase & Documentation Box
    renderProjectShowcase(hackathon);

    // Load team members for assignee dropdown
    loadTeamMembers();

    // Load initial tasks
    loadTasks();

    // Setup drag-and-drop dropzones
    setupKanbanDropzones();

    // Setup Supabase Realtime for tasks
    setupTasksRealtime(hackathonId);
  }

  function bindEvents() {
    // Leader Links Editor Buttons
    if (btnLeaderEditUrls) {
      btnLeaderEditUrls.addEventListener('click', toggleLeaderLinksEditor);
    }
    if (btnSaveProjectUrls) {
      btnSaveProjectUrls.addEventListener('click', saveProjectUrls);
    }
    if (btnCancelEditUrls) {
      btnCancelEditUrls.addEventListener('click', () => {
        if (leaderLinkEditBar) leaderLinkEditBar.classList.add('hidden');
      });
    }

    // Project Showcase Editor Controls
    if (btnEditProjectShowcase) {
      btnEditProjectShowcase.addEventListener('click', openEditShowcaseModal);
    }
    if (btnCloseEditShowcaseModal) {
      btnCloseEditShowcaseModal.addEventListener('click', closeEditShowcaseModal);
    }
    if (btnCancelEditShowcase) {
      btnCancelEditShowcase.addEventListener('click', closeEditShowcaseModal);
    }
    if (editShowcaseForm) {
      editShowcaseForm.addEventListener('submit', handleSaveShowcaseDetails);
    }
    if (tabWriteMd) {
      tabWriteMd.addEventListener('click', () => switchMarkdownTab('write'));
    }
    if (tabPreviewMd) {
      tabPreviewMd.addEventListener('click', () => switchMarkdownTab('preview'));
    }
    if (btnAddYouTubeRow) {
      btnAddYouTubeRow.addEventListener('click', () => addYouTubeRow('', ''));
    }
    if (btnAddResourceRow) {
      btnAddResourceRow.addEventListener('click', () => addResourceRow('', ''));
    }
    if (editProjectShowcaseModal) {
      editProjectShowcaseModal.addEventListener('click', (e) => {
        if (e.target === editProjectShowcaseModal) closeEditShowcaseModal();
      });
    }

    // Task Creation Buttons
    if (btnAddTask) {
      btnAddTask.addEventListener('click', () => openCreateTaskModal('todo'));
    }

    // Column quick add buttons
    const colAddBtns = document.querySelectorAll('.btn-col-add-task');
    colAddBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.getAttribute('data-status') || 'todo';
        openCreateTaskModal(status);
      });
    });

    // Create Task Modal controls
    if (btnCloseTaskModal) btnCloseTaskModal.addEventListener('click', closeCreateTaskModal);
    if (btnCancelTaskModal) btnCancelTaskModal.addEventListener('click', closeCreateTaskModal);
    if (createTaskForm) createTaskForm.addEventListener('submit', handleCreateTask);

    // Close modal on click outside (backdrop)
    if (createTaskModal) {
      createTaskModal.addEventListener('click', (e) => {
        if (e.target === createTaskModal) closeCreateTaskModal();
      });
    }

    // Close modals on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (createTaskModal && !createTaskModal.classList.contains('hidden')) {
          closeCreateTaskModal();
        }
        if (editProjectShowcaseModal && !editProjectShowcaseModal.classList.contains('hidden')) {
          closeEditShowcaseModal();
        }
      }
    });
  }

  function init() {
    bindEvents();

    // Listen for board ready from board.js
    window.addEventListener('hackdeck:board-ready', (e) => {
      setupFromBoardContext(e.detail);
    });

    // Listen for board updates (such as locked idea updates, showcase updates, or URL changes)
    window.addEventListener('hackdeck:board-updated', (e) => {
      const updatedHackathon = e.detail?.hackathon;
      if (updatedHackathon) {
        renderProjectDetails(updatedHackathon);
        renderProjectShowcase(updatedHackathon);
      }
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
