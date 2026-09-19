import axios from 'axios';
import { config } from '../../config';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

function hasImages(messages: LlmMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((b) => b.type === 'image_url')
  );
}

function isOllama(baseUrl: string): boolean {
  return baseUrl.includes('11434') || baseUrl.includes('ollama');
}

// Ollama native /api/chat — properly returns .message.content (not empty like compat layer for thinking models)
async function callOllama(
  baseUrl: string,
  model: string,
  messages: LlmMessage[],
  maxTokens: number
): Promise<LlmResponse> {
  const root = baseUrl.replace(/\/v1\/?$/, '');
  const resp = await axios.post(
    `${root}/api/chat`,
    {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.filter((b) => b.type === 'text').map((b) => (b as any).text).join('\n')
          : m.content,
      })),
      stream: false,
      options: { num_predict: maxTokens },
    },
    { timeout: 120_000 }
  );

  return {
    text: resp.data.message?.content ?? '',
    inputTokens: resp.data.prompt_eval_count ?? 0,
    outputTokens: resp.data.eval_count ?? 0,
  };
}

export async function callLlm(
  messages: LlmMessage[],
  model?: string,
  maxTokens = 2048
): Promise<LlmResponse> {
  const vision = !model && hasImages(messages);

  const resolvedModel  = model ?? (vision ? config.llm.visionModel  : config.llm.model);
  const resolvedApiKey = vision ? config.llm.visionApiKey : config.llm.apiKey;
  const resolvedBase   = vision ? config.llm.visionBaseUrl : config.llm.baseUrl;

  // Use native Ollama API for local models (compat layer returns empty content for thinking models)
  if (!vision && isOllama(resolvedBase)) {
    return callOllama(resolvedBase, resolvedModel, messages, maxTokens);
  }

  const resp = await axios.post(
    `${resolvedBase}/chat/completions`,
    {
      model: resolvedModel,
      messages,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://neurogrid.app',
        'X-Title': 'NeuroGrid',
      },
      timeout: 120_000,
    }
  );

  const choice = resp.data.choices?.[0];
  return {
    text: choice?.message?.content ?? '',
    inputTokens: resp.data.usage?.prompt_tokens ?? 0,
    outputTokens: resp.data.usage?.completion_tokens ?? 0,
  };
}
