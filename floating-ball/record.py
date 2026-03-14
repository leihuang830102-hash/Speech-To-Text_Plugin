#!/usr/bin/env python3
"""
Audio recorder for WebSocket STT.
Records audio and outputs WAV data to stdout.
No model loading - fast startup!
"""

import sys
import argparse
import io

def record_audio(duration=30, sample_rate=16000):
    """Record audio from microphone."""
    try:
        import sounddevice as sd
        import numpy as np
    except ImportError:
        print("Error: sounddevice and numpy required", file=sys.stderr)
        sys.exit(1)

    # Record audio
    print(f"Recording... (max {duration}s)", file=sys.stderr)
    sys.stderr.flush()

    audio_data = sd.rec(
        int(duration * sample_rate),
        samplerate=sample_rate,
        channels=1,
        dtype='int16'
    )
    sd.wait()

    print("Recording stopped.", file=sys.stderr)
    sys.stderr.flush()

    return audio_data.flatten(), sample_rate


def create_wav(audio_data, sample_rate):
    """Create WAV file in memory."""
    try:
        import soundfile as sf
    except ImportError:
        print("Error: soundfile required", file=sys.stderr)
        sys.exit(1)

    buffer = io.BytesIO()
    sf.write(buffer, audio_data, sample_rate, format='WAV')
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description='Record audio for WebSocket STT')
    parser.add_argument('--duration', type=int, default=30, help='Max recording duration')
    parser.add_argument('--sample-rate', type=int, default=16000, help='Sample rate')
    parser.add_argument('--silence-threshold', type=float, default=0.01, help='Silence detection threshold')
    parser.add_argument('--silence-duration', type=float, default=1.5, help='Silence duration to stop (0=disabled)')
    args = parser.parse_args()

    # Record with silence detection
    try:
        import sounddevice as sd
        import numpy as np
    except ImportError:
        print("Error: sounddevice and numpy required", file=sys.stderr)
        sys.exit(1)

    sample_rate = args.sample_rate
    silence_threshold = args.silence_threshold
    silence_duration = args.silence_duration

    print(f"Recording... (speak now)", file=sys.stderr)
    sys.stderr.flush()

    # Record in chunks for silence detection
    chunk_duration = 0.1  # 100ms chunks
    chunk_samples = int(chunk_duration * sample_rate)

    all_audio = []
    silent_chunks = 0
    max_silent_chunks = int(silence_duration / chunk_duration) if silence_duration > 0 else float('inf')

    with sd.InputStream(samplerate=sample_rate, channels=1, dtype='int16') as stream:
        while len(all_audio) * chunk_samples < args.duration * sample_rate:
            chunk, overflowed = stream.read(chunk_samples)
            all_audio.append(chunk.flatten())

            # Check for silence
            rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
            if rms < silence_threshold * 32768:  # Convert to int16 scale
                silent_chunks += 1
                if silent_chunks >= max_silent_chunks and len(all_audio) > 5:
                    break
            else:
                silent_chunks = 0

    print("Recording stopped.", file=sys.stderr)
    sys.stderr.flush()

    # Combine all chunks
    audio_data = np.concatenate(all_audio)

    # Create WAV
    wav_data = create_wav(audio_data, sample_rate)

    # Output WAV to stdout (binary)
    sys.stdout.buffer.write(wav_data)


if __name__ == '__main__':
    main()
