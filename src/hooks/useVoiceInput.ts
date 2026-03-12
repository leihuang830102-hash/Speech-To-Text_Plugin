import { useState, useCallback, useEffect } from 'react';
import { transcribe, type SttResult } from '../services/voice-service';

export type VoiceInputState = 'idle' | 'recording' | 'processing' | 'success' | 'error';

export interface UseVoiceInputOptions {
  onSuccess?: (text: string) => void;
  onError?: (error: string) => void;
  language?: string;
  maxDuration?: number;
}

export interface UseVoiceInputReturn {
  state: VoiceInputState;
  result: string | null;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => Promise<void>;
  isRecording: boolean;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onSuccess, onError, language = 'zh', maxDuration = 30 } = options;
  
  const [state, setState] = useState<VoiceInputState>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startRecording = useCallback(() => {
    setState('recording');
    setResult(null);
    setError(null);
  }, []);

  const stopRecording = useCallback(async () => {
    if (state !== 'recording') return;
    
    setState('processing');
    
    try {
      const response: SttResult = await transcribe({
        language,
        maxDuration,
      });
      
      if (response.success && response.text) {
        setResult(response.text);
        setState('success');
        onSuccess?.(response.text);
      } else {
        const errMsg = response.error || 'Transcription failed';
        setError(errMsg);
        setState('error');
        onError?.(errMsg);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
      setState('error');
      onError?.(errMsg);
    }
  }, [state, language, maxDuration, onSuccess, onError]);

  const isRecording = state === 'recording';

  return {
    state,
    result,
    error,
    startRecording,
    stopRecording,
    isRecording,
  };
}

export default useVoiceInput;
