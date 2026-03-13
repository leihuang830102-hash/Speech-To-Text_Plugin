// renderer.js
const ball = document.getElementById('ball');

let isRecording = false;
let stateTimeout = null;

// State management
function setState(newState) {
  clearTimeout(stateTimeout);

  ball.className = 'ball ' + newState;

  // Auto-reset to idle after success/error
  if (newState === 'success') {
    stateTimeout = setTimeout(() => setState('idle'), 500);
  } else if (newState === 'error') {
    stateTimeout = setTimeout(() => setState('idle'), 1000);
  }
}

// Mouse events for recording
ball.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // Left click
    e.preventDefault();
    isRecording = true;
    setState('recording');
    window.electronAPI.startRecording();
  }
});

ball.addEventListener('mouseup', (e) => {
  if (e.button === 0 && isRecording) {
    e.preventDefault();
    isRecording = false;
    setState('processing');
    window.electronAPI.stopRecording();
  }
});

// Handle mouse leaving the ball while recording
ball.addEventListener('mouseleave', () => {
  if (isRecording) {
    isRecording = false;
    setState('processing');
    window.electronAPI.stopRecording();
  }
});

// Prevent context menu
ball.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Listen for state changes from main process
window.electronAPI.onStateChanged((state) => {
  setState(state);
});

// Initialize
setState('idle');
console.log('[renderer] Floating ball initialized');
