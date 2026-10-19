import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { api } from './api.js';
import { runJobs } from './services.js';
import { migrate } from './migrate.js';
export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'"],
                upgradeInsecureRequests: null,
              },
            }
          : false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(
    '/api',
    (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-coachpro'] !== '1')
        return res.status(403).json({ error: 'Недопустимый источник запроса' });
      next();
    },
    api,
  );
  app.use('/api', (req, res) => res.status(404).json({ error: 'Метод не найден' }));
  if (process.env.NODE_ENV === 'development' && !process.env.PREVIEW_BUILT) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    app.locals.vite = vite;
  } else {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ZodError)
      return res
        .status(400)
        .json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (err.code === '23505') return res.status(409).json({ error: 'Такая запись уже существует' });
    if (err.code === '22P02') return res.status(400).json({ error: 'Неверный идентификатор' });
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл больше 25 МБ' });
    if (!err.status) console.error(err);
    res
      .status(err.status || 500)
      .json({ error: err.status ? err.message : 'Ошибка сервера. Повторите попытку.' });
  });
  return app;
}
export async function start() {
  const app = await createApp();
  const server = app.listen(Number(process.env.PORT || 3000), '127.0.0.1', () =>
    console.log(`CoachPRO: http://localhost:${process.env.PORT || 3000}`),
  );
  const jobs = setInterval(
    () => runJobs().catch((e) => console.error('Фоновая задача:', e.message)),
    60000,
  );
  jobs.unref();
  server.on('close', () => {
    clearInterval(jobs);
    app.locals.vite?.close();
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate();
  await start();
}
