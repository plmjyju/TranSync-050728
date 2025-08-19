import { createClient } from 'redis';
import config from '../config/environment.js';

let client;

export async function getRedis() {
  if (client) return client;
  client = createClient({
    socket: { host: config.redis.host, port: config.redis.port },
    password: config.redis.password || undefined,
    database: config.redis.db || 0,
  });
  client.on('error', (err) => console.error('Redis error', err));
  if (!client.isOpen) await client.connect();
  return client;
}

export async function quitRedis() {
  if (client && client.isOpen) await client.quit();
}
