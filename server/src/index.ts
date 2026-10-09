import { buildServer } from './app.js';

const app = await buildServer();
const port = Number(process.env.API_PORT ?? 3001);
try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (cause) {
  app.log.error(cause);
  process.exit(1);
}
