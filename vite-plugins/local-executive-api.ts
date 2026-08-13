import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

/**
 * Serves GET /api/executive/* during `vite` / `npm run dev`.
 * Vercel production still uses api/executive/*.ts; this only fills the local gap.
 */
export function localExecutiveApi(): Plugin {
  return {
    name: 'local-executive-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      const hasDb =
        process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DATABASE_URL;
      console.log(
        '[local-executive-api]',
        hasDb ? 'DATABASE_URL set (Drizzle)' : 'DATABASE_URL missing — using SUPABASE_SERVICE_ROLE_KEY fallback'
      );

      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0] || '';
        if (!pathname.startsWith('/api/executive/')) {
          next();
          return;
        }

        try {
          const mod = await server.ssrLoadModule('/src/server/http/localExecutiveRouter.ts');
          await mod.handleLocalExecutiveRequest(req, res);
        } catch (error) {
          console.error('[local-executive-api]', error);
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
