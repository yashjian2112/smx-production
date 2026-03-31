import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/api/auth'];
// /print/* is intentionally NOT listed here — all print routes require a valid session
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (publicPaths.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const token = req.cookies.get('smx_session')?.value;
  if (!token && path !== '/login') {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', req.url);
    login.searchParams.set('from', path);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
