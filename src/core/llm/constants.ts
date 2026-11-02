export const DEFAULT_MODELS = {
  text: 'gemini-3-flash-preview',
  image: 'gemini-3.1-flash-image-preview',
  music: 'lyria-3-clip-preview',
  video: 'veo-3.1-lite-generate-preview'
} as const;

export const AVAILABLE_MODELS = {
  text: [
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview'
  ],
  image: [
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
    'gemini-2.5-flash-image'
  ],
  music: [
    'lyria-3-clip-preview',
    'lyria-3-pro-preview'
  ],
  video: [
    'veo-3.1-lite-generate-preview',
    'veo-3.1-fast-generate-preview',
    'veo-3.1-generate-preview'
  ]
} as const;

export type ModelType = keyof typeof AVAILABLE_MODELS;

// Claude text models (Anthropic Messages API). IDs from the Anthropic models docs, checked 2026-10-06;
// re-verify at https://docs.claude.com/en/docs/about-claude/models before the demo.
export const CLAUDE_MODELS = {
  default: 'claude-haiku-5-5', // fast and cheap, good for the live demo
  available: ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const,
} as const;

export type LLMProviderId = 'claude' | 'gemini';
