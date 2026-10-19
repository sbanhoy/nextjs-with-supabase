import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** A valid auth session alone must not grant access to this single-user CRM. */
export async function requireAuthorizedUser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/login");

  const { data: profile, error: profileError } = await supabase
    .from("rm_users").select("id, role").eq("id", user.id).maybeSingle();
  if (profileError || !profile) redirect("/auth/login?error=not-authorized");
  return { supabase, user, profile };
}

export async function requireAdminUser() {
  const context = await requireAuthorizedUser();
  if (context.profile.role !== "admin") redirect("/insights?error=forbidden");
  return context;
}
