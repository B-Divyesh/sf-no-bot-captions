import { describe, expect, it } from 'vitest';
import { AudioRing, downsample, novelTranscript, rms, uncertainty } from '../src/audio';

describe('audio repair utilities', () => {
  it('keeps only the requested rolling window', () => {
    const ring = new AudioRing(4);
    ring.push(new Float32Array([1, 2, 3]));
    ring.push(new Float32Array([4, 5, 6]));
    expect([...ring.last()]).toEqual([3, 4, 5, 6]);
  });

  it('downsamples by averaging source frames', () => {
    expect([...downsample(new Float32Array([1, 3, 5, 7]), 4, 2)]).toEqual([2, 6]);
  });

  it('removes overlapping words from rolling transcriptions', () => {
    expect(novelTranscript('we should ship this', 'ship this on Friday')).toBe('on Friday');
    expect(novelTranscript('we should ship this', 'ship this')).toBe('');
  });

  it('marks speech-like dropped and short fragments', () => {
    expect(uncertainty('', 0.03)).toMatch(/no words/i);
    expect(uncertainty('maybe', 0.03)).toMatch(/short fragment/i);
    expect(uncertainty('a clear complete phrase', 0.03)).toBeNull();
    expect(rms(new Float32Array([1, -1]))).toBe(1);
  });
});
