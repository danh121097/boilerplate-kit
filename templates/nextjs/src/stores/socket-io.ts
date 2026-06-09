import { create } from "zustand";
import type { Socket } from "socket.io-client";

interface SocketIOState {
  socket: Socket | null;
  authenticated: boolean;
  /** Merge partial state — mirrors the Pinia setSocketIO action. */
  setSocketIO: (data: Partial<Omit<SocketIOState, "setSocketIO">>) => void;
}

/**
 * Global socket.io state store. Keeps the live Socket instance and the
 * authenticated flag so any component tree can read connection status without
 * prop-drilling. Mirrors the Pinia socket-io store in the vuejs template.
 *
 * Usage is always client-side — do NOT import this in server components.
 */
export const useSocketIOStore = create<SocketIOState>((set) => ({
  socket: null,
  authenticated: false,
  setSocketIO: (data) => set((state) => ({ ...state, ...data })),
}));
