export function downsample(input: Float32Array, inputRate: number, outputRate = 16_000): Float32Array {
  if (inputRate === outputRate) return input.slice();
  if (inputRate < outputRate) throw new Error('Upsampling is not supported');
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let cursor = start; cursor < end; cursor += 1) total += input[cursor] ?? 0;
    output[index] = total / Math.max(1, end - start);
  }
  return output;
}

export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let squares = 0;
  for (const sample of samples) squares += sample * sample;
  return Math.sqrt(squares / samples.length);
}

export class AudioRing {
  private chunks: Float32Array[] = [];
  private sampleCount = 0;

  constructor(private readonly capacity: number) {}

  push(chunk: Float32Array): void {
    if (!chunk.length) return;
    this.chunks.push(chunk.slice());
    this.sampleCount += chunk.length;
    while (this.sampleCount > this.capacity && this.chunks.length > 1) {
      const first = this.chunks[0];
      if (!first) break;
      const excess = this.sampleCount - this.capacity;
      if (first.length <= excess) {
        this.chunks.shift();
        this.sampleCount -= first.length;
      } else {
        this.chunks[0] = first.slice(excess);
        this.sampleCount -= excess;
      }
    }
  }

  last(count = this.capacity): Float32Array {
    const wanted = Math.min(count, this.sampleCount);
    const output = new Float32Array(wanted);
    let offset = wanted;
    for (let index = this.chunks.length - 1; index >= 0 && offset > 0; index -= 1) {
      const chunk = this.chunks[index];
      if (!chunk) continue;
      const take = Math.min(chunk.length, offset);
      offset -= take;
      output.set(chunk.subarray(chunk.length - take), offset);
    }
    return output;
  }

  clear(): void {
    this.chunks = [];
    this.sampleCount = 0;
  }

  get length(): number {
    return this.sampleCount;
  }
}

export function novelTranscript(previous: string, current: string): string {
  const clean = current.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const before = previous.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const next = clean.split(/\s+/);
  const lowerNext = next.map((word) => word.toLocaleLowerCase());
  const maxOverlap = Math.min(before.length, lowerNext.length, 16);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (before.slice(-overlap).every((word, index) => word === lowerNext[index])) {
      return next.slice(overlap).join(' ');
    }
  }
  if (previous.toLocaleLowerCase().includes(clean.toLocaleLowerCase())) return '';
  return clean;
}

export function uncertainty(text: string, level: number): string | null {
  const normalized = text.trim();
  if (/\[(blank_audio|music|silence)\]/i.test(normalized)) return 'The model detected audio but could not resolve speech.';
  if (!normalized && level > 0.012) return 'Speech-like audio was present, but no words were resolved.';
  if (normalized.split(/\s+/).filter(Boolean).length < 3 && level > 0.02) return 'Only a short fragment was resolved. Check it against the audio.';
  return null;
}

export class CaptureSession {
  private context?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private sink?: GainNode;
  private audioTrack?: MediaStreamTrack;
  private endedByUser = false;

  async start(onSamples: (samples: Float32Array) => void, onEnded?: () => void): Promise<{ source: string }> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('System audio capture is not available in this browser.');
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      preferCurrentTab: true,
      selfBrowserSurface: 'exclude',
      systemAudio: 'include',
    } as DisplayMediaStreamOptions);
    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack) {
      this.stop();
      throw new Error('No meeting audio was shared. Choose a browser tab and turn on “Share tab audio”.');
    }
    const settings = audioTrack.getSettings();
    this.audioTrack = audioTrack;
    this.endedByUser = false;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    await this.context.audioWorklet.addModule('/audio-worklet.js');
    this.source = this.context.createMediaStreamSource(new MediaStream([audioTrack]));
    this.node = new AudioWorkletNode(this.context, 'caption-capture');
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;
    this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      onSamples(downsample(event.data, this.context?.sampleRate ?? 48_000));
    };
    this.source.connect(this.node).connect(this.sink).connect(this.context.destination);
    audioTrack.addEventListener('ended', () => {
      const shouldNotify = !this.endedByUser;
      this.stop();
      if (shouldNotify) onEnded?.();
    }, { once: true });
    return { source: settings.displaySurface ? `${settings.displaySurface} audio` : 'Shared audio' };
  }

  stop(): void {
    this.endedByUser = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.node?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    void this.context?.close();
    this.stream = undefined;
    this.audioTrack = undefined;
    this.context = undefined;
  }

  setPaused(paused: boolean): void {
    if (this.audioTrack) this.audioTrack.enabled = !paused;
    if (paused) void this.context?.suspend();
    else void this.context?.resume();
  }
}
