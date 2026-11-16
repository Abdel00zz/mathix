/**
 * Adaptateur universel Web Standard Request/Response <-> Vercel ApiRequest/ApiResponse.
 * Permet d'exposer directement `/api/auth`, `/api/sync`, `/api/users`, `/api/progress`, etc.
 * dans Next.js App Router (`app/api/.../route.ts`) sans réécrire la logique métier.
 */
import type { ApiRequest, ApiResponse } from '../professor/shared.js';

export type LegacyApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<unknown> | unknown;

export function createNextRouteHandler(handler: LegacyApiHandler) {
  return async function routeHandler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: unknown = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const ct = headers['content-type'] || '';
      if (ct.includes('application/json')) {
        body = await request.json().catch(() => ({}));
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const raw = await request.text().catch(() => '');
        body = Object.fromEntries(new URLSearchParams(raw));
      } else {
        body = await request.text().catch(() => undefined);
      }
    }

    let statusCode = 200;
    let payload: unknown = null;
    const responseHeaders = new Headers();

    const apiRes: ApiResponse = {
      status(code: number) {
        statusCode = code;
        return apiRes;
      },
      json(data: unknown) {
        payload = data;
        if (!responseHeaders.has('content-type')) {
          responseHeaders.set('content-type', 'application/json; charset=utf-8');
        }
        return apiRes;
      },
      setHeader(name: string, value: string | string[]) {
        if (Array.isArray(value)) {
          responseHeaders.delete(name);
          value.forEach((v) => responseHeaders.append(name, v));
        } else {
          responseHeaders.set(name, value);
        }
      },
    };

    const apiReq: ApiRequest = { method: request.method, query, headers, body };
    await handler(apiReq, apiRes);

    const bodyText = payload === null || payload === undefined ? '' : JSON.stringify(payload);
    return new Response(bodyText, { status: statusCode, headers: responseHeaders });
  };
}
