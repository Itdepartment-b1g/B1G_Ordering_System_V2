import { applyCors } from './headers';

type MethodHandler = (req: any, res: any) => Promise<unknown> | unknown;

type MethodMap = {
  GET?: MethodHandler;
  POST?: MethodHandler;
  PUT?: MethodHandler;
  PATCH?: MethodHandler;
  DELETE?: MethodHandler;
};

export function createRouteHandler(methods: MethodMap) {
  return async function handler(req: any, res: any) {
    const allowed = `${Object.keys(methods).join(', ')}, OPTIONS`;
    applyCors(res, allowed);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const run = methods[req.method as keyof MethodMap];
    if (!run) {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    return run(req, res);
  };
}

type ApiRouter = ((req: any, res: any) => Promise<unknown>) & {
  get: (path: string, handler: MethodHandler) => ApiRouter;
  post: (path: string, handler: MethodHandler) => ApiRouter;
  put: (path: string, handler: MethodHandler) => ApiRouter;
  patch: (path: string, handler: MethodHandler) => ApiRouter;
  delete: (path: string, handler: MethodHandler) => ApiRouter;
};

/** Express-style router for Vercel/Vite API files. The path is for readability; the file path is the real URL. */
export function Router(): ApiRouter {
  const methods: MethodMap = {};
  const dispatch = createRouteHandler(methods) as ApiRouter;

  const add = (method: keyof MethodMap) => (_path: string, handler: MethodHandler) => {
    methods[method] = handler;
    return dispatch;
  };

  dispatch.get = add('GET');
  dispatch.post = add('POST');
  dispatch.put = add('PUT');
  dispatch.patch = add('PATCH');
  dispatch.delete = add('DELETE');

  return dispatch;
}
