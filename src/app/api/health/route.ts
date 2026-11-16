import { getPublicCloudConfig } from '@/server/cloud/googleAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const cfg = getPublicCloudConfig();
  return new Response(
    JSON.stringify({
      ok: true,
      runtime: 'nextjs-app-router',
      app: 'apprendre-next',
      redisConfigured: cfg.redisEnabled,
      firestoreConfigured: cfg.firestoreEnabled,
      timestamp: Date.now(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
