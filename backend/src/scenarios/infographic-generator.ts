import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { ScenarioExecutor, ScenarioContext, ScenarioResult } from './base';
import { fetchImageBuffer } from '../integrations/image/image.client';

const PUBLIC_IMAGES_DIR = path.join(__dirname, '../../public/images');

/**
 * Сценарий 8: Генератор инфографики
 * Берёт фото товара продавца, накладывает характеристики в виде блоков — стандартный
 * формат WB/Ozon (правая колонка с пунктами, заголовок, цвет бренда).
 *
 * Не требует внешних AI API — только sharp (SVG compositing).
 */
export class InfographicGeneratorExecutor implements ScenarioExecutor {
  readonly slug = 'infographic-generator';

  async execute(ctx: ScenarioContext): Promise<ScenarioResult> {
    const { inputData } = ctx;
    const photoUrl = String(inputData.photoUrl ?? '');
    const title = String(inputData.title ?? '');
    const features = Array.isArray(inputData.features)
      ? (inputData.features as string[]).slice(0, 6)
      : [];
    const accentColor = String(inputData.accentColor ?? '#FF6B00'); // WB orange by default
    const bgColor = String(inputData.bgColor ?? '#FFFFFF');
    const runId = String(inputData._runId ?? Date.now());

    if (!photoUrl) throw new Error('photoUrl is required');
    if (features.length === 0) throw new Error('features array is required (1-6 items)');

    // 1. Download product photo
    const photoBuffer = await fetchImageBuffer(photoUrl);

    // 2. Resize product photo to fit left half (600x900)
    const productImg = await sharp(photoBuffer)
      .resize(560, 860, { fit: 'contain', background: bgColor })
      .png()
      .toBuffer();
    const productB64 = productImg.toString('base64');

    // 3. Build SVG infographic (1200x900, split layout)
    const svg = buildInfographicSvg({
      productB64,
      title,
      features,
      accentColor,
      bgColor,
      width: 1200,
      height: 900,
    });

    // 4. Render SVG → PNG via sharp
    if (!fs.existsSync(PUBLIC_IMAGES_DIR)) {
      fs.mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
    }

    const filename = `infographic-${runId}-${Date.now()}.png`;
    const filePath = path.join(PUBLIC_IMAGES_DIR, filename);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(filePath);

    return {
      imageUrl: `/images/${filename}`,
      title,
      features,
      note: 'Инфографика готова. Размер 1200×900 подходит для загрузки на WB и Ozon.',
    };
  }
}

interface SvgOptions {
  productB64: string;
  title: string;
  features: string[];
  accentColor: string;
  bgColor: string;
  width: number;
  height: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap text into lines of max `maxChars` characters */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

function buildInfographicSvg(opts: SvgOptions): string {
  const { productB64, title, features, accentColor, bgColor, width, height } = opts;

  const leftW = Math.floor(width * 0.5);    // 600
  const rightX = leftW + 20;               // 620
  const rightW = width - leftW - 40;       // 540
  const topPad = 40;
  const featureH = (height - topPad * 2 - 80) / Math.max(features.length, 1);
  const featureBoxH = Math.min(Math.floor(featureH) - 10, 110);

  // Title lines (max 28 chars per line)
  const titleLines = title ? wrapText(title, 28) : [];

  const featureBlocks = features.map((feat, i) => {
    const y = topPad + 80 + i * (featureBoxH + 12);
    const lines = wrapText(feat, 32);
    const lineHeight = 22;
    const textY = y + featureBoxH / 2 - ((lines.length - 1) * lineHeight) / 2;

    const textElements = lines.map((line, li) =>
      `<text x="${rightX + 56}" y="${textY + li * lineHeight}"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="17" fill="#1a1a1a"
        dominant-baseline="middle">${escapeXml(line)}</text>`
    ).join('\n');

    return `
      <rect x="${rightX}" y="${y}" width="${rightW}" height="${featureBoxH}"
        rx="10" ry="10" fill="#f7f7f7" stroke="${accentColor}" stroke-width="1.5"/>
      <rect x="${rightX}" y="${y}" width="8" height="${featureBoxH}"
        rx="4" ry="4" fill="${accentColor}"/>
      <circle cx="${rightX + 30}" cy="${y + featureBoxH / 2}" r="12"
        fill="${accentColor}"/>
      <text x="${rightX + 30}" y="${y + featureBoxH / 2}"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="13" fill="white" text-anchor="middle"
        dominant-baseline="middle">${i + 1}</text>
      ${textElements}
    `;
  }).join('\n');

  const titleElements = titleLines.map((line, i) =>
    `<text x="${rightX + rightW / 2}" y="${topPad + 24 + i * 30}"
      font-family="DejaVu Sans, Arial, sans-serif"
      font-size="22" font-weight="bold" fill="#1a1a1a"
      text-anchor="middle">${escapeXml(line)}</text>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${bgColor}"/>

  <!-- Accent header strip -->
  <rect width="${leftW}" height="8" fill="${accentColor}"/>

  <!-- Product image (left) -->
  <image x="20" y="20" width="${leftW - 40}" height="${height - 40}"
    xlink:href="data:image/png;base64,${productB64}"
    preserveAspectRatio="xMidYMid meet"/>

  <!-- Divider line -->
  <line x1="${leftW}" y1="20" x2="${leftW}" y2="${height - 20}"
    stroke="#e0e0e0" stroke-width="1"/>

  <!-- Title (right column) -->
  ${titleElements}

  <!-- Feature blocks (right column) -->
  ${featureBlocks}

  <!-- Bottom accent strip -->
  <rect y="${height - 6}" width="${width}" height="6" fill="${accentColor}"/>
</svg>`;
}
