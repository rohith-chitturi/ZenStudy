// Main Controller
import {
  loadState,
  getState,
  subscribe,
  addSubject,
  deleteSubject,
  addTask,
  updateTask,
  deleteTask,
  toggleSubtask,
  addScheduleItem,
  deleteScheduleItem,
  addExam,
  deleteExam,
  updateSettings,
  checkRecurringTasksReset,
  completeRecurringTask
} from './src/state.js';

import {
  uploadCustomSound,
  clearCustomSound,
  playAlarm,
  stopAlarm
} from './src/audio.js';

import {
  initTimer,
  startTimer,
  stopTimer,
  resetTimer,
  setTimerMode,
  getTimerState
} from './src/timer.js';

import {
  renderTaskCard,
  renderScheduleItem,
  renderExamCountdown,
  updateProgressRing,
  renderWeeklyChart
} from './src/components.js';

// Alert cache to prevent repeated notification triggers
const notifiedTasks = new Set();
const notifiedExams = new Set();
let activeFilter = 'all';
let activeTimetableDay = new Date().getDay(); // Default to current day (0-6)

// Track subtask input items in the task editor modal
let currentModalSubtasks = [];

// Initialize application on load
window.addEventListener('DOMContentLoaded', async () => {
  // Load state and trigger recurring checks
  loadState();
  checkRecurringTasksReset();

  // Initialize focus timer ticker
  initTimer(updateTimerUI, showAlarmTriggerModal);

  // Wire up state subscription to keep UI fresh
  subscribe(renderUI);

  // Sync initial UI
  renderUI(getState());

  // Setup DOM Event Handlers
  setupEventListeners();

  // Start background monitoring loops
  startRealtimeMonitors();

  // Check notification permission state
  syncNotificationButtonState();

  // Register service worker for PWA offline capability
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('ZenStudy PWA: Service Worker registered successfully on scope:', reg.scope);
    } catch (err) {
      console.warn('ZenStudy PWA: Service Worker registration failed:', err);
    }
  }
});

/* ================= RENDER PIPELINES ================= */

function renderUI(state) {
  // Update Profile elements
  const username = state.settings.username || 'Rohith';
  const role = state.settings.userRole || 'Premium Student';
  
  const displayUser = document.getElementById('display-username');
  if (displayUser) displayUser.textContent = username;
  
  const displayRole = document.getElementById('display-user-role');
  if (displayRole) displayRole.textContent = role;
  
  const displayAvatar = document.getElementById('display-avatar');
  if (displayAvatar) displayAvatar.textContent = username.charAt(0).toUpperCase();

  // 1. Dynamic Greeting
  updateGreeting(username);

  // 2. Sidebar Subjects List
  renderSidebarSubjects(state.subjects);

  // 3. Populate Subject dropdown selectors in forms
  populateFormSubjects(state.subjects);

  // 4. Render Task Checklist
  renderTasksList(state.tasks, state.subjects);

  // 5. Render Class Schedule Timetable
  renderTimetable(state.schedule, state.subjects);

  // 6. Render Exams & Assignments Countdowns
  renderDeadlines(state.exams, state.subjects);

  // 7. Update Stats Counters
  document.getElementById('stat-streak-val').textContent = state.stats.streak;
  document.getElementById('stat-focus-val').textContent = formatFocusTime(state.stats.totalFocusMinutes);
  document.getElementById('stat-done-val').textContent = state.stats.completedCount;

  // 8. Draw Analytics widgets (Radial progress and Weekly SVG bars)
  updateProgressRing(calculateTodayProgress(state.tasks));
  renderWeeklyChart(state.tasks, state.stats);

  // 9. Load Settings Form Inputs
  syncSettingsModalInputs(state.settings);
}

function updateGreeting(username) {
  const hr = new Date().getHours();
  let greet = 'Good evening';
  if (hr < 12) greet = 'Good morning';
  else if (hr < 17) greet = 'Good afternoon';
  
  document.getElementById('greeting-title').textContent = `${greet}, ${username}!`;

  // Motivational quote pool
  const quotes = [
    '"Focus is a muscle, keep training it."',
    '"Success is the sum of small efforts repeated daily."',
    '"Your future depends on what you do today."',
    '"Deep focus unlocks maximum freedom."',
    '"Don\'t study to pass, study to master."'
  ];
  // Select quote based on the current day to keep it consistent for the day
  const dayIndex = new Date().getDate() % quotes.length;
  document.getElementById('motivational-quote').textContent = quotes[dayIndex];
}

function formatFocusTime(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function calculateTodayProgress(tasks) {
  const todayStr = new Date().toISOString().split('T')[0];
  
  const todayTasks = tasks.filter(task => {
    // Regular task due today or completed today
    const isDueToday = task.dueDate && task.dueDate.split('T')[0] === todayStr;
    const isDoneToday = task.completed && task.completedAt && task.completedAt.split('T')[0] === todayStr;
    // Recurring task active today
    const isRecurringActive = task.recurring !== 'none';
    
    return isDueToday || isDoneToday || isRecurringActive;
  });

  if (todayTasks.length === 0) return 0;

  const completedTodayCount = todayTasks.filter(task => {
    if (task.completed) {
      if (task.recurring !== 'none') {
        return task.completedDates && task.completedDates.includes(todayStr);
      }
      return true;
    }
    return false;
  }).length;

  return Math.round((completedTodayCount / todayTasks.length) * 100);
}

function renderSidebarSubjects(subjects) {
  const container = document.getElementById('sidebar-subject-list');
  container.innerHTML = '';
  
  subjects.forEach(subject => {
    const el = document.createElement('div');
    el.className = 'subject-item';
    el.innerHTML = `
      <div class="subject-dot-label">
        <span class="subject-dot" style="color: hsl(${subject.color}, 80%, 50%)"></span>
        <span>${escapeHTML(subject.name)}</span>
      </div>
      <button class="delete-subj-btn" data-id="${subject.id}" title="Delete Subject">🗑️</button>
    `;
    
    el.querySelector('.delete-subj-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete subject "${subject.name}"? This removes schedule linkages.`)) {
        deleteSubject(subject.id);
      }
    });
    
    container.appendChild(el);
  });
}

function populateFormSubjects(subjects) {
  const selectIds = ['task-subject', 'schedule-subject', 'exam-subject'];
  selectIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    
    // Retain default option
    const firstOption = select.options[0] ? select.options[0].outerHTML : '';
    select.innerHTML = firstOption;
    
    subjects.forEach(subject => {
      const opt = document.createElement('option');
      opt.value = subject.id;
      opt.textContent = subject.name;
      select.appendChild(opt);
    });
  });
}

function renderTasksList(tasks, subjects) {
  const container = document.getElementById('main-task-list');
  container.innerHTML = '';

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredTasks = tasks.filter(task => {
    if (activeFilter === 'completed') return task.completed;
    if (activeFilter === 'pending') return !task.completed;
    if (activeFilter === 'high') return task.priority === 'high' && !task.completed;
    if (activeFilter === 'today') {
      const isDueToday = task.dueDate && task.dueDate.split('T')[0] === todayStr;
      const isRecurring = task.recurring !== 'none';
      return (isDueToday || isRecurring) && !task.completed;
    }
    return true; // 'all' filter
  });

  if (filteredTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>No tasks found in this section. Add some focus items!</p>
      </div>
    `;
    return;
  }

  // Sort: High priority first, then chronologically by due date
  filteredTasks.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const prioScore = { high: 3, medium: 2, low: 1 };
    if (prioScore[b.priority] !== prioScore[a.priority]) {
      return prioScore[b.priority] - prioScore[a.priority];
    }
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  filteredTasks.forEach(task => {
    const card = renderTaskCard(
      task,
      subjects,
      handleTaskToggle,
      handleTaskDelete,
      handleTaskEdit,
      handleSubtaskToggle
    );
    container.appendChild(card);
  });
}

function renderTimetable(schedule, subjects) {
  const container = document.getElementById('class-schedule-list');
  container.innerHTML = '';
  
  // Filter class schedule by the SELECTED day of the week
  const todaysSchedule = schedule.filter(item => item.dayOfWeek === activeTimetableDay);
  
  // Update header title dynamically
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const titleEl = document.querySelector('#view-schedule h2');
  if (titleEl) {
    const todayDay = new Date().getDay();
    titleEl.textContent = activeTimetableDay === todayDay ? "Today's Timetable" : `${days[activeTimetableDay]}'s Timetable`;
  }

  // Update active states on day selector buttons
  document.querySelectorAll('.timetable-day-selector .day-tab-btn').forEach(btn => {
    const day = parseInt(btn.dataset.day, 10);
    if (day === activeTimetableDay) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (todaysSchedule.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px 0;">
        <p style="font-size: 0.8rem;">No classes scheduled for this day.</p>
      </div>
    `;
    return;
  }
  
  todaysSchedule.forEach(item => {
    const card = renderScheduleItem(item, subjects, deleteScheduleItem);
    container.appendChild(card);
  });
}

function renderDeadlines(exams, subjects) {
  const container = document.getElementById('upcoming-exams-list');
  container.innerHTML = '';
  
  const futureExams = exams.filter(exam => new Date(exam.date) > new Date());
  
  if (futureExams.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px 0;">
        <p style="font-size: 0.8rem;">No upcoming deadlines scheduled.</p>
      </div>
    `;
    return;
  }
  
  futureExams.slice(0, 5).forEach(exam => {
    const card = renderExamCountdown(exam, subjects, deleteExam);
    container.appendChild(card);
  });
}

/* ================= EVENT HANDLERS ================= */

function handleTaskToggle(taskId) {
  const state = getState();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const cardEl = document.querySelector(`.task-card[data-id="${taskId}"]`);
  
  if (!task.completed) {
    // Sparkle Confetti on card if marking completed
    triggerConfetti(cardEl);
    
    // Complete logic based on recurrence
    if (task.recurring !== 'none') {
      completeRecurringTask(taskId);
    } else {
      updateTask(taskId, { completed: true });
    }
  } else {
    // Uncheck task
    updateTask(taskId, { completed: false });
  }
}

function handleSubtaskToggle(taskId, subtaskId) {
  toggleSubtask(taskId, subtaskId);
}

function handleTaskDelete(id) {
  if (confirm('Are you sure you want to delete this task?')) {
    deleteTask(id);
  }
}

function handleTaskEdit(task) {
  // Pre-fill fields for editing
  document.getElementById('task-edit-id').value = task.id;
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-desc').value = task.description;
  document.getElementById('task-subject').value = task.subjectId || '';
  document.getElementById('task-priority').value = task.priority;
  document.getElementById('task-due').value = task.dueDate || '';
  document.getElementById('task-recurring').value = task.recurring;
  
  // Load subtask inputs
  currentModalSubtasks = task.subtasks.map(st => st.title);
  renderModalSubtaskInputs();
  
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  openModal('task-modal');
}

function setupEventListeners() {
  // Modal toggle controllers
  document.getElementById('btn-create-task').addEventListener('click', () => {
    document.getElementById('task-form').reset();
    document.getElementById('task-edit-id').value = '';
    document.getElementById('task-modal-title').textContent = 'Create Task';
    currentModalSubtasks = [];
    renderModalSubtaskInputs();
    openModal('task-modal');
  });
  
  document.getElementById('btn-add-subject').addEventListener('click', () => {
    document.getElementById('subject-form').reset();
    openModal('subject-modal');
  });
  
  document.getElementById('btn-add-schedule').addEventListener('click', () => {
    document.getElementById('schedule-form').reset();
    document.getElementById('schedule-day').value = activeTimetableDay;
    openModal('schedule-modal');
  });

  // Day selector tab clicks
  document.querySelectorAll('.timetable-day-selector .day-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeTimetableDay = parseInt(e.currentTarget.dataset.day, 10);
      renderTimetable(getState().schedule, getState().subjects);
    });
  });
  
  document.getElementById('btn-add-exam').addEventListener('click', () => {
    document.getElementById('exam-form').reset();
    openModal('exam-modal');
  });

  // TAB NAVIGATION CONTROLLER (Mobile and Desktop)
  const tabElements = document.querySelectorAll('[data-tab]');
  tabElements.forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = el.getAttribute('data-tab');
      
      // Sync active states in nav elements
      tabElements.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      
      // Toggle page section displays
      document.querySelectorAll('.page-section').forEach(sec => {
        sec.classList.remove('active');
      });
      const activeSec = document.getElementById(`view-${tabId}`);
      if (activeSec) {
        activeSec.classList.add('active');
      }
      
      // Auto close any modals
      closeAllModals();
    });
  });

  // Preset color selector in subject modal
  document.querySelectorAll('.color-preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.color-preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      const hue = chip.dataset.hue;
      const slider = document.getElementById('subject-color');
      const preview = document.getElementById('subject-color-preview');
      
      if (slider) {
        slider.value = hue;
        // Trigger input event to update preview glow
        slider.dispatchEvent(new Event('input'));
      }
    });
  });

  // Modal Closers
  const modalClosers = [
    { btn: 'task-modal-close', modal: 'task-modal' },
    { btn: 'btn-cancel-task', modal: 'task-modal' },
    { btn: 'subject-modal-close', modal: 'subject-modal' },
    { btn: 'btn-cancel-subject', modal: 'subject-modal' },
    { btn: 'schedule-modal-close', modal: 'schedule-modal' },
    { btn: 'btn-cancel-schedule', modal: 'schedule-modal' },
    { btn: 'exam-modal-close', modal: 'exam-modal' },
    { btn: 'btn-cancel-exam', modal: 'exam-modal' },
    { btn: 'settings-modal-close', modal: 'settings-modal' }
  ];
  
  modalClosers.forEach(item => {
    const el = document.getElementById(item.btn);
    if (el) {
      el.addEventListener('click', () => closeModal(item.modal));
    }
  });

  // Task Filter Tabs
  document.querySelectorAll('.filter-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFilter = e.target.dataset.filter;
      renderTasksList(getState().tasks, getState().subjects);
    });
  });

  // SUBTASK BUILDER EVENTS IN TASK MODAL
  document.getElementById('btn-add-subtask-input').addEventListener('click', () => {
    currentModalSubtasks.push('');
    renderModalSubtaskInputs();
  });

  // SUBMIT HANDLERS FOR FORMS
  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('task-edit-id').value;
    
    // Compile subtasks from form
    const subtaskInputs = document.querySelectorAll('.subtask-builder-input');
    const subtasks = Array.from(subtaskInputs).map(inp => inp.value.trim()).filter(val => val !== '');
    
    const taskDetails = {
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-desc').value,
      subjectId: document.getElementById('task-subject').value || null,
      priority: document.getElementById('task-priority').value,
      dueDate: document.getElementById('task-due').value,
      recurring: document.getElementById('task-recurring').value,
      subtasks
    };
    
    if (editId) {
      // Re-map subtasks to keep completions if possible, otherwise reset
      const existingTask = getState().tasks.find(t => t.id === editId);
      const updatedSubtasks = subtasks.map(title => {
        const found = existingTask && existingTask.subtasks.find(st => st.title === title);
        return {
          id: found ? found.id : 'subtask-' + Date.now() + '-' + Math.random(),
          title,
          completed: found ? found.completed : false
        };
      });
      
      updateTask(editId, { ...taskDetails, subtasks: [] }); // Clear subtask templates
      updateTask(editId, { subtasks: updatedSubtasks });
    } else {
      addTask(taskDetails);
    }
    closeModal('task-modal');
  });

  document.getElementById('subject-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('subject-name').value;
    const color = document.getElementById('subject-color').value;
    addSubject(name, color);
    closeModal('subject-modal');
  });

  // Subject color preview update
  document.getElementById('subject-color').addEventListener('input', (e) => {
    const preview = document.getElementById('subject-color-preview');
    preview.style.background = `hsl(${e.target.value}, 80%, 50%)`;
    preview.style.boxShadow = `0 0 10px hsl(${e.target.value}, 80%, 50%)`;
  });

  document.getElementById('schedule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addScheduleItem({
      subjectId: document.getElementById('schedule-subject').value,
      dayOfWeek: document.getElementById('schedule-day').value,
      startTime: document.getElementById('schedule-start').value,
      endTime: document.getElementById('schedule-end').value,
      location: document.getElementById('schedule-location').value
    });
    closeModal('schedule-modal');
  });

  document.getElementById('exam-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addExam({
      title: document.getElementById('exam-title').value,
      subjectId: document.getElementById('exam-subject').value || null,
      date: document.getElementById('exam-date').value
    });
    closeModal('exam-modal');
  });

  // POMODORO CONTROLS
  document.getElementById('btn-timer-toggle').addEventListener('click', () => {
    const { isRunning } = getTimerState();
    if (isRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  document.getElementById('btn-timer-reset').addEventListener('click', () => {
    resetTimer();
  });

  document.getElementById('timer-mode-work').addEventListener('click', () => {
    setTimerMode('work');
    document.getElementById('timer-mode-work').classList.add('active');
    document.getElementById('timer-mode-break').classList.remove('active');
  });

  document.getElementById('timer-mode-break').addEventListener('click', () => {
    setTimerMode('break');
    document.getElementById('timer-mode-break').classList.add('active');
    document.getElementById('timer-mode-work').classList.remove('active');
  });

  // ALARM DISMISS MODAL
  document.getElementById('btn-dismiss-alarm-ring').addEventListener('click', () => {
    stopAlarm();
    closeModal('alarm-trigger-modal');
  });

  // SETTINGS CONTROLS
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const work = parseInt(document.getElementById('settings-pomo-work').value, 10) || 25;
    const breakVal = parseInt(document.getElementById('settings-pomo-break').value, 10) || 5;
    const sound = document.getElementById('settings-sound-select').value;
    const username = document.getElementById('settings-username').value.trim() || 'Rohith';
    const userRole = document.getElementById('settings-user-role').value.trim() || 'Premium Student';
    
    updateSettings({
      pomodoroWork: work,
      pomodoroBreak: breakVal,
      selectedSound: sound,
      username,
      userRole
    });
    
    resetTimer(); // Reset clock with new settings
    closeModal('settings-modal');
    alert('Settings applied successfully!');
  });

  // Push notifications permission asker
  document.getElementById('btn-toggle-notifications').addEventListener('click', async () => {
    if (Notification.permission === 'default') {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        updateSettings({ notificationsEnabled: true });
      }
    } else if (Notification.permission === 'granted') {
      const state = getState();
      updateSettings({ notificationsEnabled: !state.settings.notificationsEnabled });
    } else {
      alert('Notification access is blocked by your browser settings. Please enable them in browser site settings.');
    }
    syncNotificationButtonState();
  });

  // Custom song uploader events
  const uploaderZone = document.getElementById('audio-uploader-zone');
  const fileInput = document.getElementById('custom-audio-file-input');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB threshold. Choose a shorter track.');
        return;
      }
      
      uploaderZone.style.borderColor = 'hsl(var(--color-success))';
      uploaderZone.querySelector('.uploader-icon').textContent = '⏳';
      uploaderZone.querySelector('span:not(.file-hint)').textContent = 'Uploading song to local storage...';
      
      try {
        await uploadCustomSound(file);
        uploaderZone.style.borderColor = '';
        uploaderZone.querySelector('.uploader-icon').textContent = '🎵';
        uploaderZone.querySelector('span:not(.file-hint)').textContent = 'Drag & drop your alarm song here or browse';
      } catch (err) {
        console.error('File upload failed:', err);
        alert('Custom song upload failed. Ensure format is suitable.');
        uploaderZone.style.borderColor = '';
      }
    }
  });

  document.getElementById('btn-delete-custom-audio').addEventListener('click', async () => {
    if (confirm('Delete saved custom song?')) {
      await clearCustomSound();
    }
  });

  // Custom audio testing playback controllers
  document.getElementById('btn-test-sound').addEventListener('click', async () => {
    const sound = document.getElementById('settings-sound-select').value;
    document.getElementById('btn-test-sound').style.display = 'none';
    document.getElementById('btn-stop-test-sound').style.display = 'block';
    await playAlarm(sound, false); // Play once for testing
  });

  document.getElementById('btn-stop-test-sound').addEventListener('click', () => {
    stopAlarm();
    document.getElementById('btn-stop-test-sound').style.display = 'none';
    document.getElementById('btn-test-sound').style.display = 'block';
  });
}

function renderModalSubtaskInputs() {
  const container = document.getElementById('subtask-inputs-list');
  container.innerHTML = '';
  
  currentModalSubtasks.forEach((val, idx) => {
    const row = document.createElement('div');
    row.className = 'subtask-input-row';
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <input type="text" class="subtask-builder-input" value="${escapeHTML(val)}" placeholder="Step ${idx + 1} detail..." style="flex-grow: 1;">
      <button type="button" class="btn-secondary remove-subtask-input-btn" data-index="${idx}" style="padding: 8px 12px; color: hsl(var(--color-danger)); border-color: rgba(239,68,68,0.15)">✕</button>
    `;
    
    row.querySelector('.remove-subtask-input-btn').addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      currentModalSubtasks.splice(index, 1);
      renderModalSubtaskInputs();
    });
    
    // Save state on typing
    row.querySelector('input').addEventListener('input', (e) => {
      currentModalSubtasks[idx] = e.target.value;
    });

    container.appendChild(row);
  });
}

/* ================= POMODORO TIMER GRAPHIC INTERACTION ================= */

function updateTimerUI({ timeLeft, isRunning, mode }) {
  // 1. Digital Clock
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  document.getElementById('timer-text').textContent = `${mins}:${secs}`;
  
  // 2. Button Icon Switch
  const toggleBtn = document.getElementById('btn-timer-toggle');
  toggleBtn.textContent = isRunning ? '⏸' : '▶';

  // 3. SVG Radial Progress Sweep
  // Circumference = 2 * PI * 68 = 427.256
  const maxTime = (mode === 'work' ? getState().settings.pomodoroWork : getState().settings.pomodoroBreak) * 60;
  const ring = document.getElementById('timer-ring');
  
  if (ring) {
    const progress = timeLeft / maxTime;
    const offset = progress * 427.25;
    ring.style.strokeDashoffset = 427.25 - offset;
  }
}

function showAlarmTriggerModal(finishedMode) {
  const modal = document.getElementById('alarm-trigger-modal');
  const title = document.getElementById('alarm-trigger-title');
  const body = document.getElementById('alarm-trigger-body');
  
  if (finishedMode === 'work') {
    title.textContent = 'Study Session Finished!';
    body.textContent = 'Fantastic concentration! Your focus alarm is ringing. Take a break to restore your energy.';
  } else {
    title.textContent = 'Break Period Finished!';
    body.textContent = 'Break is over! Your alarm is ringing. Get back into focus mode whenever you are ready.';
  }
  
  openModal('alarm-trigger-modal');
}

/* ================= BACKGROUND SCHEDULERS & SYSTEM SYNC ================= */

function startRealtimeMonitors() {
  // Check deadlines, assignments and trigger audio alert songs
  setInterval(() => {
    const { tasks, exams, settings } = getState();
    const now = new Date();
    
    // Monitor 1: Standard Tasks/Homework due dates
    tasks.forEach(task => {
      if (task.completed || !task.dueDate) return;
      
      const dueTime = new Date(task.dueDate).getTime();
      const diffMins = (dueTime - now.getTime()) / (1000 * 60);
      
      // If task due in next 10 minutes and not alerted yet
      if (diffMins > 0 && diffMins <= 10 && !notifiedTasks.has(task.id)) {
        notifiedTasks.add(task.id);
        
        // Push notification popup
        if (settings.notificationsEnabled && Notification.permission === 'granted') {
          new Notification('Upcoming Homework Alert!', {
            body: `"${task.title}" is due in ${Math.round(diffMins)} minutes!`,
            requireInteraction: true
          });
        }
        
        // Play song
        playAlarm(settings.selectedSound, false);
      }
    });

    // Monitor 2: Exam / Major Countdowns
    exams.forEach(exam => {
      if (!exam.date) return;
      const examTime = new Date(exam.date).getTime();
      const diffMins = (examTime - now.getTime()) / (1000 * 60);

      // Alert 60 minutes before
      if (diffMins > 0 && diffMins <= 60 && !notifiedExams.has(exam.id)) {
        notifiedExams.add(exam.id);

        if (settings.notificationsEnabled && Notification.permission === 'granted') {
          new Notification('Major Deadline Warning!', {
            body: `"${exam.title}" is starting in 1 hour! Get prepared.`,
            requireInteraction: true
          });
        }

        playAlarm(settings.selectedSound, false);
      }
    });
  }, 15000); // Pulse check every 15 seconds

  // Live timetable scanner to auto-refresh class agenda (highlighting active classes in real-time)
  setInterval(() => {
    renderTimetable(getState().schedule, getState().subjects);
  }, 60000); // Pulse check every 60 seconds
}

function syncNotificationButtonState() {
  const btn = document.getElementById('btn-toggle-notifications');
  if (!btn) return;

  if (Notification.permission === 'denied') {
    btn.textContent = 'Blocked';
    btn.style.color = 'hsl(var(--color-danger))';
    btn.style.borderColor = 'hsla(var(--color-danger), 0.2)';
  } else if (Notification.permission === 'granted') {
    const enabled = getState().settings.notificationsEnabled;
    btn.textContent = enabled ? 'Enabled' : 'Disabled';
    btn.style.color = enabled ? 'hsl(var(--color-success))' : 'hsl(var(--text-secondary))';
    btn.style.borderColor = enabled ? 'hsla(var(--color-success), 0.2)' : '';
  } else {
    btn.textContent = 'Request Access';
    btn.style.color = 'hsl(var(--color-accent))';
    btn.style.borderColor = 'hsla(var(--color-accent), 0.2)';
  }
}

function syncSettingsModalInputs(settings) {
  const select = document.getElementById('settings-sound-select');
  if (select) select.value = settings.selectedSound;
  
  const workInput = document.getElementById('settings-pomo-work');
  if (workInput) workInput.value = settings.pomodoroWork;
  
  const breakInput = document.getElementById('settings-pomo-break');
  if (breakInput) breakInput.value = settings.pomodoroBreak;

  const usernameInput = document.getElementById('settings-username');
  if (usernameInput) usernameInput.value = settings.username || '';

  const userRoleInput = document.getElementById('settings-user-role');
  if (userRoleInput) userRoleInput.value = settings.userRole || '';

  const box = document.getElementById('custom-audio-active-box');
  const nameSpan = document.getElementById('custom-audio-filename');
  
  if (settings.customSoundName) {
    if (nameSpan) nameSpan.textContent = settings.customSoundName;
    if (box) box.style.display = 'flex';
  } else {
    if (box) box.style.display = 'none';
  }
  
  syncNotificationButtonState();
}

/* ================= MODAL OPERATIONS ================= */

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');
  }
  // Always stop test alarm sounds if modal closes
  stopAlarm();
  const testBtn = document.getElementById('btn-test-sound');
  const stopBtn = document.getElementById('btn-stop-test-sound');
  if (testBtn) testBtn.style.display = 'block';
  if (stopBtn) stopBtn.style.display = 'none';
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    closeModal(m.id);
  });
}

/* ================= PREMIUM UI PARTICLE EFFECTS ================= */

function triggerConfetti(cardEl) {
  if (!cardEl) return;
  const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
  
  for (let i = 0; i < 40; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    
    // Position inside card boundaries
    particle.style.left = `${Math.random() * 95}%`;
    particle.style.top = `${Math.random() * 80}%`;
    
    // Custom drift and timings
    particle.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
    particle.style.animationDelay = `${Math.random() * 0.15}s`;
    particle.style.animationDuration = `${0.7 + Math.random() * 0.7}s`;
    
    cardEl.appendChild(particle);
    
    // Auto purge
    setTimeout(() => {
      particle.remove();
    }, 1500);
  }
}

// Utility to escape HTML strings safely
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
