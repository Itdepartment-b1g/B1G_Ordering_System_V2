import { toErrorResult } from './errors';

export async function respond(
  res: any,
  run: () => Promise<{ status: number; body: unknown }>
) {
  try {
    const result = await run();
    return res.status(result.status).json(result.body);
  } catch (error) {
    const result = toErrorResult(error);
    return res.status(result.status).json(result.body);
  }
}
