import type { AppStore } from "@/lib/app-store";
import { gasAppStore } from "@/lib/gas-app-store";
import { localDemoAppStore } from "@/lib/local-demo-app-store";
import { supabaseAppStore } from "@/lib/supabase-app-store";

export function getAppStore(): AppStore {
  const mode = process.env.NEXT_PUBLIC_APP_STORE_MODE;
  if (mode === "supabase") {
    return supabaseAppStore;
  }
  if (mode === "gas") {
    return gasAppStore;
  }
  return localDemoAppStore;
}
