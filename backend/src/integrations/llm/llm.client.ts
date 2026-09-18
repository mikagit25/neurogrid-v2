import axios from 'axios';
import { config } from '../../config';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callLlm(
  messages: LlmMessage[],
  model?: string,
  maxTokens = 2048
): Promise<LlmResponse> {
  const resp = await axios.post(
    `${config.llm.baseUrl}/chat/completions`,
    {
      model: model ?? config.llm.model,
      messages,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
        // Required by OpenRouter to identify the app
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
