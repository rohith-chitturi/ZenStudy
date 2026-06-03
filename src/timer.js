// Core Pomodoro / Study Timer Logic
import { addFocusMinutes, getState } from './state.js';
import { playAlarm } from './audio.js';

let timeLeft = 0;
let isRunning = false;
let mode = 'work'; // 'work' | 'break'
let intervalId = null;
let callback = null; // Callback for UI ticks
let notificationCallback = null; // Callback to show dismiss alarm popup in UI

export function initTimer(onTick, onNotificationDismissNeeded) {
  callback = onTick;
  notificationCallback = onNotificationDismissNeeded;
  resetTimer();
}

export function resetTimer() {
  stopTimer();
  const state = getState();
  mode = 'work';
  timeLeft = state.settings.pomodoroWork * 60;
  triggerTick();
}

export function setTimerMode(newMode) {
  stopTimer();
  const state = getState();
  mode = newMode;
  timeLeft = (mode === 'work' ? state.settings.pomodoroWork : state.settings.pomodoroBreak) * 60;
  triggerTick();
}

export function startTimer() {
  if (isRunning) return;
  isRunning = true;
  
  intervalId = setInterval(() => {
    timeLeft--;
    
    if (timeLeft <= 0) {
      handleTimerComplete();
    } else {
      triggerTick();
    }
  }, 1000);
  
  triggerTick();
}

export function stopTimer() {
  isRunning = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  triggerTick();
}

export function getTimerState() {
  return { timeLeft, isRunning, mode };
}

function triggerTick() {
  if (callback) {
    callback({ timeLeft, isRunning, mode });
  }
}

async function handleTimerComplete() {
  stopTimer();
  const state = getState();
  
  // Play the alarm sound (configured song or synthesized) - loop it until dismissed
  await playAlarm(state.settings.selectedSound, true);
  
  let finishedMode = mode;
  if (mode === 'work') {
    // Add completed minutes to user stats
    addFocusMinutes(state.settings.pomodoroWork);
    mode = 'break';
    timeLeft = state.settings.pomodoroBreak * 60;
  } else {
    mode = 'work';
    timeLeft = state.settings.pomodoroWork * 60;
  }
  
  // Trigger system notification
  triggerNotification(finishedMode, state.settings);
  
  // Open the "dismiss alarm" modal in the UI
  if (notificationCallback) {
    notificationCallback(finishedMode);
  }
  
  triggerTick();
}

function triggerNotification(finishedMode, settings) {
  if (settings.notificationsEnabled && Notification.permission === 'granted') {
    const title = finishedMode === 'work' ? 'Study Session Finished!' : 'Break Finished!';
    const body = finishedMode === 'work'
      ? `Awesome job! Take a ${settings.pomodoroBreak} minute break to recharge.`
      : `Break's over! Time to focus for another ${settings.pomodoroWork} minutes.`;
      
    try {
      new Notification(title, {
        body,
        tag: 'pomodoro-alert',
        requireInteraction: true
      });
    } catch (e) {
      console.error('Push notification failed to construct:', e);
    }
  }
}
