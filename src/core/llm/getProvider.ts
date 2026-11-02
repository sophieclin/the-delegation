import { LLMConfig, LLMProvider } from './types';
import { CLAUDE_MODELS, DEFAULT_MODELS } from './constants';
import { ClaudeProvider } from './providers/ClaudeProvider';
import { GeminiProvider } from './providers/GeminiProvider';

export function getProviderId(config: LLMConfig): 'claude' | 'gemini' {
  return config.provider ?? 'claude';
}

export function getProvider(config: LLMConfig): LLMProvider {
  if (!config.apiKey) {
    throw new Error(`${getProviderId(config) === 'claude' ? 'Anthropic' : 'Gemini'} API key is required`);
  }
  return getProviderId(config) === 'claude' ? new ClaudeProvider(config.apiKey) : new GeminiProvider(config.apiKey);
}

/**
 * Teams in agents.ts carry Gemini model names. Pick a model the active provider understands:
 * use the requested one if it belongs to the provider, else the configured one, else the default.
 */
export function resolveTextModel(config: LLMConfig, requested?: string): string {
  const isClaude = getProviderId(config) === 'claude';
  const fits = (m?: string): m is string => !!m && m.startsWith('claude') === isClaude;
  if (fits(requested)) return requested;
  if (fits(config.model)) return config.model;
  return isClaude ? CLAUDE_MODELS.default : DEFAULT_MODELS.text;
}
