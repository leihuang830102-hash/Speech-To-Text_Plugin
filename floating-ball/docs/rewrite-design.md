# Floating Ball Rewrite Design

## Issues with Current Implementation

1. **Conflicting interactions**: Drag vs long-press on same element doesn't work well with Electron's `-webkit-app-region: drag`
2. **State management**: States get stuck when errors occur
3. **Focus handling**: Cursor doesn't return to previous app after transcription
4. **Python lifecycle**: Multiple places can kill Python, causing race conditions
5. **Timeout handling**: No proper timeout for long-running processes

## Clean Design

### Interaction Model

**Option: Double-click to record, drag to move**

- Single click + drag = move window (Electron's built-in drag)
- Double-click = start recording
- Double-click again (or wait) = stop recording

This gives clear separation:
- Drag is immediate and native
- Recording requires deliberate double-click action

### State Machine

```
┌──────┐  double-click  ┌───────────┐
│ idle │ ───────────────▶│ recording │
└──────┘                 └───────────┘
    ▲                          │
    │                          │ double-click OR 1.5s silence
    │                          ▼
    │                   ┌────────────┐
    │                   │ processing │
    │                   └────────────┘
    │                          │
    └──────────────────────────┘
              success/error
```

### File Structure

```
floating-ball/
├── main.js           # Main process - window, IPC, Python spawn
├── preload.js        # Context bridge for IPC
├── index.html        # HTML structure
├── renderer.js       # Renderer logic - state machine
├── styles.css        # Styling
└── config.json       # Configuration
```

### Key Components

#### 1. main.js (Main Process)

```javascript
// Responsibilities:
// - Create/manage window
// - Handle IPC from renderer
// - Spawn/kill Python process
// - Insert text via robotjs
// - Manage state

// Key design decisions:
// - Python is spawned ONCE per recording
// - Python outputs JSON when done (recording auto-stops on silence)
// - No killPython on stop-recording, let Python finish naturally
// - Add timeout to prevent hangs
```

#### 2. renderer.js (Renderer Process)

```javascript
// Responsibilities:
// - Handle mouse events
// - Detect double-click vs single-click
// - Manage UI state
// - Communicate with main via IPC

// Key design decisions:
// - Double-click detection with 300ms threshold
// - Single click = no action (allows drag)
// - Visual feedback for all states
```

#### 3. styles.css

```css
// Key design decisions:
// - Entire ball is draggable by default
// - No -webkit-app-region: no-drag on the ball
// - Cursor changes based on state
```

### Implementation Checklist

- [x] main.js: Clean IPC handlers
- [x] main.js: Single spawn/kill pattern
- [x] main.js: Proper timeout (60s)
- [x] main.js: Focus return (blur)
- [x] renderer.js: Double-click detection
- [x] renderer.js: State transitions
- [x] styles.css: Drag by default
- [ ] Test: Drag works
- [ ] Test: Double-click records
- [ ] Test: Transcription completes
- [ ] Test: Text inserts
- [ ] Test: Focus returns
