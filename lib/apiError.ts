/**
 * Error payloads for route handlers.
 *
 * Route handlers used to return `{ error: 'Failed to X', details: error.message }`,
 * which pushes raw exception text — SQL fragments, column names, driver
 * internals — into the browser, and into anything that logs a failed response.
 * This repo is public, so that detail is worth keeping server-side.
 *
 * The full error still goes to the server log at every call site; only what
 * crosses the wire changes. In development the detail is preserved inline so
 * debugging a route is no slower than it was.
 */

const isDev = process.env.NODE_ENV !== 'production';

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export interface ApiErrorPayload {
  error: string;
  details?: string;
}

/**
 * Build the JSON body for a failed request. `publicMessage` is always safe to
 * show a user; the underlying exception is attached only outside production.
 */
export function errorPayload(publicMessage: string, error?: unknown): ApiErrorPayload {
  if (isDev && error !== undefined) {
    return { error: publicMessage, details: messageOf(error) };
  }
  return { error: publicMessage };
}
