import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { callLlm } from '../integrations/llm/llm.client';
import { generateImage } from '../integrations/image/image.client';

interface BaseView {
  id: string;
  label: string;
  suffix: string;
}

const BASE_VIEWS: BaseView[] = [
  {
    id: 'front',
    label: 'Фронтальный вид',
    suffix: 'front view, directly facing the camera, perfectly centered, symmetrical composition, neutral straight-on angle',
  },
  {
    id: 'three-quarter',
    label: '3/4 перспектива',
    suffix: 'three-quarter perspective view at 45-degree angle, showing depth and volume, left-front angle revealing two sides of the product',
  },
  {
    id: 'side',
    label: 'Боковой вид',
    suffix: 'exact side profile view, 90-degree angle showing the complete side silhouette and depth, clean side elevation',
  },
  {
    id: 'detail',
    label: 'Детальный вид',
    suffix: 'close-up macro detail shot showing surface texture, material quality and fine details, shallow depth of field',
  },
];

const SEASONAL_PROMPTS: Record<string, string> = {
  'new-year':  'festive New Year setting, Christmas decorations, pine branches, gold and red ornaments, warm holiday bokeh lights in background',
  'valentine': 'Valentine\'s Day romantic setting, red roses, pink and red hearts, soft romantic lighting',
  'march8':    'spring floral setting for International Women\'s Day, pink and white flowers, pastel feminine background',
  'summer':    'bright summer setting, natural sunlight, tropical leaves, light airy atmosphere',
  'autumn':    'cozy autumn setting, warm orange leaves, wooden surface, warm golden hour light',
};

type EnhancementInput = {
  type: 'lifestyle' | 'text-overlay' | 'seasonal' | 'companion' | 'custom-bg';
  setting?: string;
  text?: string;
  style?: string;
  season?: string;
  product?: string;
  description?: string;
};

const STYLE_GUIDE: Record<string, string> = {
  'studio-3d':
    'professional studio photography, white-to-light-grey gradient background, soft key light from top-left, fill light from right, subtle drop shadow, ultra sharp focus, commercial e-commerce quality',
  floating:
    'pure white background, clean product photography, soft diffused lighting, subtle shadow below product, professional e-commerce hero shot',
  'dark-premium':
    'deep charcoal grey background, dramatic studio lighting, strong highlights, glossy reflective surface below, luxury premium brand aesthetic',
};

export class MultiPhotoStudioExecutor implements ScenarioExecutor {
  readonly slug = 'multi-photo-studio';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { inputData } = ctx;
    const productName = String(inputData.productName ?? '');
    const photoUrls: string[] = Array.isArray(inputData.photoUrls)
      ? (inputData.photoUrls as string[]).filter(Boolean).slice(0, 5)
      : [];
    const style = String(inputData.style ?? 'studio-3d');
    const enhancements: EnhancementInput[] = Array.isArray(inputData.enhancements)
      ? (inputData.enhancements as EnhancementInput[])
      : [];
    const runId = String(inputData._runId ?? Date.now());

    if (!productName) throw new Error('productName is required');
    if (photoUrls.length === 0) throw new Error('Загрузите хотя бы одно фото');

    const baseStyle = STYLE_GUIDE[style] ?? STYLE_GUIDE['studio-3d'];

    // ── 1. Vision analysis: one call describes the product in full detail ──
    type ContentBlock =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } };

    const visionContent: ContentBlock[] = photoUrls.map((rawUrl) => ({
      type: 'image_url' as const,
      image_url: {
        url: rawUrl.startsWith('http') ? rawUrl : `${process.env.APP_URL}${rawUrl}`,
      },
    }));

    visionContent.push({
      type: 'text',
      text: `Product name: "${productName}". You are given ${photoUrls.length} photo(s) of this product from different angles.

Analyze ALL photos and write a single rich product description in English that captures:
- Exact 3D shape and proportions (tall/wide/flat/cubic/round)
- All colors including gradients and color transitions
- Materials and surface finishes (matte/glossy/fabric/leather/metal/plastic/wood)
- Any branding, logos, text, or patterns
- Distinctive design features and silhouette
- Approximate size category (small/medium/large handheld item, desktop object, etc.)

Write ONLY the description, no intro or labels. Max 120 words. This description will be used as the base for image generation prompts.`,
    });

    const { text: productDescription } = await callLlm(
      [{ role: 'user', content: visionContent }],
      undefined,
      300
    );

    // ── 2. Build all view definitions: 4 base + enhancements ──
    const allViews: BaseView[] = [...BASE_VIEWS];

    for (const enh of enhancements) {
      if (enh.type === 'lifestyle' && enh.setting) {
        allViews.push({
          id: `lifestyle`,
          label: `Lifestyle: ${enh.setting}`,
          suffix: `lifestyle product photography, product placed ${enh.setting}, natural ambient lighting, realistic interior scene, editorial style`,
        });
      } else if (enh.type === 'text-overlay' && enh.text) {
        const styleDesc = enh.style === 'banner'
          ? `bold promotional banner at top reading "${enh.text}", striking typography`
          : enh.style === 'price-tag'
            ? `price tag label showing "${enh.text}", retail display style`
            : `small badge sticker in top-right corner with text "${enh.text}"`;
        allViews.push({
          id: 'text-overlay',
          label: `С текстом: ${enh.text}`,
          suffix: `${styleDesc}, clean product shot, text is clearly readable`,
        });
      } else if (enh.type === 'seasonal' && enh.season) {
        const seasonalDesc = SEASONAL_PROMPTS[enh.season] ?? 'festive seasonal background';
        allViews.push({
          id: `seasonal-${enh.season}`,
          label: `Сезонное фото`,
          suffix: seasonalDesc,
        });
      } else if (enh.type === 'companion' && enh.product) {
        allViews.push({
          id: 'companion',
          label: `С попутным товаром`,
          suffix: `product styled alongside ${enh.product}, professional product duo photography, complementary items arranged harmoniously, editorial flat lay style`,
        });
      } else if (enh.type === 'custom-bg' && enh.description) {
        allViews.push({
          id: 'custom-bg',
          label: `Кастомный фон`,
          suffix: `product placed on ${enh.description}, matching surface texture and color, professional product photography`,
        });
      }
    }

    // ── 3. Generate all views in parallel ──
    const viewResults = await Promise.all(
      allViews.map(async (view, i) => {
        const isEnhancement = i >= BASE_VIEWS.length;
        const studioSuffix = isEnhancement
          ? 'photorealistic, professional photography, high resolution'
          : `${baseStyle}, photorealistic, ultra high resolution, professional product photography`;

        const prompt = `${productDescription.trim()}, ${view.suffix}, ${studioSuffix}`;
        const negativePrompt =
          'blurry, low quality, watermark, deformed, multiple copies, bad proportions, amateur photo, overexposed';

        try {
          const image = await generateImage(
            { prompt, negativePrompt, width: 1024, height: 1024 },
            `${runId}-v${i}`
          );
          return { id: view.id, label: view.label, url: image.url, prompt };
        } catch (err) {
          console.error(`multi-photo-studio: view ${view.id} failed`, err);
          return { id: view.id, label: view.label, url: null as string | null, error: (err as Error).message };
        }
      })
    );

    const successViews = viewResults.filter((v) => v.url);
    if (successViews.length === 0) {
      throw new Error('Не удалось сгенерировать ни одного изображения');
    }

    const totalViews = allViews.length;
    return {
      views: viewResults,
      imageUrls: successViews.map((v) => v.url),
      productName,
      style,
      inputPhotosCount: photoUrls.length,
      enhancementsCount: enhancements.length,
      note: `Сгенерировано ${successViews.length} из ${totalViews} изображений. Готово к загрузке в карточку WB/Ozon.`,
    };
  }
}
