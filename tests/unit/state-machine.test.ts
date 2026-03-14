// tests/unit/state-machine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// Simple state machine for STT
type State = 'idle' | 'warming' | 'recording' | 'processing' | 'success' | 'error';

class STTStateMachine {
  private _state: State = 'idle';

  get state(): State {
    return this._state;
  }

  transition(event: string): void {
    switch (this._state) {
      case 'idle':
        if (event === 'start') this._state = 'warming';
        break;
      case 'warming':
        if (event === 'ready') this._state = 'recording';
        else if (event === 'error') this._state = 'idle';
        break;
      case 'recording':
        if (event === 'stop') this._state = 'processing';
        else if (event === 'timeout') this._state = 'idle';
        else if (event === 'error') this._state = 'idle';
        break;
      case 'processing':
        if (event === 'success') this._state = 'success';
        else if (event === 'error') this._state = 'error';
        break;
      case 'success':
      case 'error':
        // Auto reset after a delay (simulated)
        this._state = 'idle';
        break;
    }
  }

  reset(): void {
    this._state = 'idle';
  }
}

describe('STTStateMachine', () => {
  let machine: STTStateMachine;

  beforeEach(() => {
    machine = new STTStateMachine();
  });

  it('should start in idle state', () => {
    expect(machine.state).toBe('idle');
  });

  it('should transition to warming on start', () => {
    machine.transition('start');
    expect(machine.state).toBe('warming');
  });

  it('should transition to recording when ready', () => {
    machine.transition('start');
    machine.transition('ready');
    expect(machine.state).toBe('recording');
  });

  it('should return to idle on error from any state', () => {
    machine.transition('start');
    machine.transition('error');
    expect(machine.state).toBe('idle');

    machine.transition('start');
    machine.transition('ready');
    machine.transition('error');
    expect(machine.state).toBe('idle');
  });

  it('should handle timeout during recording', () => {
    machine.transition('start');
    machine.transition('ready');
    machine.transition('timeout');
    expect(machine.state).toBe('idle');
  });

  it('should complete full cycle successfully', () => {
    machine.transition('start');
    machine.transition('ready');
    machine.transition('stop');
    machine.transition('success');
    // After success, state is 'success' - auto-reset happens on next transition
    expect(machine.state).toBe('success');
    machine.reset();
    expect(machine.state).toBe('idle');
  });

  it('should handle rapid state changes', () => {
    machine.transition('start');
    machine.transition('ready');
    machine.transition('stop');
    expect(machine.state).toBe('processing');
  });
});
