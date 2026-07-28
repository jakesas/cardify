import { createWorker, PSM, OEM } from 'tesseract.js';

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function prepareCanvas(img: HTMLImageElement) {
  let w = img.width, h = img.height;
  const maxDim = 2400, minDim = 400;
  if (w > maxDim || h > maxDim) {
    const s = maxDim / Math.max(w, h);
    w = Math.round(w * s); h = Math.round(h * s);
  }
  if (w < minDim && h < minDim) {
    const s = Math.max(minDim / w, minDim / h);
    w = Math.round(w * s); h = Math.round(h * s);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx };
}

async function preprocessImage(file: File): Promise<string> {
  const img = await loadImage(file);
  const { canvas } = prepareCanvas(img);
  return canvas.toDataURL('image/png');
}

async function runTesseract(imageUrl: string, onProgress?: (percent: number) => void): Promise<string> {
  const worker = await createWorker('eng', OEM.TESSERACT_LSTM_COMBINED, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });

    const { data } = await worker.recognize(imageUrl);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function extractTextFromImage(
  imageFile: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const imageUrl = await preprocessImage(imageFile);
  return runTesseract(imageUrl, onProgress);
}

export async function extractTextFromImageUrl(
  imageUrl: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return runTesseract(imageUrl, onProgress);
}
