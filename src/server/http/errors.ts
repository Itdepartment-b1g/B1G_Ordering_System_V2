export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export type ApiErrorBody = { error: string };

export function toErrorResult(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof HttpError) {
    return { status: error.status, body: { error: error.message } };
  }

  const pgError = error as { code?: string; message?: string };
  if (pgError?.code === '57014') {
    return {
      status: 504,
      body: { error: 'Database query timed out. Try a smaller date range, or use the Supabase session pooler URI in DATABASE_URL.' },
    };
  }

  console.error('[executive-api]', error);
  return { status: 500, body: { error: pgError?.message || 'Internal server error' } };
}
