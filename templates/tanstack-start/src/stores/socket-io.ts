import { create } from "zustand";
import type { Socket } from "socket.io-client";

interface SocketIOState {
  socket: Socket | null;
  authenticated: boolean;
  /** Merge a partial update into the store — keeps unspecified fields unchanged. */
  setSocketIO: (data: Partial<Pick<SocketIOState, "socket" | "authenticated">>) => void;
}

/**
 * Zustand store for the Socket.IO connection state. Mirrors the Pinia
 * `useSocketIOStore` from the vuejs template, adapted for React/Zustand.
 *
 * Client-only: the store is instantiated at module level but socket.io-client
 * is never imported during SSR because this file is only imported by the
 * `useSocketIO` hook which is itself guarded by `typeof window`.
 */
export const useSocketIOStore = create<SocketIOState>((set) => ({
  socket: null,
  authenticated: false,
  setSocketIO: (data) => set((state) => ({ ...state, ...data })),
}));
