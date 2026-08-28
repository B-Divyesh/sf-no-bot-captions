class CaptionCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      const copy = channel.slice();
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor('caption-capture', CaptionCaptureProcessor);
