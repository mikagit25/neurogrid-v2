import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';
import { generateImage } from '../integrations/image/image.client';

/**
 * Сценарий 7: Генерация фото товара
 * Вход: название товара, стиль (белый фон / лайфстайл / студийное)
 * Выход: ссылка на готовое изображение
 */
export class PhotoGeneratorExecutor implements ScenarioExecutor {
  readonly slug = 'photo-generator';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { inputData } = ctx;
    const productName = String(inputData.productName ?? '');
    const style = String(inputData.style ?? 'white-background');
    const description = String(inputData.description ?? '');
    const runId = String(inputData._runId ?? Date.now());

    if (!productName) throw new Error('productName is required');

    const styleGuide: Record<string, string> = {
      'white-background':
        'clean white studio background, professional product photography, soft even lighting, sharp focus, commercial e-commerce style',
      lifestyle:
        'lifestyle photography, natural environment matching the product, warm natural lighting, aspirational mood, person using the product or product in context',
      studio:
        'professional studio photography, dramatic lighting, dark or gradient background, premium feel, luxury product presentation',
    };

    const baseStyle = styleGuide[style] ?? styleGuide['white-background'];

    // Use LLM to craft a precise image prompt
    const { text: promptRaw } = await callLlm(
      [
        {
          role: 'system',
          content:
            'You are a professional product photography art director. Write Stable Diffusion / FLUX image prompts in English. Return only the prompt text, nothing else.',
        },
        {
          role: 'user',
          content: `Product: ${productName}
${description ? `Description: ${description}` : ''}
Style: ${baseStyle}

Write a detailed FLUX image generation prompt for this product. Focus on: exact product appearance, materials, colors, lighting, background. Max 200 words.`,
        },
      ],
      undefined,
      300
    );

    const prompt = promptRaw.trim();

    const image = await generateImage(
      {
        prompt,
        negativePrompt:
          'blurry, low quality, watermark, text, logo, deformed, ugly, bad lighting, overexposed',
        width: 1024,
        height: 1024,
        model: 'black-forest-labs/FLUX.1.1-pro',
      },
      runId
    );

    return {
      imageUrl: image.url,
      prompt,
      productName,
      style,
      note: 'Изображение создано ИИ. Проверьте соответствие требованиям площадки перед загрузкой.',
    };
  }
}
