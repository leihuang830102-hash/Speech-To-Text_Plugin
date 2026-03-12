import type { Plugin, PluginContext } from '@opencode-ai/plugin';
import { FloatingVoiceButton } from './components/FloatingVoiceButton';
import { useVoiceInput } from './hooks/useVoiceInput';
import { checkEnvironment, listBackends, DEFAULT_CONFIG } from './services/voice-service';

export interface DoubaoPluginSettings {
  pythonPath: string;
  sttBackend: 'moonshine' | 'whisper' | 'faster-whisper' | 'auto';
  modelSize: string;
  language: string;
  maxDuration: number;
  hotkey: string;
}

export const DoubaoPlugin: Plugin = async (context: PluginContext) => {
  const settings: DoubaoPluginSettings = {
    pythonPath: DEFAULT_CONFIG.pythonPath,
    sttBackend: DEFAULT_CONFIG.sttBackend,
    modelSize: DEFAULT_CONFIG.modelSize,
    language: DEFAULT_CONFIG.language,
    maxDuration: DEFAULT_CONFIG.maxDuration,
    hotkey: DEFAULT_CONFIG.hotkey,
  };

  const env = await checkEnvironment(settings.pythonPath);
  
  console.log('[Doubao] Environment check:', {
    python: env.python,
    backends: env.backends,
    missing: env.missingDeps,
  });

  if (env.missingDeps.length > 0) {
    console.warn(
      `[Doubao] Missing dependencies: ${env.missingDeps.join(', ')}. Install with: pip install ${env.missingDeps.join(' ')}`
    );
  }

  const { insertText } = context;

  const handleVoiceInput = (text: string) => {
    insertText(text);
  };

  return {
    components: {
      FloatingVoiceButton: () => (
        <FloatingVoiceButton
          onVoiceInput={handleVoiceInput}
        />
      ),
    },
    tools: {
      voice_check: {
        description: '检查语音输入插件的环境和依赖',
        execute: async () => {
          const env = await checkEnvironment(settings.pythonPath);
          const backends = await listBackends(settings.pythonPath);
          
          if (backends.length === 0) {
            return `❌ 未检测到可用的语音识别后端。

请安装以下依赖：
\`\`\`bash
pip install sounddevice soundfile numpy faster-whisper
\`\`\`
`;
          }
          
          return `✅ 环境正常

可用的语音识别后端: ${backends.join(', ')}

当前配置:
- 后端: ${settings.sttBackend}
- 模型: ${settings.modelSize}
- 语言: ${settings.language}
- 快捷键: ${settings.hotkey}
`;
        },
      },
      voice_input: {
        description: '通过语音输入文字（按住浮窗或使用快捷键）',
        execute: async () => {
          return '请使用浮窗按钮或快捷键进行语音输入';
        },
      },
    },
    keybindings: {
      [settings.hotkey]: {
        action: 'toggle-voice-input',
        description: '触发语音输入',
      },
    },
  };
};

export default DoubaoPlugin;
