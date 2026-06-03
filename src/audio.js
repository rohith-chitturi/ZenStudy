// Custom Audio & Notification Sound Manager
import { saveBlob, getBlob, deleteBlob } from './db.js';
import { updateSettings } from './state.js';

let activeAudio = null;
let audioCtx = null;
let synthIntervalId = null;

/**
 * Lazy initializer for AudioContext to conform to browser autoplay policies
 */
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Handle custom song upload and save to IndexedDB.
 * @param {File} file 
 */
export async function uploadCustomSound(file) {
  if (!file) return;
  
  // Store the audio file as a Blob in IndexedDB
  await saveBlob('custom_alarm_sound', file);
  
  // Update state with name
  updateSettings({
    selectedSound: 'custom',
    customSoundName: file.name
  });
}

/**
 * Clear custom song from IndexedDB.
 */
export async function clearCustomSound() {
  await deleteBlob('custom_alarm_sound');
  updateSettings({
    selectedSound: 'default',
    customSoundName: ''
  });
}

/**
 * Stop any running audio loop.
 */
export function stopAlarm() {
  if (synthIntervalId) {
    clearInterval(synthIntervalId);
    synthIntervalId = null;
  }
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch (e) {
      console.error('Error stopping active audio:', e);
    }
    activeAudio = null;
  }
}

/**
 * Play the configured alarm sound.
 * Supports custom songs (persisted in IndexedDB) and synthesized options.
 * @param {string} soundType - 'default' | 'chime' | 'bell' | 'custom'
 * @param {boolean} loop - whether to loop (for alarms) or play once (for quick alerts)
 */
export async function playAlarm(soundType, loop = false) {
  // Always stop current audio first
  stopAlarm();

  if (soundType === 'custom') {
    try {
      const blob = await getBlob('custom_alarm_sound');
      if (blob) {
        const url = URL.createObjectURL(blob);
        activeAudio = new Audio(url);
        activeAudio.loop = loop;
        
        // Wait for user interaction buffer if autoplay gets blocked
        const playPromise = activeAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn('Autoplay blocked by browser. Notification will sound on next interaction.', error);
          });
        }
        return;
      }
    } catch (err) {
      console.error('Failed to load custom sound from IndexedDB, falling back to synthesizer', err);
    }
    // Fallback to default if custom sound is missing or fails
    soundType = 'default';
  }

  // Synthesize sounds using Web Audio API (zero external assets needed)
  try {
    const ctx = getAudioContext();
    const playSynth = () => {
      if (soundType === 'chime') {
        synthesizeChime(ctx);
      } else if (soundType === 'bell') {
        synthesizeBell(ctx);
      } else {
        synthesizeDefault(ctx);
      }
    };

    playSynth();

    if (loop) {
      let intervalMs = 1500;
      if (soundType === 'chime') intervalMs = 2500;
      if (soundType === 'bell') intervalMs = 3500;
      synthIntervalId = setInterval(playSynth, intervalMs);
    }
  } catch (err) {
    console.error('Web Audio synthesis failed:', err);
  }
}

// Programmatic Sound Synthesizers

function synthesizeDefault(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now); // A5
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15); // Slide up to D6
  
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  osc.stop(now + 0.55);
}

function synthesizeChime(ctx) {
  const now = ctx.currentTime;
  const chord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord (pleasant lofi bell)
  
  chord.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = idx * 0.08;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + delay);
    
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.08, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now + delay);
    osc.stop(now + delay + 1.3);
  });
}

function synthesizeBell(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const subOsc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  // Heavy strike with harmonic sub-bass
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(329.63, now); // E4
  
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(164.81, now); // E3 (lower octave)
  
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
  
  osc.connect(gain);
  subOsc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(now);
  subOsc.start(now);
  
  osc.stop(now + 2.0);
  subOsc.stop(now + 2.0);
}
