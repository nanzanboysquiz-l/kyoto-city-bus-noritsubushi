import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient:
  | {
      url: string;
      publishableKey: string;
      client: SupabaseClient;
    }
  | undefined;

export function getSupabaseClient(
  url: string,
  publishableKey: string,
): SupabaseClient {
  if (
    !cachedClient ||
    cachedClient.url !== url ||
    cachedClient.publishableKey !== publishableKey
  ) {
    cachedClient = {
      url,
      publishableKey,
      client: createClient(url, publishableKey),
    };
  }

  return cachedClient.client;
}
