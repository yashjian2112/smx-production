// Client-side face-api model loader — singleton, loads once per page session

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const faceapi = await import('@vladmandic/face-api');
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();

  return loadingPromise;
}

export async function getFaceDescriptor(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<Float32Array | null> {
  const faceapi = await import('@vladmandic/face-api');
  // 0.5 confidence: still filters noise but works with glasses/tired eyes
  const detection = await faceapi
    .detectSingleFace(source, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection?.descriptor ?? null;
}

/** Capture multiple frames from a video and return the averaged descriptor.
 *  More robust enrollment — handles glasses / angle / lighting variation. */
export async function getAveragedDescriptor(
  video: HTMLVideoElement,
  frames = 5,
  intervalMs = 300
): Promise<Float32Array | null> {
  const descriptors: Float32Array[] = [];
  for (let i = 0; i < frames; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalMs));
    const d = await getFaceDescriptor(video);
    if (d) descriptors.push(d);
  }
  if (descriptors.length === 0) return null;
  // Average all captured descriptors element-wise
  const avg = new Float32Array(128);
  for (const d of descriptors) {
    for (let j = 0; j < 128; j++) avg[j] += d[j];
  }
  for (let j = 0; j < 128; j++) avg[j] /= descriptors.length;
  return avg;
}

export function descriptorDistance(a: Float32Array, b: Float32Array): number {
  // Euclidean distance — same as faceapi.euclideanDistance
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function descriptorFromJson(json: string): Float32Array {
  return new Float32Array(JSON.parse(json) as number[]);
}

export function descriptorToJson(d: Float32Array): string {
  return JSON.stringify(Array.from(d));
}
