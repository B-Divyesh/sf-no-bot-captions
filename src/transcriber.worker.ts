/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/wasm/';
  env.backends.onnx.wasm.numThreads = 1;
}

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text?: string } | Array<{ text?: string }>>;
let transcriber: Transcriber | undefined;

async function getTranscriber(): Promise<Transcriber> {
  if (!transcriber) {
    const createPipeline = pipeline as unknown as (task: string, model: string, options: Record<string, unknown>) => Promise<Transcriber>;
    transcriber = await createPipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (detail: { status?: string; progress?: number; file?: string }) => {
        if (['initiate', 'download', 'progress'].includes(detail.status ?? '')) {
          self.postMessage({ type: 'progress', status: detail.status, progress: detail.progress, file: detail.file });
        }
      },
    });
  }
  return transcriber;
}

self.onmessage = async (event: MessageEvent<{ id: string; audio: Float32Array }>) => {
  const { id, audio } = event.data;
  try {
    const run = await getTranscriber();
    const result = await run(audio, { language: 'en', task: 'transcribe', return_timestamps: true });
    const first = Array.isArray(result) ? result[0] : result;
    self.postMessage({ type: 'result', id, text: first?.text?.trim() ?? '' });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Local transcription failed.' });
  }
};

export {};
