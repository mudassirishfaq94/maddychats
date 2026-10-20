"use client";

const BAR_COUNT = 32;
const MAX_CACHE_ENTRIES = 100;

export interface AudioAnalysis {
  duration: number;
  waveform: number[];
}

const analysisCache = new Map<string, Promise<AudioAnalysis>>();
const localAudio = new Map<string, Blob>();

/** Use decrypted browser bytes directly; CSP intentionally forbids fetching blob URLs. */
export function registerLocalAudio(src: string, blob: Blob) {
  if (localAudio.size >= MAX_CACHE_ENTRIES) localAudio.delete(localAudio.keys().next().value as string);
  localAudio.set(src, blob);
}
export function forgetLocalAudio(src: string) {
  localAudio.delete(src); analysisCache.delete(src);
}

function normalizedWaveform(channelData: Float32Array): number[] {
  const blockSize = Math.max(1, Math.floor(channelData.length / BAR_COUNT));
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    let sum = 0;
    let samples = 0;
    const start = i * blockSize;
    // Bound visualization work independently of the recording length.
    const stride = Math.max(1, Math.ceil(blockSize / 512));
    for (let j = start; j < start + blockSize && j < channelData.length; j += stride) {
      sum += Math.abs(channelData[j]);
      samples++;
    }
    bars.push(samples ? sum / samples : 0);
  }
  const max = Math.max(...bars, 0.01);
  return bars.map((bar) => bar / max);
}

async function analyzeBuffer(data: ArrayBuffer): Promise<AudioAnalysis> {
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return { duration: 0, waveform: [] };

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(data);
    return {
      duration: Number.isFinite(decoded.duration) && decoded.duration > 0 ? decoded.duration : 0,
      waveform: normalizedWaveform(decoded.getChannelData(0)),
    };
  } finally {
    await context.close();
  }
}

/** Fetches and decodes each remote voice note at most once per page session. */
export function analyzeAudioUrl(src: string): Promise<AudioAnalysis> {
  const cached = analysisCache.get(src);
  if (cached) return cached;

  if (analysisCache.size >= MAX_CACHE_ENTRIES) {
    analysisCache.delete(analysisCache.keys().next().value as string);
  }
  const local = localAudio.get(src);
  const bytes = local ? local.arrayBuffer() : src.startsWith("blob:")
    ? Promise.reject(new Error("Local audio bytes are no longer available"))
    : fetch(src)
    .then((response) => {
      if (!response.ok) throw new Error("Audio could not be loaded");
      return response.arrayBuffer();
    });
  const analysis = bytes.then(analyzeBuffer)
    .catch((error) => {
      analysisCache.delete(src);
      throw error;
    });
  analysisCache.set(src, analysis);
  return analysis;
}

export async function analyzeAudioBlob(blob: Blob): Promise<AudioAnalysis> {
  return analyzeBuffer(await blob.arrayBuffer());
}
