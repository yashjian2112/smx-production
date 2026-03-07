import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login'];
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (publicPaths.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const token = req.cookies.get('smx_session')?.value;
  if (!token && path !== '/login') {
    const login = new URL('/login', req.url);
    login.searchParams.set('from', path);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
