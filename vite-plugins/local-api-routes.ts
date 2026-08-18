import type { Plugin, Connect } from 'vite';
import { loadEnv } from 'vite';

function queryMap(url: string): Record<string, string | undefined> {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return {};
  const params = new URLSearchParams(url.slice(qIndex));
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of params.entries()) result[key] = value;
  return result;
}

function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function createResProxy(res: any) {
  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
      return res;
    },
    end(body?: string) {
      res.end(body);
      return res;
    },
    setHeader: res.setHeader?.bind(res),
  };
}

export function localApiRoutes(): Plugin {
  return {
    name: 'local-api-routes',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0] || '';
        if (!pathname.startsWith('/api/')) {
          next();
          return;
        }

        try {
          const modulePath = `${pathname}.ts`;
          const mod = await server.ssrLoadModule(modulePath);
          const handler =
            mod?.[req.method as keyof typeof mod] ||
            mod?.default;

          if (typeof handler !== 'function') {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }

          const reqProxy: any = {
            method: req.method,
            headers: req.headers || {},
            query: queryMap(req.url || ''),
          };

          if (req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            reqProxy.body = await readJsonBody(req);
          }

          await handler(reqProxy, createResProxy(res));
        } catch (error) {
          console.error('[local-api-routes]', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
      });
    },
  };
}
