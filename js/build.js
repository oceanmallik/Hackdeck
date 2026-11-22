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

  // DOM Elements - Create Task Modal
  const btnAddTask = document.getElementById('btnAddTask');
  const createTaskModal = document.getElementById('createTaskModal');
  const createTaskForm = document.getElementById('createTaskForm');
  const btnCloseTaskModal = document.getElementById('btnCloseTaskModal');
  const btnCancelTaskModal = document.getElementById('btnCancelTaskModal');
  const btnSubmitTask = document.getElementById('btnSubmitTask');
  
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskDescInput = document.getElementById('taskDescInput');
  const taskStatusInput = document.getElementById('taskStatusInput');
  const taskAssigneeInput = document.getElementById('taskAssigneeInput');
  const createTaskErrorBanner = document.getElementById('createTaskErrorBanner');
  const createTaskErrorMessage = document.getElementById('createTaskErrorMessage');

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

    // Delete Button (visible when isMember is true)
    const deleteBtnMarkup = isMember && !isSpectator
      ? `<button class="btn-delete-task btn-trigger-delete-task" data-task-id="${escapeHtml(task.id)}" title="Delete task">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>`
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
          ${deleteBtnMarkup}
        </div>
      </div>
    `;
  }

  // =========================================================================
  // 4. Native HTML5 Drag and Drop Implementation
  // =========================================================================

  function bindCardEvents() {
    // 1. Native Card Drag Events
    if (isMember && !isSpectator) {
      const cards = document.querySelectorAll('.kanban-task-card[draggable="true"]');
      cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
      });
    }

    // 2. Delete Task Buttons
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
  // 5. Task Creation & Deletion
  // =========================================================================

  function openCreateTaskModal(defaultStatus = 'todo') {
    if (!isMember || isSpectator || !createTaskModal) return;

    if (createTaskForm) createTaskForm.reset();
    if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');
    if (taskStatusInput) taskStatusInput.value = defaultStatus;

    populateAssigneeDropdown();

    createTaskModal.classList.remove('hidden');
    if (taskTitleInput) taskTitleInput.focus();
  }

  function closeCreateTaskModal() {
    if (!createTaskModal) return;
    createTaskModal.classList.add('hidden');
    if (createTaskErrorBanner) createTaskErrorBanner.classList.add('hidden');
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
   * Create Task: Inserts into public.tasks using:
   * hackathon_id, title, description, status, position, assignee_id, created_by
   * (STRICT NOTE: Do NOT use user_id on public.tasks!)
   */
  async function handleCreateTask(e) {
    e.preventDefault();
    if (!window.supabaseClient || !currentUser || !hackathonId) return;

    const titleVal = (taskTitleInput?.value || '').trim();
    const descVal = (taskDescInput?.value || '').trim();
    const statusVal = taskStatusInput?.value || 'todo';
    const assigneeVal = taskAssigneeInput?.value || null;

    if (!titleVal) {
      showTaskModalError('Please enter a task title.');
      taskTitleInput?.focus();
      return;
    }

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

    // Close modal on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && createTaskModal && !createTaskModal.classList.contains('hidden')) {
        closeCreateTaskModal();
      }
    });
  }

  function init() {
    bindEvents();

    // Listen for board ready from board.js
    window.addEventListener('hackdeck:board-ready', (e) => {
      setupFromBoardContext(e.detail);
    });

    // Listen for board updates (such as locked idea updates or URL changes)
    window.addEventListener('hackdeck:board-updated', (e) => {
      const updatedHackathon = e.detail?.hackathon;
      if (updatedHackathon) {
        renderProjectDetails(updatedHackathon);
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
