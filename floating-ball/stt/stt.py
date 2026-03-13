#!/usr/bin/env python3
"""
Speech-to-Text script for floating-ball.
Records audio and transcribes using Whisper/Moonshine.
Outputs JSON to stdout.
"""

import os
# Fix OpenMP library conflict on Windows
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import sys
import json
import argparse
from pathlib import Path

def check_dependencies():
    """Check and report available STT backends."""
    backends = []
    missing = []

    try:
        import sounddevice
        backends.append('sounddevice')
    except ImportError:
        missing.append('sounddevice')

    try:
        import numpy
        backends.append('numpy')
    except ImportError:
        missing.append('numpy')

    try:
        from faster_whisper import WhisperModel
        backends.append('faster-whisper')
    except ImportError:
        missing.append('faster-whisper')

    return backends, missing


def record_audio(duration=None, samplerate=16000):
    """Record audio from microphone."""
    import sounddevice as sd
    import numpy as np

    log_info('stt', f'Starting recording (max {duration}s)')

    audio_chunks = []

    def callback(indata, frames, time, status):
        if status:
            log_error('stt', f'Recording status: {status}')
        audio_chunks.append(indata.copy())

    silence_threshold = 0.01
    silence_duration = 1.5
    silence_frames = 0
    max_silence_frames = int(samplerate * silence_duration / 512)

    with sd.InputStream(callback=callback, channels=1, samplerate=samplerate):
        frame_count = 0
        max_frames = int(duration * samplerate / 512) if duration else float('inf')

        while frame_count < max_frames:
            sd.sleep(100)
            frame_count += 1

            if len(audio_chunks) > 0:
                last_chunk = audio_chunks[-1]
                energy = np.abs(last_chunk).mean()
                if energy < silence_threshold:
                    silence_frames += 1
                    if silence_frames >= max_silence_frames:
                        log_info('stt', 'Silence detected, stopping')
                        break
                else:
                    silence_frames = 0

    audio = np.concatenate(audio_chunks, axis=0)
    log_info('stt', f'Recording complete: {len(audio)} samples')
    return audio, samplerate


def transcribe_faster_whisper(audio, samplerate, model_size='tiny', language='zh'):
    """Transcribe using faster-whisper."""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device='cpu', compute_type='int8')
    segments, info = model.transcribe(audio, language=language)

    text = ''.join(segment.text for segment in segments)
    return text, 'faster-whisper', model_size


def transcribe_moonshine(audio, samplerate, model_size='tiny', language='en'):
    """Transcribe using Moonshine."""
    from moonshine_onnx import Moonshine

    model = Moonshine(model_type=model_size)
    text = model.transcribe(audio)
    return text, 'moonshine', model_size


def log_info(module, message):
    """Log info message to stderr."""
    print(f'[INFO] [{module}] {message}', file=sys.stderr, flush=True)


def log_error(module, message):
    """Log error message to stderr."""
    print(f'[ERROR] [{module}] {message}', file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(description='Speech-to-Text')
    parser.add_argument('--backend', default='auto', choices=['auto', 'faster-whisper', 'moonshine'])
    parser.add_argument('--model', default='tiny', choices=['tiny', 'base', 'small', 'medium'])
    parser.add_argument('--language', default='zh')
    parser.add_argument('--duration', type=int, default=30)
    parser.add_argument('--check', action='store_true', help='Check dependencies only')

    args = parser.parse_args()

    if args.check:
        backends, missing = check_dependencies()
        result = {
            'success': True,
            'backends': backends,
            'missing': missing
        }
        print(json.dumps(result))
        return

    try:
        audio, samplerate = record_audio(duration=args.duration)

        backend = args.backend
        if backend == 'auto':
            try:
                from faster_whisper import WhisperModel
                backend = 'faster-whisper'
            except ImportError:
                try:
                    from moonshine_onnx import Moonshine
                    backend = 'moonshine'
                except ImportError:
                    raise RuntimeError('No STT backend available')

        if backend == 'faster-whisper':
            text, used_backend, model = transcribe_faster_whisper(
                audio, samplerate, args.model, args.language
            )
        elif backend == 'moonshine':
            text, used_backend, model = transcribe_moonshine(
                audio, samplerate, args.model, args.language
            )
        else:
            raise RuntimeError(f'Unknown backend: {backend}')

        result = {
            'success': True,
            'text': text.strip(),
            'backend': used_backend,
            'model': model
        }
        print(json.dumps(result))

    except Exception as e:
        log_error('stt', str(e))
        result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(result))
        sys.exit(1)


if __name__ == '__main__':
    main()
