/**
 * Configuration types for the speech-to-text plugin.
 */

export type SttBackend = "moonshine" | "whisper" | "faster-whisper" | "auto";

export type MoonshineModel = "tiny" | "base";
export type WhisperModel = "tiny" | "base" | "small" | "medium" | "large";

export interface SpeechToTextConfig {
  backend?: SttBackend;
  model?: string;
  language?: string;
  maxDuration?: number;
  pythonPath?: string;
  scriptPath?: string;
}

export interface SttResult {
  success: boolean;
  text?: string;
  error?: string;
  backend?: string;
  model?: string;
}

export const DEFAULT_CONFIG: Required<SpeechToTextConfig> = {
  backend: "auto",
  model: "tiny",
  language: "en",
  maxDuration: 30,
  pythonPath: "python3",
  scriptPath: "",
};
