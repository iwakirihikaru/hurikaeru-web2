import { createClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(url, anonKey);
}

export function getSupabaseClassId() {
  const classId = process.env.NEXT_PUBLIC_SUPABASE_CLASS_ID;
  if (!classId) {
    throw new Error("NEXT_PUBLIC_SUPABASE_CLASS_ID is not configured.");
  }
  return classId;
}

export function getSupabaseOrganizationName() {
  return process.env.NEXT_PUBLIC_SUPABASE_ORGANIZATION_NAME ?? "学校名未設定";
}
