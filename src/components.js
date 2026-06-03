// UI Rendering Components

/**
 * Get color styling details for a subject
 * @param {Array} subjects 
 * @param {string} subjectId 
 * @returns {object} { name, colorHue }
 */
export function getSubjectDetails(subjects, subjectId) {
  if (!subjectId) return { name: 'No Subject', color: '200', isDefault: true };
  const subject = subjects.find(s => s.id === subjectId);
  return subject ? { name: subject.name, color: subject.color, isDefault: false } : { name: 'Unknown Subject', color: '200', isDefault: true };
}

/**
 * Formats date/time into a relative student-friendly format (e.g. "Today at 3:00 PM", "Tomorrow")
 * @param {string} dateStr 
 * @returns {string}
 */
export function formatFriendlyDate(dateStr) {
  if (!dateStr) return 'No due date';
  const date = new Date(dateStr);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${timeStr}`;
}

/**
 * Computes remaining time in days, hours, minutes, and returns HTML structure for glowing countdowns
 * @param {string} dateStr 
 * @returns {object} { text, statusClass }
 */
export function getCountdownInfo(dateStr) {
  if (!dateStr) return { text: '', statusClass: '' };
  const target = new Date(dateStr).getTime();
  const now = new Date().getTime();
  const diff = target - now;
  
  if (diff <= 0) return { text: 'Overdue / Passed', statusClass: 'countdown-overdue' };
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 7) {
    return { text: `${days}d left`, statusClass: 'countdown-safe' };
  } else if (days > 1) {
    return { text: `${days}d ${hours}h left`, statusClass: 'countdown-warning' };
  } else if (days === 1) {
    return { text: `1d ${hours}h left`, statusClass: 'countdown-warning' };
  } else {
    // Under 24 hours
    if (hours > 0) {
      return { text: `${hours}h ${mins}m left`, statusClass: 'countdown-danger' };
    }
    return { text: `${mins}m left!`, statusClass: 'countdown-danger-pulse' };
  }
}

/**
 * Render a Task / Assignment Card
 */
export function renderTaskCard(task, subjects, onToggle, onDelete, onEdit, onToggleSubtask) {
  const { name: subName, color: subHue, isDefault } = getSubjectDetails(subjects, task.subjectId);
  const friendlyDate = formatFriendlyDate(task.dueDate);
  const countdown = task.dueDate && !task.completed ? getCountdownInfo(task.dueDate) : null;
  
  const card = document.createElement('div');
  card.className = `task-card ${task.completed ? 'completed' : ''} priority-${task.priority}`;
  card.style.setProperty('--subject-hue', subHue);
  card.dataset.id = task.id;
  
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;
  const totalSubtasks = task.subtasks.length;
  const progressPercent = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
  
  card.innerHTML = `
    <div class="task-main">
      <label class="custom-checkbox">
        <input type="checkbox" class="task-checkbox-input" ${task.completed ? 'checked' : ''}>
        <span class="checkbox-checkmark"></span>
      </label>
      
      <div class="task-content">
        <h3 class="task-title">${escapeHTML(task.title)}</h3>
        <p class="task-desc">${escapeHTML(task.description)}</p>
        
        <div class="task-meta">
          ${!isDefault ? `<span class="subject-badge" style="background: hsla(${subHue}, 70%, 15%, 0.6); border-color: hsla(${subHue}, 70%, 50%, 0.4); color: hsl(${subHue}, 90%, 75%);">${escapeHTML(subName)}</span>` : ''}
          <span class="priority-badge">${task.priority.toUpperCase()}</span>
          ${task.recurring !== 'none' ? `<span class="recurring-badge" title="Recurring ${task.recurring}">🔄 ${task.recurring}</span>` : ''}
          <span class="due-badge ${countdown ? countdown.statusClass : ''}">${friendlyDate}</span>
          ${countdown ? `<span class="countdown-ticker ${countdown.statusClass}">${countdown.text}</span>` : ''}
        </div>
      </div>
      
      <div class="task-actions">
        <button class="btn-action edit-task-btn" title="Edit Task">✏️</button>
        <button class="btn-action delete-task-btn" title="Delete Task">🗑️</button>
      </div>
    </div>
    
    ${totalSubtasks > 0 ? `
      <div class="subtask-wrapper">
        <div class="subtask-header">
          <span>Subtasks (${completedSubtasks}/${totalSubtasks})</span>
          <div class="subtask-mini-progress">
            <div class="subtask-mini-bar" style="width: ${progressPercent}%"></div>
          </div>
        </div>
        <ul class="subtask-list">
          ${task.subtasks.map(st => `
            <li class="subtask-item ${st.completed ? 'completed' : ''}">
              <label class="custom-sub-checkbox">
                <input type="checkbox" data-subtask-id="${st.id}" ${st.completed ? 'checked' : ''}>
                <span class="sub-checkmark"></span>
                <span class="sub-title">${escapeHTML(st.title)}</span>
              </label>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
  `;
  
  // Bind Event Listeners
  card.querySelector('.task-checkbox-input').addEventListener('change', () => onToggle(task.id));
  card.querySelector('.delete-task-btn').addEventListener('click', () => onDelete(task.id));
  card.querySelector('.edit-task-btn').addEventListener('click', () => onEdit(task));
  
  card.querySelectorAll('.subtask-item input').forEach(input => {
    input.addEventListener('change', (e) => {
      onToggleSubtask(task.id, e.target.dataset.subtaskId);
    });
  });
  
  return card;
}

/**
 * Render Class Timetable Agenda Item
 */
export function renderScheduleItem(item, subjects, onDelete) {
  const { name: subName, color: subHue } = getSubjectDetails(subjects, item.subjectId);
  const itemEl = document.createElement('div');
  
  // Check if current class is active right now
  const now = new Date();
  const currentDay = now.getDay(); // 0-6
  const isToday = currentDay === item.dayOfWeek;
  
  let isActive = false;
  if (isToday) {
    const timeToMinutes = (tStr) => {
      const [h, m] = tStr.split(':').map(Number);
      return h * 60 + m;
    };
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const startMins = timeToMinutes(item.startTime);
    const endMins = timeToMinutes(item.endTime);
    isActive = currentMins >= startMins && currentMins <= endMins;
  }
  
  itemEl.className = `schedule-item ${isActive ? 'active-class' : ''}`;
  itemEl.style.setProperty('--subject-hue', subHue);
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[item.dayOfWeek];
  
  itemEl.innerHTML = `
    <div class="schedule-color-bar"></div>
    <div class="schedule-details">
      <div class="schedule-meta-top">
        <span class="schedule-subject-name">${escapeHTML(subName)}</span>
        ${isActive ? '<span class="live-indicator">● LIVE NOW</span>' : ''}
      </div>
      <div class="schedule-time-place">
        <span>⏰ ${item.startTime} - ${item.endTime} (${dayName})</span>
        ${item.location ? `<span>📍 ${escapeHTML(item.location)}</span>` : ''}
      </div>
    </div>
    <button class="delete-schedule-btn" title="Delete Schedule">🗑️</button>
  `;
  
  itemEl.querySelector('.delete-schedule-btn').addEventListener('click', () => onDelete(item.id));
  return itemEl;
}

/**
 * Render Exam / Deadline Countdown widget
 */
export function renderExamCountdown(exam, subjects, onDelete) {
  const { name: subName, color: subHue } = getSubjectDetails(subjects, exam.subjectId);
  const examDate = new Date(exam.date);
  const countdown = getCountdownInfo(exam.date);
  
  const el = document.createElement('div');
  el.className = 'exam-countdown-card';
  el.style.setProperty('--subject-hue', subHue);
  
  el.innerHTML = `
    <div class="exam-info">
      <h4>${escapeHTML(exam.title)}</h4>
      <div class="exam-badges">
        <span class="subject-badge-small">${escapeHTML(subName)}</span>
        <span>📅 ${examDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${examDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
    <div class="exam-timer-wrapper">
      <div class="countdown-val ${countdown.statusClass}">${countdown.text}</div>
      <button class="delete-exam-btn" title="Delete Deadline">🗑️</button>
    </div>
  `;
  
  el.querySelector('.delete-exam-btn').addEventListener('click', () => onDelete(exam.id));
  return el;
}

/**
 * Render the Custom SVG Radial Progress Ring
 */
export function updateProgressRing(percent) {
  const container = document.getElementById('progress-ring-container');
  if (!container) return;
  
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  
  container.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120" class="progress-svg">
      <defs>
        <linearGradient id="ringGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8b5cf6" />
          <stop offset="100%" stop-color="#06b6d4" />
        </linearGradient>
        <filter id="glowEffect">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <!-- Base circle track -->
      <circle cx="60" cy="60" r="${radius}" class="ring-track" />
      <!-- Animated completion indicator ring -->
      <circle cx="60" cy="60" r="${radius}" class="ring-progress" 
        stroke="url(#ringGlow)" 
        stroke-dasharray="${circumference}" 
        stroke-dashoffset="${offset}"
        filter="url(#glowEffect)"
        transform="rotate(-90 60 60)" />
      <!-- Text inside progress ring -->
      <text x="60" y="65" class="ring-text" text-anchor="middle">
        <tspan class="ring-pct">${percent}%</tspan>
        <tspan x="60" dy="16" class="ring-subtext">Done</tspan>
      </text>
    </svg>
  `;
}

/**
 * Draws a beautiful 7-day custom SVG completion bar chart.
 * Calculates tasks completed per day based on historical stamps.
 */
export function renderWeeklyChart(tasks, stats) {
  const chartEl = document.getElementById('weekly-chart-container');
  if (!chartEl) return;
  
  // Calculate past 7 days starting from today going backward
  const daysData = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    
    // Format label (e.g. "Mon", "Tue")
    const label = d.toLocaleDateString(undefined, { weekday: 'short' });
    
    // Count completions for this day
    let count = 0;
    tasks.forEach(task => {
      // Normal tasks completed check
      if (task.completed && task.completedAt) {
        const completedDateStr = task.completedAt.split('T')[0];
        if (completedDateStr === dayStr) count++;
      }
      // Recurring tasks completed check
      if (task.completedDates && task.completedDates.includes(dayStr)) {
        count++;
      }
    });
    
    daysData.push({ date: dayStr, label, count });
  }
  
  const maxCount = Math.max(...daysData.map(d => d.count), 3); // scale minimum to 3 tasks to avoid empty graphs
  const height = 120;
  const width = 300;
  const padding = 20;
  
  const chartWidth = width - (padding * 2);
  const chartHeight = height - (padding * 2);
  const barWidth = 24;
  const gap = (chartWidth - (barWidth * 7)) / 6;
  
  let barsHTML = '';
  daysData.forEach((day, index) => {
    const barHeight = (day.count / maxCount) * chartHeight;
    const x = padding + index * (barWidth + gap);
    const y = padding + chartHeight - barHeight;
    
    barsHTML += `
      <!-- Bar hover background track -->
      <rect x="${x}" y="${padding}" width="${barWidth}" height="${chartHeight}" rx="4" class="chart-track" />
      
      <!-- Completed tasks bar -->
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" class="chart-bar" fill="url(#barGradient)">
        <title>${day.count} tasks completed on ${day.label}</title>
      </rect>
      
      <!-- Day Label Text -->
      <text x="${x + barWidth / 2}" y="${height - 2}" class="chart-label" text-anchor="middle">${day.label}</text>
      
      <!-- Numeric Completion Counter above active bars -->
      ${day.count > 0 ? `<text x="${x + barWidth / 2}" y="${y - 4}" class="chart-value" text-anchor="middle">${day.count}</text>` : ''}
    `;
  });
  
  chartEl.innerHTML = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" class="stats-svg">
      <defs>
        <linearGradient id="barGradient" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#06b6d4" />
          <stop offset="100%" stop-color="#3b82f6" />
        </linearGradient>
      </defs>
      ${barsHTML}
    </svg>
  `;
}

// Utility to escape HTML and prevent XSS injections
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
