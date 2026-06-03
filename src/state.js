// Application State Management

const STORAGE_KEY = 'student_todo_app_state';

// Default subjects to pre-populate for a student if empty
const DEFAULT_SUBJECTS = [
  { id: 'sub-math', name: 'Mathematics', color: '210' },   // Blue (hue value)
  { id: 'sub-physics', name: 'Physics', color: '30' },     // Orange
  { id: 'sub-comp', name: 'Computer Science', color: '145' }, // Green
  { id: 'sub-lit', name: 'Literature', color: '280' },     // Violet
];

const DEFAULT_STATE = {
  subjects: DEFAULT_SUBJECTS,
  tasks: [],
  schedule: [],
  exams: [],
  stats: {
    streak: 0,
    lastCompletionDate: null,
    totalFocusMinutes: 0,
    completedCount: 0
  },
  settings: {
    pomodoroWork: 25,
    pomodoroBreak: 5,
    selectedSound: 'default', // 'default', 'chime', 'bell', 'custom'
    customSoundName: '',
    notificationsEnabled: false,
    username: 'Rohith',
    userRole: 'Premium Student'
  }
};

let state = { ...DEFAULT_STATE };

// Listeners to notify when state changes
const listeners = [];

/**
 * Load state from localStorage
 */
export function loadState() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // Merge with default state structure to handle potential schema updates safely
      state = {
        subjects: parsed.subjects || DEFAULT_SUBJECTS,
        tasks: parsed.tasks || [],
        schedule: parsed.schedule || [],
        exams: parsed.exams || [],
        stats: { ...DEFAULT_STATE.stats, ...(parsed.stats || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
      };
      validateStreak();
    } else {
      state = { ...DEFAULT_STATE };
    }
  } catch (error) {
    console.error('Failed to load state:', error);
    state = { ...DEFAULT_STATE };
  }
  notify();
  return state;
}

/**
 * Save state to localStorage
 */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
  notify();
}

/**
 * Subscribe to state changes
 */
export function subscribe(listener) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notify() {
  listeners.forEach(cb => cb(state));
}

// Getters
export function getState() {
  return state;
}

// SUBJECT ACTIONS
export function addSubject(name, colorHue) {
  const newSubject = {
    id: 'sub-' + Date.now(),
    name,
    color: String(colorHue)
  };
  state.subjects.push(newSubject);
  saveState();
  return newSubject;
}

export function deleteSubject(id) {
  state.subjects = state.subjects.filter(s => s.id !== id);
  // Unset subject in tasks/exams/schedules
  state.tasks = state.tasks.map(t => t.subjectId === id ? { ...t, subjectId: null } : t);
  state.exams = state.exams.map(e => e.subjectId === id ? { ...e, subjectId: null } : e);
  state.schedule = state.schedule.filter(s => s.subjectId !== id);
  saveState();
}

// TASK ACTIONS
export function addTask({ title, description = '', subjectId = null, dueDate = '', priority = 'medium', recurring = 'none', subtasks = [] }) {
  const newTask = {
    id: 'task-' + Date.now(),
    title,
    description,
    subjectId,
    dueDate, // YYYY-MM-DDTHH:MM
    priority, // 'low', 'medium', 'high'
    recurring, // 'none', 'daily', 'weekly'
    completed: false,
    subtasks: subtasks.map((st, i) => ({ id: 'subtask-' + Date.now() + '-' + i, title: st, completed: false })),
    completedDates: [], // Tracking for recurring tasks
    createdAt: new Date().toISOString()
  };
  state.tasks.push(newTask);
  saveState();
  return newTask;
}

export function updateTask(id, updates) {
  state.tasks = state.tasks.map(t => {
    if (t.id === id) {
      const updated = { ...t, ...updates };
      // If task is completed and was not completed before
      if (updates.completed === true && !t.completed) {
        state.stats.completedCount++;
        updateStreak();
        if (t.recurring !== 'none') {
          const todayStr = getTodayString();
          const dates = [...t.completedDates];
          if (!dates.includes(todayStr)) {
            dates.push(todayStr);
          }
          updated.completedDates = dates;
        } else {
          updated.completedAt = new Date().toISOString();
        }
      } else if (updates.completed === false && t.completed) {
        state.stats.completedCount = Math.max(0, state.stats.completedCount - 1);
        if (t.recurring !== 'none') {
          const todayStr = getTodayString();
          updated.completedDates = t.completedDates.filter(d => d !== todayStr);
        } else {
          updated.completedAt = null;
        }
      }
      return updated;
    }
    return t;
  });
  saveState();
}

export function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
}

export function toggleSubtask(taskId, subtaskId) {
  state.tasks = state.tasks.map(t => {
    if (t.id === taskId) {
      const subtasks = t.subtasks.map(st => 
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      );
      return { ...t, subtasks };
    }
    return t;
  });
  saveState();
}

// CLASS SCHEDULE ACTIONS
export function addScheduleItem({ subjectId, dayOfWeek, startTime, endTime, location = '' }) {
  const newItem = {
    id: 'sch-' + Date.now(),
    subjectId,
    dayOfWeek: parseInt(dayOfWeek, 10), // 0=Sunday, 1=Monday, etc.
    startTime, // HH:MM
    endTime, // HH:MM
    location
  };
  state.schedule.push(newItem);
  // Sort schedule items by start time
  state.schedule.sort((a, b) => a.startTime.localeCompare(b.startTime));
  saveState();
  return newItem;
}

export function deleteScheduleItem(id) {
  state.schedule = state.schedule.filter(s => s.id !== id);
  saveState();
}

// EXAM/DEADLINE ACTIONS
export function addExam({ title, subjectId = null, date }) {
  const newExam = {
    id: 'exam-' + Date.now(),
    title,
    subjectId,
    date // YYYY-MM-DDTHH:MM
  };
  state.exams.push(newExam);
  state.exams.sort((a, b) => new Date(a.date) - new Date(b.date));
  saveState();
  return newExam;
}

export function deleteExam(id) {
  state.exams = state.exams.filter(e => e.id !== id);
  saveState();
}

// POMODORO & STATS ACTIONS
export function addFocusMinutes(mins) {
  state.stats.totalFocusMinutes += mins;
  saveState();
}

export function updateSettings(settings) {
  state.settings = { ...state.settings, ...settings };
  saveState();
}

// STREAK & LOGICAL COMPUTATIONS
function getTodayString() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function getYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Increments streak when a task is completed if it hasn't been completed today.
 */
function updateStreak() {
  const todayStr = getTodayString();
  const lastComp = state.stats.lastCompletionDate;

  if (lastComp === todayStr) {
    // Already did a task today, streak is safe but doesn't increase twice today
    return;
  }

  const yesterdayStr = getYesterdayString();
  if (lastComp === yesterdayStr || lastComp === null) {
    // Streak continues!
    state.stats.streak++;
  } else {
    // Reset streak, since there was a gap, but start it at 1 for today
    state.stats.streak = 1;
  }
  state.stats.lastCompletionDate = todayStr;
}

/**
 * Validates if the streak has broken on app load.
 */
function validateStreak() {
  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();
  const lastComp = state.stats.lastCompletionDate;

  if (lastComp && lastComp !== todayStr && lastComp !== yesterdayStr) {
    // Gap detected, streak breaks
    state.stats.streak = 0;
  }
}

/**
 * Automatically resets recurring tasks daily/weekly if completed.
 * Should be run on app load.
 */
export function checkRecurringTasksReset() {
  const todayStr = getTodayString();
  let changed = false;

  state.tasks = state.tasks.map(task => {
    if (task.recurring === 'none') return task;

    const lastCompletedDate = task.completedDates.length > 0 
      ? task.completedDates[task.completedDates.length - 1] 
      : null;

    if (task.completed) {
      if (task.recurring === 'daily' && lastCompletedDate !== todayStr) {
        // Reset daily task for today
        changed = true;
        return {
          ...task,
          completed: false,
          subtasks: task.subtasks.map(st => ({ ...st, completed: false }))
        };
      }
      
      if (task.recurring === 'weekly') {
        // Reset weekly task if more than 7 days have passed since last completion
        if (lastCompletedDate) {
          const diffTime = Math.abs(new Date(todayStr) - new Date(lastCompletedDate));
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays >= 7) {
            changed = true;
            return {
              ...task,
              completed: false,
              subtasks: task.subtasks.map(st => ({ ...st, completed: false }))
            };
          }
        }
      }
    }
    return task;
  });

  if (changed) {
    saveState();
  }
}

/**
 * Completes a recurring task, recording the date it was completed.
 */
export function completeRecurringTask(id) {
  const todayStr = getTodayString();
  state.tasks = state.tasks.map(t => {
    if (t.id === id) {
      const dates = [...t.completedDates];
      if (!dates.includes(todayStr)) {
        dates.push(todayStr);
      }
      state.stats.completedCount++;
      updateStreak();
      return { ...t, completed: true, completedDates: dates };
    }
    return t;
  });
  saveState();
}
