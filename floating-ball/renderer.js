// renderer.js - Floating Ball Renderer Process
// Interaction: Press to start recording, release to stop
const ball = document.getElementById('ball');
const recordBtn = document.getElementById('record-btn');

// ============================================================================
// State Machine
// ============================================================================

let currentState = 'idle'; // idle | recording | processing | success | error
let recordingStartTime = 0;
const MIN_RECORDING_TIME = 500; // Minimum time (ms) to consider it a valid recording

function setState(newState) {
  const oldState = currentState;
  currentState = newState;

  // Update CSS class
  ball.className = 'ball ' + newState;

  console.log(`[renderer] State: ${oldState} -> ${newState}`);
}

// ============================================================================
// Event Handlers
// ============================================================================

// Press: start recording
recordBtn.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Only left click

  e.preventDefault();
  e.stopPropagation();

  if (currentState === 'idle') {
    console.log('[renderer] mousedown: starting recording');
    recordingStartTime = Date.now();
    setState('recording');
    if (window.electronAPI) {
      window.electronAPI.startRecording();
    }
  }
});

// Release: stop recording (only if held long enough)
recordBtn.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;

  e.preventDefault();
  e.stopPropagation();

  if (currentState === 'recording') {
    const heldTime = Date.now() - recordingStartTime;
    console.log(`[renderer] mouseup: held for ${heldTime}ms`);

    if (heldTime >= MIN_RECORDING_TIME) {
      // Held long enough - stop recording
      console.log('[renderer] stopping recording');
      setState('processing');
      if (window.electronAPI) {
        window.electronAPI.stopRecording();
      }
    } else {
      // Held too short - let Python auto-stop on silence
      console.log('[renderer] held too short, waiting for Python auto-stop');
    }
  }
});

// Handle mouse leaving button while recording
recordBtn.addEventListener('mouseleave', (e) => {
  if (currentState === 'recording') {
    const heldTime = Date.now() - recordingStartTime;
    console.log(`[renderer] mouseleave: held for ${heldTime}ms`);

    if (heldTime >= MIN_RECORDING_TIME) {
      setState('processing');
      if (window.electronAPI) {
        window.electronAPI.stopRecording();
      }
    }
  }
});

// Prevent context menu
recordBtn.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Prevent click event from firing
recordBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

// ============================================================================
// IPC: Listen for state changes from main process
// ============================================================================

if (window.electronAPI) {
  window.electronAPI.onStateChanged((state) => {
    console.log(`[renderer] Received state from main: ${state}`);
    setState(state);
  });
}

// ============================================================================
// Initialize
// ============================================================================

setState('idle');
console.log('[renderer] Floating ball initialized (press to record, release to stop)');
