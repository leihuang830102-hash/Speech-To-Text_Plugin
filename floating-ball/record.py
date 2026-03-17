#!/usr/bin/env python3
"""
Audio recorder for WebSocket STT with continuous recording support.
Strategy:
  - Speech detected → reset counters
  - 1s silence after speech → output once, mark as "intermediate sent"
  - Continue silence → accumulate to 5s → final stop
  - New speech after intermediate → reset "intermediate sent" flag
"""

import sys
import argparse
import io
import json
import numpy as np

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
    parser.add_argument('--duration', type=int, default=180, help='Max recording duration')
    parser.add_argument('--sample-rate', type=int, default=16000, help='Sample rate')
    parser.add_argument('--silence-threshold', type=float, default=0.01, help='Silence detection threshold')
    parser.add_argument('--intermediate-silence', type=float, default=1.0, help='Silence duration for intermediate output')
    parser.add_argument('--final-silence', type=float, default=5.0, help='Silence duration to stop recording')
    parser.add_argument('--min-duration', type=float, default=0.5, help='Minimum recording time before silence detection')
    parser.add_argument('--chunk-duration', type=float, default=0.1, help='Audio chunk duration')
    args = parser.parse_args()

    # Import sounddevice
    try:
        import sounddevice as sd
    except ImportError:
        print("Error: sounddevice required", file=sys.stderr)
        sys.exit(1)

    sample_rate = args.sample_rate
    silence_threshold = args.silence_threshold
    intermediate_silence = args.intermediate_silence
    final_silence = args.final_silence
    min_duration = args.min_duration
    chunk_duration = args.chunk_duration

    # Recording parameters
    chunk_samples = int(chunk_duration * sample_rate)
    min_samples = int(min_duration * sample_rate)
    intermediate_chunks = int(intermediate_silence / chunk_duration)
    final_chunks = int(final_silence / chunk_duration)
    threshold_value = silence_threshold * 32768

    print(f"Recording config: max={args.duration}s, intermediate={intermediate_silence}s, final={final_silence}s, threshold={threshold_value:.0f}", file=sys.stderr)
    sys.stderr.flush()

    print("Recording...", file=sys.stderr)
    sys.stderr.flush()

    # State tracking
    all_audio = []
    silent_chunks = 0
    last_output_index = 0  # Track which audio has been output
    total_samples = 0
    max_samples = args.duration * sample_rate
    intermediate_sent = False  # Flag: intermediate silence already sent for current silence period

    with sd.InputStream(samplerate=sample_rate, channels=1, dtype='int16') as stream:
        while total_samples < max_samples:
            chunk, overflowed = stream.read(chunk_samples)
            chunk_data = chunk.flatten()
            all_audio.append(chunk_data)
            total_samples += chunk_samples

            # Calculate RMS
            rms = np.sqrt(np.mean(chunk_data.astype(np.float32) ** 2))
            is_silent = rms < threshold_value

            # Skip silence detection during initial period
            if total_samples < min_samples:
                continue

            if is_silent:
                silent_chunks += 1

                # 5s silence → final stop
                if silent_chunks >= final_chunks:
                    # Output any remaining audio
                    if len(all_audio) > last_output_index:
                        audio_data = np.concatenate(all_audio[last_output_index:])
                        wav_data = create_wav(audio_data, sample_rate)
                        sys.stdout.buffer.write(wav_data)
                        sys.stdout.buffer.flush()

                    event = json.dumps({"event": "final_silence"})
                    print(event, file=sys.stderr)
                    sys.stderr.flush()
                    return

                # 1s silence → output intermediate (only once per silence period)
                if silent_chunks >= intermediate_chunks and not intermediate_sent:
                    # Output audio since last output
                    if len(all_audio) > last_output_index:
                        audio_data = np.concatenate(all_audio[last_output_index:])
                        wav_data = create_wav(audio_data, sample_rate)
                        sys.stdout.buffer.write(wav_data)
                        sys.stdout.buffer.flush()

                        event = json.dumps({"event": "intermediate_silence"})
                        print(event, file=sys.stderr)
                        sys.stderr.flush()

                        # Mark these chunks as output
                        last_output_index = len(all_audio)

                    # Mark intermediate as sent for this silence period
                    intermediate_sent = True
            else:
                # Speech detected - reset silence counter and intermediate flag
                silent_chunks = 0
                intermediate_sent = False  # Allow intermediate output for next silence

        # Max duration reached
        if len(all_audio) > last_output_index:
            audio_data = np.concatenate(all_audio[last_output_index:])
            wav_data = create_wav(audio_data, sample_rate)
            sys.stdout.buffer.write(wav_data)
            sys.stdout.buffer.flush()

        event = json.dumps({"event": "max_duration"})
        print(event, file=sys.stderr)
        sys.stderr.flush()


if __name__ == '__main__':
    main()
