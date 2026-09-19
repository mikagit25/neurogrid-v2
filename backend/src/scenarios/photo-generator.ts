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
    const referenceImageUrl = String(inputData.referenceImageUrl ?? '');
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

    let prompt: string;

    if (referenceImageUrl) {
      // Vision mode: analyze the uploaded product image to extract precise details
      const absoluteUrl = referenceImageUrl.startsWith('http')
        ? referenceImageUrl
        : `${process.env.APP_URL}${referenceImageUrl}`;

      const { text: analysis } = await callLlm(
        [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: absoluteUrl },
              },
              {
                type: 'text',
                text: `This is a product photo for "${productName}". Describe the product in extreme detail: exact shape, colors, materials, textures, size proportions, any text/logos, and all visible features. Be very specific. Then write a FLUX image generation prompt in English that recreates this exact product with: ${baseStyle}. The prompt must describe the product so precisely that the generated image looks identical to the original product but with the new background/style. Return only the final prompt, nothing else. Max 250 words.`,
              },
            ],
          },
        ],
        undefined, // auto-selects visionModel from config
        400
      );
      prompt = analysis.trim();
    } else {
      // Text-to-image mode: craft prompt from product name and description
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
      prompt = promptRaw.trim();
    }

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
      mode: referenceImageUrl ? 'img2img' : 'text2img',
      note: referenceImageUrl
        ? 'Фон заменён ИИ на основе вашего фото. Проверьте соответствие требованиям площадки.'
        : 'Изображение создано ИИ. Проверьте соответствие требованиям площадки перед загрузкой.',
    };
  }
}
