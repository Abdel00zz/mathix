import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-apprendre-path', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!api(?:/|$)|_next/|icons/|data/|vendor/|.*\\.).*)'],
};
