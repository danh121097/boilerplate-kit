import { createServer } from 'http';
import { connectDatabase } from './config/database';
import { config } from './config/environment';
import { connectRedis } from './config/redis';

/** Bootstrap server: connect DB and Redis, attach Socket.IO, then listen */
const startServer = async (): Promise<void> => {
  await connectDatabase();
  connectRedis();
  // Import app + socket AFTER Redis connects so the rate-limit store and the
  // Socket.IO Redis adapter see the live client (modules read it at import time).
  const { default: app } = await import('./app');
  const { initSocket } = await import('./socket');

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`Server running on port: ${config.port} [${config.nodeEnv}]`);
  });
};

startServer().catch(console.error);
