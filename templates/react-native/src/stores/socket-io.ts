import { create } from "zustand";
import type { Socket } from "socket.io-client";

interface SocketIOState {
  /** Live socket instance, or null when disconnected. */
  socket: Socket | null;
  /** True once the server emits the `authenticated` event. */
  authenticated: boolean;
  /** Set both fields in one call — mirrors Pinia's `setSocketIO`. */
  setSocketIO: (data: Partial<Omit<SocketIOState, "setSocketIO">>) => void;
}

/**
 * Zustand store for the Socket.IO connection lifecycle.
 *
 * - `socket`: the active Socket instance (null when disconnected)
 * - `authenticated`: set true on server `authenticated` event, false on error/disconnect
 * - `setSocketIO`: partial-merge updater
 *
 * `socket.io-client` runs on React Native unchanged; the only mobile-specific
 * concern is that the access token is read asynchronously from SecureStore before
 * connecting (see `@/hooks/useSocketIO`).
 */
export const useSocketIOStore = create<SocketIOState>((set) => ({
  socket: null,
  authenticated: false,
  setSocketIO: (data) => set((state) => ({ ...state, ...data })),
}));
