// Variant: one Fastify process per CPU via node:cluster (shared listen socket). Pool split so total stays 16.
import cluster from 'node:cluster';
import os from 'node:os';
const n = Number(process.env.WORKERS ?? os.availableParallelism());
if (cluster.isPrimary) {
  for (let i = 0; i < n; i++) cluster.fork({ POOL_SIZE: String(Math.max(1, Math.round(16 / n))) });
} else {
  await import('./server.js');
}
