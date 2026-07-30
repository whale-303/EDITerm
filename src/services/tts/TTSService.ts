import { register } from '../../core/di/container.js';
import { TOKENS } from '../../core/di/tokens.js';

export interface ITTSService {
  speak(text: string): Promise<void>;
  stop(): void;
  readonly isSpeaking: boolean;
}

export class TTSService implements ITTSService {
  isSpeaking = false;

  async speak(_text: string): Promise<void> {
    // Placeholder — will integrate with a TTS backend
    this.isSpeaking = true;
    // TODO: actual TTS implementation
    this.isSpeaking = false;
  }

  stop(): void {
    this.isSpeaking = false;
  }
}

register(TOKENS.TTSService, () => new TTSService());
