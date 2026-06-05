import mongoose from 'mongoose';
import { closeSocket } from '@/socket';
import { config } from './environment';
import { disconnectRedis } from './redis';

/** Connect to MongoDB with event logging and graceful shutdown */
export async function connectDatabase(): Promise<void> {
  try {
    if (!config.isProduction) mongoose.set('debug', true);
    // Fail fast (15s) instead of mongoose's 30s default so a down/unreachable DB
    // surfaces a clear error and exits rather than hanging the boot silently.
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 15000
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `MongoDB connection failed: ${message}\n` +
        `Is MongoDB running and reachable at ${config.mongodbUri}?`
    );
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
}

/** Close Socket.IO, MongoDB and Redis connections gracefully */
async function gracefulShutdown(): Promise<void> {
  await closeSocket();
  await mongoose.connection.close();
  console.log('MongoDB connection closed (app shutdown)');
  await disconnectRedis();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
