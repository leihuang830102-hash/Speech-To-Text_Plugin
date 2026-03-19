# Streaming Output Implementation Plan

## Goal
Real-time transcription output during recording - see partial results while still speaking.

## Config Changes
```json
{
  "intermediateSilenceDuration": 0.5,
  "finalSilenceDuration": 5.0
}
```

## Implementation Steps

### 1. record.py
- Send audio chunks to stdout immediately
- Send JSON events for silence detection: `{"event": "silence", "duration": 0.5}`
- Continue recording after intermediate silence

### 2. main.js
- Buffer incoming audio chunks
- On silence event from record.py:
  - Send buffered audio to server
  - Display partial result
  - Clear buffer, continue recording
- On final silence (5s): stop recording

### 3. server.py
- Support `partial_transcribe` action
- Return `{"event": "partial_result", "text": "...", "is_final": false}`

## Files to Modify
1. `floating-ball/record.py` - Add chunk streaming
2. `floating-ball/main.js` - Handle intermediate results
3. `src/scripts/stt/server.py` - Support partial transcription
4. `floating-ball/config.json` - Add new config options
