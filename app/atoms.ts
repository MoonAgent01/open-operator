import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils'; // Keep this if needed

// Keep existing atoms if they are still relevant
export const contextIdAtom = atomWithStorage("contextId", "");
// export const useWebuiBrowserAtom = atomWithStorage("useWebuiBrowser", false); // Commenting out as we replace with BrowserType

// --- Restored Atoms ---

// Chat message types
export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'ai';
  timestamp: number;
}

// Session state types
export interface SessionState {
  id: string | null;
  isActive: boolean;
  startTime: number | null;
  browserConnected: boolean;
  browserbaseSessionId?: string; // Added for Browserbase integration
}

// Chat state
export const chatMessagesAtom = atom<ChatMessage[]>([]);
export const chatLoadingAtom = atom(false);
export const lastMessageAtom = atom(
  (get) => {
    const messages = get(chatMessagesAtom);
    return messages[messages.length - 1];
  }
);

// Session state
export const sessionStateAtom = atom<SessionState>({
  id: null,
  isActive: false,
  startTime: null,
  browserConnected: false
});

// UI state
export const sidebarOpenAtom = atom(true);
export const settingsOpenAtom = atom(false);

// Browser state
export interface BrowserAction {
  type: string;
  args?: Record<string, unknown>;
  timestamp: number;
}

export const browserHistoryAtom = atom<BrowserAction[]>([]);
export const browserStatusAtom = atom<'idle' | 'busy' | 'error'>('idle');

// Browser type enum
export enum BrowserType {
  Browserbase = 'browserbase',
  Native = 'native'
}

// Browser type atom - Stored in sessionStorage to persist across refreshes
export const browserTypeAtom = atomWithStorage<BrowserType>('browserType', BrowserType.Browserbase); // Default to Browserbase

// Command history
export interface Command {
  id: string;
  text: string;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
}

export const commandHistoryAtom = atom<Command[]>([]);

// Add or update chat message
export const addMessageAtom = atom(
  null,
  (get, set, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const messages = get(chatMessagesAtom);
    const newMessage: ChatMessage = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    };
    set(chatMessagesAtom, [...messages, newMessage]);
  }
);

// Helper to clear chat history
export const clearChatAtom = atom(
  null,
  (_, set) => {
    set(chatMessagesAtom, []);
  }
);

// Helper to update session state
export const updateSessionAtom = atom(
  null,
  (get, set, update: Partial<SessionState>) => {
    const currentState = get(sessionStateAtom);
    set(sessionStateAtom, { ...currentState, ...update });
  }
);

// Add browser action to history
export const addBrowserActionAtom = atom(
  null,
  (get, set, action: Omit<BrowserAction, 'timestamp'>) => {
    const history = get(browserHistoryAtom);
    const newAction: BrowserAction = {
      ...action,
      timestamp: Date.now()
    };
    set(browserHistoryAtom, [...history, newAction]);
  }
);
