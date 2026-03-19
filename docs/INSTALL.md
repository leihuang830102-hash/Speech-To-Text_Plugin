# OpenCodeTTS Installation Guide

This guide covers two installation options:

1. **Standalone Desktop App** - A floating ball application for Windows
2. **OpenCode Plugin** - Integration with OpenCode IDE

---

## Option 1: Standalone Desktop App (Windows)

### Prerequisites

- **Python 3.8+** with pip
- **Node.js 18+** with npm

### Step 1: Install Python Dependencies

```bash
pip install sounddevice soundfile numpy websockets aiohttp zhconv
pip install openai-whisper  # Optional: for local Whisper backend
```

### Step 2: Configure API Credentials

Run the setup wizard:

```bash
cd floating-ball
npm run setup
```

The wizard will prompt you for:

| Variable | Description | Get from |
|----------|-------------|----------|
| `ASR_APP_ID` | Application ID | [Doubao Console](https://console.volcengine.com/speech/app) |
| `ASR_ACCESS_TOKEN` | Access Token | [Doubao Console](https://console.volcengine.com/speech/app) |
| `ASR_ACCESS_SECRET` | Secret Key | [Doubao Console](https://console.volcengine.com/speech/app) |
| `ASR_CLUSTER` | Cluster ID | Default: `volcengine_streaming_common` |

**API Documentation:** https://www.volcengine.com/docs/6561/80818?lang=zh

### Step 3: Development Mode

```bash
cd floating-ball
npm start
```

### Step 4: Build Windows EXE

```bash
cd floating-ball
npm run build
```

The installer will be created in `floating-ball/dist/`.

### Step 5: Install and Run

1. Run the generated `OpenCodeTTS Setup.exe`
2. Install to your preferred location
3. Launch `OpenCodeTTS.exe`
4. On first run, configure credentials via setup wizard or manually create:
   - `%APPDATA%\OpenCodeTTS\.env`

### Usage

- **Left-click and hold**: Start recording, release to transcribe
- **Right-click**: Open context menu to switch backends or exit

---

## Option 2: OpenCode IDE Plugin

### Prerequisites

- **OpenCode IDE** with plugin support
- **Python 3.8+** with pip
- **Node.js 18+** with npm

### Step 1: Clone and Build

```bash
git clone https://github.com/yourusername/OpenCodeTTS.git
cd OpenCodeTTS
npm install
npm run build
```

### Step 2: Configure API Credentials

Create a `.env` file in your project root:

```env
# Doubao ASR API Configuration
ASR_APP_ID=your_app_id
ASR_ACCESS_TOKEN=your_access_token
ASR_ACCESS_SECRET=your_access_secret
ASR_CLUSTER=volcengine_streaming_common
```

**API Documentation:** https://www.volcengine.com/docs/6561/80818?lang=zh

### Step 3: Install Python Dependencies

```bash
pip install sounddevice soundfile numpy websockets aiohttp python-dotenv zhconv
pip install openai-whisper  # Optional: for local Whisper backend
```

### Step 4: Install Plugin in OpenCode

**Option A: Local Installation**

Copy the built plugin to OpenCode's plugin directory:

```bash
# Linux/macOS
cp -r dist ~/.opencode/plugins/opencode-doubao-tts

# Windows
xcopy /E /I dist %USERPROFILE%\.opencode\plugins\opencode-doubao-tts
```

**Option B: NPM Package (if published)**

```bash
# In OpenCode settings or CLI
opencode plugin install opencode-doubao-tts
```

### Step 5: Use the Plugin

The plugin provides three tools:

#### `voice_check`
Check environment and dependencies:
```
Please check my voice input environment
```

#### `voice_input`
Record and transcribe audio:
```
Use voice input to transcribe what I say
```

#### `voice_backend`
List available backends:
```
List available voice input backends
```

---

## Available STT Backends

| Backend | Speed | Accuracy | Requires Internet |
|---------|-------|----------|-------------------|
| **doubao-cloud** | ~1s | High | Yes |
| **whisper** | ~10s | Good | No |
| **faster-whisper** | ~5s | Good | No |

### Backend Comparison

- **Doubao Cloud** (Recommended): Fast and accurate, requires API credentials
- **Local Whisper**: Offline, slower but no API needed
- **Faster Whisper**: Optimized local option, faster than standard Whisper

---

## Troubleshooting

### Python not found

```bash
# Verify Python is installed and in PATH
python --version

# On Windows, you may need:
py --version
```

### Missing dependencies

```bash
pip install sounddevice soundfile numpy websockets aiohttp python-dotenv zhconv
```

### API Authentication Failed

1. Verify credentials in `.env` file
2. Check API status at https://www.volcengine.com/docs/6561/80818?lang=zh
3. Ensure `ASR_APP_ID`, `ASR_ACCESS_TOKEN`, and `ASR_CLUSTER` are set

### Audio Recording Issues

On Linux, you may need to install PortAudio:
```bash
# Ubuntu/Debian
sudo apt-get install libportaudio2

# Fedora
sudo dnf install portaudio
```

On Windows, ensure your microphone is enabled in Settings > Privacy > Microphone.

---

## Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `.env` | Project root or `%APPDATA%/OpenCodeTTS/` | API credentials |
| `config.json` | `floating-ball/config.json` or `%APPDATA%/OpenCodeTTS/` | App settings |
| `position.json` | `floating-ball/` or `%APPDATA%/OpenCodeTTS/` | Window position |

---

## Support

- **Issues**: https://github.com/yourusername/OpenCodeTTS/issues
- **Doubao API Docs**: https://www.volcengine.com/docs/6561/80818?lang=zh
