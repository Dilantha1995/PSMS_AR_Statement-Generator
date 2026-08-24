import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth'];

export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/_next')) {
    return NextResponse.next();
  }
  const sessionCookie = req.cookies.get('better-auth.session_token');
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
