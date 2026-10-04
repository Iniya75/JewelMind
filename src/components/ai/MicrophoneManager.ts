/**
 * MicrophoneManager.ts
 * ====================
 * Captures microphone audio from the browser, resamples it to 24000 Hz PCM16,
 * and streams base64-encoded chunks to a callback for forwarding to OpenAI.
 *
 * Required audio format for OpenAI Realtime API:
 *   - PCM16 (16-bit signed, little-endian)
 *   - Sample rate: 24000 Hz
 *   - Mono (1 channel)
 */

const TARGET_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096; // ScriptProcessor buffer size

type AudioChunkCallback = (base64Audio: string) => void;

export class MicrophoneManager {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onChunk: AudioChunkCallback;
  private isCapturing = false;

  constructor(onChunk: AudioChunkCallback) {
    this.onChunk = onChunk;
  }

  /**
   * Request microphone access and start streaming audio chunks.
   */
  async start(): Promise<void> {
    if (this.isCapturing) return;

    // Request microphone access
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: TARGET_SAMPLE_RATE,
      },
      video: false,
    });

    // Create audio context at the target sample rate (24kHz)
    this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // Use ScriptProcessorNode to intercept audio frames
    // Note: AudioWorkletNode is the modern alternative, but ScriptProcessor
    // is simpler and works cross-browser without extra setup.
    this.processorNode = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isCapturing) return;

      const inputData = event.inputBuffer.getChannelData(0); // Float32Array at 24kHz

      // Convert Float32 → PCM16 little-endian bytes
      const pcm16Buffer = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        // Clamp to [-1, 1] and scale to int16 range
        const clamped = Math.max(-1, Math.min(1, inputData[i]));
        pcm16Buffer[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
      }

      // Encode as base64
      const uint8View = new Uint8Array(pcm16Buffer.buffer);
      let binaryStr = "";
      for (let i = 0; i < uint8View.byteLength; i++) {
        binaryStr += String.fromCharCode(uint8View[i]);
      }
      const base64 = btoa(binaryStr);

      this.onChunk(base64);
    };

    // Wire up audio graph: mic → processor → (silent destination)
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isCapturing = true;
    console.log("[MicrophoneManager] Started capturing audio at", TARGET_SAMPLE_RATE, "Hz");
  }

  /**
   * Stop capturing and release all audio resources.
   */
  stop(): void {
    this.isCapturing = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }

    console.log("[MicrophoneManager] Stopped.");
  }

  get active(): boolean {
    return this.isCapturing;
  }
}
