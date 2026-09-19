import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../../config';

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  model?: string;
  steps?: number;
}

export interface ImageResult {
  url: string;        // public URL path served by Express
  filePath: string;   // absolute path on disk
  provider: string;
  model: string;
}

const PUBLIC_IMAGES_DIR = path.join(__dirname, '../../../public/images');

export async function generateImage(
  opts: ImageGenerationOptions,
  runId: string
): Promise<ImageResult> {
  const model = opts.model ?? config.image.defaultModel;
  const provider = config.image.provider;

  let b64: string;

  if (provider === 'together') {
    b64 = await generateViaTogether(opts, model);
  } else if (provider === 'pollinations') {
    b64 = await generateViaPollinations(opts);
  } else {
    throw new Error(`Unsupported image provider: ${provider}`);
  }

  // Save to public dir
  if (!fs.existsSync(PUBLIC_IMAGES_DIR)) {
    fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
  }
  const filename = `${runId}-${Date.now()}.png`;
  const filePath = path.join(PUBLIC_IMAGES_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));

  return {
    url: `/images/${filename}`,
    filePath,
    provider,
    model,
  };
}

async function generateViaTogether(
  opts: ImageGenerationOptions,
  model: string
): Promise<string> {
  const resp = await axios.post(
    'https://api.together.xyz/v1/images/generations',
    {
      model,
      prompt: opts.prompt,
      negative_prompt: opts.negativePrompt,
      width: opts.width ?? 1024,
      height: opts.height ?? 1024,
      steps: opts.steps ?? 4,
      n: 1,
      response_format: 'b64_json',
    },
    {
      headers: {
        Authorization: `Bearer ${config.image.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120_000,
    }
  );

  const b64 = resp.data.data?.[0]?.b64_json;
  if (!b64) throw new Error('Together AI returned no image data');
  return b64;
}

/**
 * Pollinations.ai — free FLUX-based generation, no API key needed.
 * Good for dev/testing. Rate-limited but sufficient for low volume.
 */
async function generateViaPollinations(opts: ImageGenerationOptions): Promise<string> {
  const encoded = encodeURIComponent(opts.prompt);
  const w = opts.width ?? 1024;
  const h = opts.height ?? 1024;
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true`;

  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120_000,
  });

  return Buffer.from(resp.data).toString('base64');
}

/** Download an image from URL and return as Buffer (for infographic input) */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: 20 * 1024 * 1024, // 20 MB limit
  });
  return Buffer.from(resp.data);
}
