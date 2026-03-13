// config-loader.js
import fs from 'fs';

const DEFAULT_CONFIG = {
  python: {
    path: 'python',
    sttScript: './stt/stt.py'
  },
  stt: {
    backend: 'auto',
    modelSize: 'tiny',
    language: 'zh',
    maxDuration: 30
  },
  window: {
    width: 60,
    height: 60,
    rememberPosition: true
  },
  logging: {
    level: 'INFO',
    logToFile: true,
    maxFileSize: 5242880,
    maxFiles: 5,
    maxTotalSize: 20971520,
    maxAge: 604800
  }
};

export function getDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function loadConfig(configPath) {
  const config = getDefaultConfig();

  if (!fs.existsSync(configPath)) {
    return config;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content);
    return mergeConfig(config, userConfig);
  } catch (e) {
    console.error(`Failed to load config: ${e.message}`);
    return config;
  }
}

function mergeConfig(defaults, user, isTopLevel = true) {
  const result = { ...defaults };

  for (const key in user) {
    if (typeof user[key] === 'object' && user[key] !== null && !Array.isArray(user[key])) {
      result[key] = mergeConfig(defaults[key] || {}, user[key], false);
    } else {
      result[key] = user[key];
    }
  }

  // Validation (only at top level)
  if (isTopLevel && result.window) {
    if (result.window.width < 30) result.window.width = 60;
    if (result.window.height < 30) result.window.height = 60;
  }

  return result;
}

export default { loadConfig, getDefaultConfig };
