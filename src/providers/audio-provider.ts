export interface SpeechRequest {
  text: string;
  voiceName?: string;
  styleHint?: string;
  maxSeconds?: number; // if set, output is time-fit to this duration
}

export interface GeneratedAudio {
  provider: string;
  model: string;
  uri: string;
  mimeType: string;
  durationSeconds?: number;
  costUSD: number;
  latencyMs: number;
}

export interface AudioProvider {
  name: string;
  synthesizeSpeech(req: SpeechRequest): Promise<GeneratedAudio>;
}