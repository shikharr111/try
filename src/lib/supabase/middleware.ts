import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth/", "/privacy", "/terms", "/camera", "/api/cron/"];

/** Refreshes the auth cookie and redirects unauthenticated visitors to /login. Uses getUser() (server-verified), not getSession(). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return new NextResponse("Supabase is not configured (see .env.example).", { status: 500 });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    const next = path + request.nextUrl.search;
    if (next !== "/") redirect.searchParams.set("next", next);
    return NextResponse.redirect(redirect);
  }
  if (user && (path === "/" || path === "/login" || path === "/signup")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/workspace";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  return response;
}
