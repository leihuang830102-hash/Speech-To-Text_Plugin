#!/usr/bin/env node
/**
 * Audio Fixture Generator for STT Testing
 *
 * Generates synthetic audio files using TTS for testing speech-to-text accuracy.
 *
 * Usage:
 *   node tests/stt/generate-fixtures.js           # Generate all fixtures
 *   node tests/stt/generate-fixtures.js --check   # Check if TTS is available
 *
 * Requirements (Python):
 *   pip install edge-tts  # Recommended: Microsoft Edge TTS (free, high quality)
 *   # OR
 *   pip install pyttsx3   # Offline TTS (lower quality but works offline)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const PYTHON_PATH = process.env.PYTHON_PATH || 'python';

// Test fixture definitions
const FIXTURES = [
  { id: 'en_short', text: 'This is a test', language: 'en', description: 'Short English phrase' },
  { id: 'en_long', text: 'The quick brown fox jumps over the lazy dog. This is a longer sentence to test transcription accuracy.', language: 'en', description: 'Long English sentence' },
  { id: 'zh_short', text: '这是一个测试', language: 'zh', description: 'Short Chinese phrase' },
  { id: 'zh_long', text: '语音识别是将人类语音转换为文本的技术。这个测试用例用于验证中文语音识别的准确性。', language: 'zh', description: 'Long Chinese sentence' },
  { id: 'en_numbers', text: 'One two three four five six seven eight nine ten', language: 'en', description: 'English numbers' },
  { id: 'zh_numbers', text: '一二三四五六七八九十', language: 'zh', description: 'Chinese numbers' },
];

// Python script for edge-tts
const EDGE_TTS_SCRIPT = `
import asyncio
import sys

async def generate_audio(text, output_file, voice=None):
    import edge_tts

    # Select voice based on language hint
    if voice is None:
        if 'zh' in output_file or 'Chinese' in text:
            voice = "zh-CN-XiaoxiaoNeural"
        else:
            voice = "en-US-AriaNeural"

    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)
    print(f"Generated: {output_file}")

if __name__ == "__main__":
    text = sys.argv[1]
    output = sys.argv[2]
    voice = sys.argv[3] if len(sys.argv) > 3 else None
    asyncio.run(generate_audio(text, output, voice))
`;

// Python script for pyttsx3 (offline fallback)
const PYTTSX3_SCRIPT = `
import pyttsx3
import sys

def generate_audio(text, output_file):
    engine = pyttsx3.init()
    engine.save_to_file(text, output_file)
    engine.runAndWait()
    print(f"Generated: {output_file}")

if __name__ == "__main__":
    text = sys.argv[1]
    output = sys.argv[2]
    generate_audio(text, output)
`;

async function checkTTSAvailability() {
  console.log('\n=== Checking TTS Availability ===\n');

  // Check edge-tts
  try {
    execSync(`"${PYTHON_PATH}" -c "import edge_tts; print('edge-tts available')"`, { stdio: 'pipe' });
    console.log('✓ edge-tts is available (recommended)');
    return 'edge-tts';
  } catch {
    console.log('✗ edge-tts not available');
  }

  // Check pyttsx3
  try {
    execSync(`"${PYTHON_PATH}" -c "import pyttsx3; print('pyttsx3 available')"`, { stdio: 'pipe' });
    console.log('✓ pyttsx3 is available (offline fallback)');
    return 'pyttsx3';
  } catch {
    console.log('✗ pyttsx3 not available');
  }

  console.log('\nNo TTS library available. Install one of:');
  console.log('  pip install edge-tts    # Recommended (high quality)');
  console.log('  pip install pyttsx3     # Offline alternative');
  return null;
}

async function generateWithEdgeTTS(fixture) {
  const outputPath = path.join(FIXTURES_DIR, `${fixture.id}.mp3`);
  const wavPath = path.join(FIXTURES_DIR, `${fixture.id}.wav`);

  const scriptPath = path.join(__dirname, '_edge_tts_temp.py');
  fs.writeFileSync(scriptPath, EDGE_TTS_SCRIPT);

  try {
    // Generate MP3 with edge-tts
    execSync(`"${PYTHON_PATH}" "${scriptPath}" "${fixture.text}" "${outputPath}"`, {
      encoding: 'utf-8',
      timeout: 30000
    });

    // Convert to WAV using ffmpeg (if available)
    try {
      execSync(`ffmpeg -y -i "${outputPath}" -ar 16000 -ac 1 "${wavPath}"`, {
        stdio: 'pipe',
        timeout: 30000
      });
      fs.unlinkSync(outputPath); // Remove MP3
      console.log(`  ✓ ${fixture.id}.wav (${fixture.description})`);
      return true;
    } catch {
      // ffmpeg not available, keep MP3
      console.log(`  ✓ ${fixture.id}.mp3 (${fixture.description}) - install ffmpeg for WAV conversion`);
      return true;
    }
  } catch (error) {
    console.log(`  ✗ ${fixture.id}: ${error.message}`);
    return false;
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function generateWithPyttsx3(fixture) {
  const outputPath = path.join(FIXTURES_DIR, `${fixture.id}.wav`);

  const scriptPath = path.join(__dirname, '_pyttsx3_temp.py');
  fs.writeFileSync(scriptPath, PYTTSX3_SCRIPT);

  try {
    execSync(`"${PYTHON_PATH}" "${scriptPath}" "${fixture.text}" "${outputPath}"`, {
      encoding: 'utf-8',
      timeout: 30000
    });
    console.log(`  ✓ ${fixture.id}.wav (${fixture.description})`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${fixture.id}: ${error.message}`);
    return false;
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

async function generateFixtures() {
  // Ensure fixtures directory exists
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const ttsLib = await checkTTSAvailability();

  if (!ttsLib) {
    console.log('\n=== Manual Recording Instructions ===');
    console.log('Record your own audio files and place them in:');
    console.log(`  ${FIXTURES_DIR}`);
    console.log('\nRequired files:');
    FIXTURES.forEach(f => {
      console.log(`  - ${f.id}.wav: "${f.text}" (${f.description})`);
    });
    return;
  }

  console.log(`\n=== Generating Fixtures using ${ttsLib} ===\n`);

  let success = 0;
  for (const fixture of FIXTURES) {
    if (ttsLib === 'edge-tts') {
      if (await generateWithEdgeTTS(fixture)) success++;
    } else if (ttsLib === 'pyttsx3') {
      if (await generateWithPyttsx3(fixture)) success++;
    }
  }

  console.log(`\n=== Generated ${success}/${FIXTURES.length} fixtures ===`);

  // Generate test cases JSON
  const cases = FIXTURES.map((f, i) => ({
    id: String(i + 1).padStart(3, '0'),
    audio: `${f.id}.wav`,
    expected: f.text,
    language: f.language,
    backend: 'auto',
    model: 'tiny'
  }));

  const casesFile = path.join(__dirname, 'cases.json');
  fs.writeFileSync(casesFile, JSON.stringify({ cases, lastUpdated: new Date().toISOString() }, null, 2));
  console.log(`\nTest cases written to: ${casesFile}`);
}

// Main
const args = process.argv.slice(2);
if (args.includes('--check')) {
  checkTTSAvailability();
} else {
  generateFixtures();
}
