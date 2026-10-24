import { writable } from 'svelte/store';

export interface ProGateState {
  isOpen: boolean;
  featureTitle?: string;
  reason?: string;
}

const DEFAULT_REASON =
  'Fitur AI memerlukan lisensi CAPost PRO. Pro member dapat menggunakan API Key sendiri (BYOK - OpenAI, Claude, Gemini, DeepSeek, Ollama) tanpa batas.';

function createProGateStore() {
  const { subscribe, set } = writable<ProGateState>({
    isOpen: false,
    featureTitle: undefined,
    reason: undefined
  });

  return {
    subscribe,
    open: (featureTitle?: string, reason?: string) => {
      set({
        isOpen: true,
        featureTitle: featureTitle || 'Fitur AI',
        reason: reason || DEFAULT_REASON
      });
    },
    close: () => {
      set({
        isOpen: false,
        featureTitle: undefined,
        reason: undefined
      });
    }
  };
}

export const proGate = createProGateStore();
