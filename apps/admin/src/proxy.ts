import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { readAdminEnv } from './core/config/env';

/**
 * Refreshes the Supabase session cookie and sends signed-out visitors to /login.
 * This is an optimistic check only; every page and server action re-checks access with
 * requireOperator(), and every admin RPC re-checks role + MFA in the database.
 */
export async function proxy(request: NextRequest) {
  const { backend } = readAdminEnv();
  const isPublic = request.nextUrl.pathname.startsWith('/login');
  if (!backend) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(backend.url, backend.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}

// Public brand images (logos, app icons) load before sign-in; they contain no data.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)'],
};
