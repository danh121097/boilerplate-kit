import type { Socket } from "socket.io-client";

interface IoStoreState {
  socket: Socket | null;
  authenticated: boolean;
}

export const useSocketIOStore = defineStore("socket-io", () => {
  const ioStore = ref<IoStoreState>({
    socket: null,
    authenticated: false,
  });

  function setSocketIO(data: Partial<IoStoreState>) {
    ioStore.value = { ...ioStore.value, ...data };
  }

  return {
    ioStore,
    setSocketIO,
  };
});
