import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "../server/env";

/**
 * Per-request Supabase client bound to the signed-in user's session cookie.
 * Every query therefore runs as that user and Row Level Security applies. There is no service-role client.
 */
export async function createClient() {
  // Reading cookies first opts the page into dynamic rendering, so nothing here runs at build time
  // (when the Supabase env vars may not exist yet).
  const store = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // called from a Server Component: the middleware refreshes the session instead
        }
      },
    },
  });
}
