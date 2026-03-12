import React, { useState, useEffect, useCallback } from 'react';

export type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

interface FloatingVoiceButtonProps {
  onVoiceInput: (text: string) => void;
  onStateChange?: (state: VoiceState) => void;
  disabled?: boolean;
}

export function FloatingVoiceButton({
  onVoiceInput,
  onStateChange,
  disabled = false,
}: FloatingVoiceButtonProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  const handleMouseDown = useCallback(async () => {
    if (disabled || state !== 'idle') return;
    
    setState('recording');
    setError(null);
  }, [disabled, state]);

  const handleMouseUp = useCallback(async () => {
    if (disabled || state !== 'recording') return;
    
    setState('processing');
    
    try {
      const { transcribe } = await import('../services/voice-service');
      const result = await transcribe();
      
      if (result.success && result.text) {
        onVoiceInput(result.text);
        setState('idle');
      } else {
        setError(result.error || 'Transcription failed');
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }, [disabled, state, onVoiceInput]);

  const getButtonClass = () => {
    const base = 'doubao-floating-btn';
    switch (state) {
      case 'recording':
        return `${base} ${base}--recording`;
      case 'processing':
        return `${base} ${base}--processing`;
      case 'error':
        return `${base} ${base}--error`;
      default:
        return base;
    }
  };

  return (
    <div className="doubao-floating-container">
      <button
        className={getButtonClass()}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        disabled={disabled}
        title={
          state === 'idle'
            ? '按住说话'
            : state === 'recording'
            ? '松开识别'
            : state === 'processing'
            ? '识别中...'
            : error || '错误'
        }
      >
        <MicrophoneIcon state={state} />
      </button>
      
      {state === 'recording' && (
        <div className="doubao-floating-hint">松开识别</div>
      )}
      
      {state === 'processing' && (
        <div className="doubao-floating-hint">识别中...</div>
      )}
    </div>
  );
}

function MicrophoneIcon({ state }: { state: VoiceState }) {
  if (state === 'processing') {
    return (
      <svg viewBox="0 0 24 24" className="doubao-icon doubao-icon--spin">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="doubao-icon">
      <path
        fill="currentColor"
        d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"
      />
      <path
        fill="currentColor"
        d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
      />
    </svg>
  );
}

export default FloatingVoiceButton;
