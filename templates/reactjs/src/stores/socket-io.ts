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
 * Mirrors the Pinia `useSocketIOStore` in the vuejs template:
 * - `socket`: the active Socket instance (null when disconnected)
 * - `authenticated`: set true on server `authenticated` event, false on error/disconnect
 * - `setSocketIO`: partial-merge updater (matches Pinia store's API)
 */
export const useSocketIOStore = create<SocketIOState>((set) => ({
  socket: null,
  authenticated: false,
  setSocketIO: (data) => set((state) => ({ ...state, ...data })),
}));
