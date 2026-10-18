"use server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

async function sb() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}
export async function logInteraction(cid: string, channel: string, convert = false) {
  const s = await sb(); const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Chưa đăng nhập" };
  const { error } = await s.from("interactions").insert({ customer_id: cid, rm_id: user.id, channel, note: "Ghi từ CRM" });
  if (convert && !error) await s.from("customers").update({ stage: "customer" }).eq("id", cid);
  revalidatePath("/customers"); revalidatePath("/insights");
  return { error: error?.message ?? null };
}
export async function deleteCustomer(cid: string) {
  const s = await sb();
  const { error } = await s.from("customers").delete().eq("id", cid);
  revalidatePath("/customers"); revalidatePath("/insights");
  return { error: error?.message ?? null };
}
