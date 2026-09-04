"use client";

import { useMemo } from "react";
import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components. Must be a hook because the Clerk
 * session comes from React context. Not used in Phase 1 (the /debug check runs
 * server-side) — provided so later phases have a browser client ready.
 */
export function useBrowserSupabaseClient() {
  const { session } = useSession();

  return useMemo(
    () =>
      createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          async accessToken() {
            return session?.getToken() ?? null;
          },
        },
      ),
    [session],
  );
}
