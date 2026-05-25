import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !anonKey) {
  if (typeof window !== "undefined") {
    console.warn(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não definidas em .env.local"
    );
  }
}

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(url, anonKey);
}

type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set?: (name: string, value: string, options?: CookieOptions) => void;
};

export function createSupabaseServerClient(cookieStore: CookieStore) {
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookies) {
        if (!cookieStore.set) return;
        for (const { name, value, options } of cookies) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components fora de Route Handlers — cookies read-only.
          }
        }
      },
    },
  });
}
