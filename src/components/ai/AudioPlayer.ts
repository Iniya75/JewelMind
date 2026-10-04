/**
 * AudioPlayer.ts
 * ==============
 * Plays back PCM16 audio chunks streamed from OpenAI Realtime API.
 * Uses the Web Audio API for low-latency playback with queue buffering.
 *
 * PCM16 audio from OpenAI is:
 *   - 16-bit signed little-endian samples
 *   - 24000 Hz sample rate
 *   - Mono (1 channel)
 */

const SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private gainNode: GainNode | null = null;
  private isRunning = false;

  async init(): Promise<void> {
    if (typeof window === "undefined") return;

    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1.0;
    this.gainNode.connect(this.audioContext.destination);

    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.nextStartTime = this.audioContext.currentTime;
    this.isRunning = true;
    console.log("[AudioPlayer] Initialized with sample rate:", SAMPLE_RATE);
  }

  /**
   * Queue a base64-encoded PCM16 audio chunk for playback.
   * Automatically resumes the AudioContext if it was suspended (e.g. after barge-in stop).
   */
  enqueue(base64Audio: string): void {
    if (!this.audioContext || !this.gainNode) return;

    // Resume suspended context (e.g. after a stop() call during barge-in)
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(console.error);
    }

    // Mark as running again (in case stop() was called)
    this.isRunning = true;

    try {
      // Decode base64 to bytes
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Convert PCM16 bytes to Float32 samples
      const numSamples = Math.floor(bytes.length / 2);
      const audioBuffer = this.audioContext.createBuffer(NUM_CHANNELS, numSamples, SAMPLE_RATE);
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < numSamples; i++) {
        const lo = bytes[i * 2];
        const hi = bytes[i * 2 + 1];
        // Signed 16-bit little-endian → float32
        let sample = (hi << 8) | lo;
        if (sample > 32767) sample -= 65536;
        channelData[i] = sample / 32768;
      }

      // Schedule this buffer to play after the previous one ends
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      const startAt = Math.max(this.audioContext.currentTime, this.nextStartTime);
      source.start(startAt);
      this.nextStartTime = startAt + audioBuffer.duration;
    } catch (err) {
      console.error("[AudioPlayer] Failed to enqueue audio chunk:", err);
    }
  }

  /**
   * Stop all current playback immediately (e.g. on barge-in).
   * The AudioContext is suspended but kept alive so it can be resumed.
   */
  stop(): void {
    this.isRunning = false;
    if (this.audioContext && this.audioContext.state !== "closed") {
      // Suspend to interrupt all scheduled playback
      this.audioContext.suspend().catch(console.error);
    }
    // Reset scheduling so next audio starts cleanly
    this.nextStartTime = 0;
    console.log("[AudioPlayer] Stopped (context suspended; ready to resume).");
  }

  /**
   * Close the AudioContext and release resources.
   */
  async close(): Promise<void> {
    this.isRunning = false;
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.gainNode = null;
    console.log("[AudioPlayer] Closed.");
  }

  get isActive(): boolean {
    return this.isRunning && !!this.audioContext && this.audioContext.state === "running";
  }
}
