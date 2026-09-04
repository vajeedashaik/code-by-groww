import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Attaches the Clerk session token so Postgres RLS sees `auth.jwt()->>'sub'`
 * as the current Clerk user id. Native third-party auth integration — no JWT
 * template, no Supabase auth cookies.
 */
export function createServerSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}
