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
  const allowed = `${Object.keys(methods).join(', ')}, OPTIONS`;

  return async function handler(req: any, res: any) {
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
