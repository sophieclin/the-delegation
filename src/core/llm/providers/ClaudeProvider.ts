import Anthropic from '@anthropic-ai/sdk';
import { LLMMessage, LLMProvider, LLMResponse, LLMToolCall, LLMToolDefinition } from '../types';
import { CLAUDE_MODELS } from '../constants';

type Block = Anthropic.ContentBlockParam;
type Turn = { role: 'user' | 'assistant'; content: Block[] };

const MAX_OUTPUT_TOKENS = 8192;

/**
 * Text-only provider for the Anthropic Messages API.
 *
 * Browser access: this app is bring-your-own-key and calls the API straight from the
 * page, so the SDK needs `dangerouslyAllowBrowser`. The key lives in the user's
 * localStorage and is sent only to api.anthropic.com. Anyone with access to the
 * browser profile (or an XSS bug) could read it, so use a low-limit key for demos.
 */
export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async generateCompletion(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    systemInstruction?: string,
    modelName: string = CLAUDE_MODELS.default
  ): Promise<LLMResponse> {
    // Anthropic takes `system` at the top level: merge it with any system-role messages.
    const system = [systemInstruction, ...messages.filter(m => m.role === 'system').map(m => m.content)]
      .filter(Boolean)
      .join('\n\n');

    const turns = this.mapMessages(messages);

    const claudeTools: Anthropic.Tool[] | undefined = tools?.length
      ? tools.map(t => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
        }))
      : undefined;

    const result = await this.client.messages.create({
      model: modelName,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: system || undefined,
      messages: turns,
      tools: claudeTools,
      output_config: { effort: 'medium' },
    });

    let content: string | null = null;
    const toolCalls: LLMToolCall[] = [];
    for (const block of result.content) {
      if (block.type === 'text') {
        content = (content ?? '') + block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      }
    }

    const promptTokens = result.usage.input_tokens
      + (result.usage.cache_creation_input_tokens ?? 0)
      + (result.usage.cache_read_input_tokens ?? 0);
    const completionTokens = result.usage.output_tokens;

    return {
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      finishReason: result.stop_reason ?? undefined,
      raw: result, // includes `model`, which the cost tracker reads
      request: { contents: turns, systemInstruction: system || undefined, tools: claudeTools },
    };
  }

  /**
   * Convert repo history into valid Anthropic turns.
   *
   * History replay: the app stores assistant messages with `tool_calls`, runs the tools
   * locally and never appends `tool` messages. Anthropic rejects a `tool_use` block that
   * isn't answered by a `tool_result` in the next user turn. We replay past tool calls as
   * real `tool_use` blocks and inject a synthetic `tool_result` ("ok") (option b), rather
   * than flattening them to text, so the model keeps seeing genuine tool calls as the
   * pattern to follow instead of imitating "[called x]" prose.
   *
   * Also: drops system messages, merges consecutive same-role messages, guarantees the
   * list starts with a user turn (history is sliced to the last 10) and ends with one.
   */
  private mapMessages(messages: LLMMessage[]): Turn[] {
    const out: Turn[] = [];
    let pending: Block[] = []; // tool_results owed for the previous assistant turn

    const push = (role: Turn['role'], blocks: Block[]) => {
      if (blocks.length === 0) return;
      const last = out[out.length - 1];
      if (last && last.role === role) last.content.push(...blocks);
      else out.push({ role, content: blocks });
    };
    const flushResultsAsUserTurn = () => {
      push('user', pending);
      pending = [];
    };

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'assistant') {
        if (pending.length > 0) flushResultsAsUserTurn();
        const blocks: Block[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls ?? []) {
          let input: unknown = {};
          try { input = JSON.parse(tc.function.arguments); } catch { /* keep {} */ }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: input as Record<string, unknown> });
          pending.push({ type: 'tool_result', tool_use_id: tc.id, content: 'ok' });
        }
        push('assistant', blocks);
        continue;
      }

      // user / tool -> user turn. tool_result blocks must come first in the turn.
      const blocks: Block[] = pending;
      pending = [];
      const text = m.role === 'tool' ? `[tool result${m.name ? ` from ${m.name}` : ''}] ${m.content}` : m.content;
      for (const img of m.images ?? []) {
        const match = img.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
        if (match) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: match[1] as 'image/png', data: match[2] },
          });
        }
      }
      blocks.push({ type: 'text', text: text || '(continue)' });
      push('user', blocks);
    }

    if (pending.length > 0) flushResultsAsUserTurn();
    if (out.length === 0 || out[0].role !== 'user') {
      out.unshift({ role: 'user', content: [{ type: 'text', text: '(conversation continues)' }] });
    }
    if (out[out.length - 1].role === 'assistant') {
      // Newer models reject a trailing assistant message (no prefill).
      out.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
    }
    return out;
  }
}
