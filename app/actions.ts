"use server";
import { getSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function logInteraction(cid: string, channel: string, convert = false) {
  const s = await getSupabase();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Chưa đăng nhập" };
  const { error } = await s.from("interactions").insert({ customer_id: cid, rm_id: user.id, channel, note: "Ghi từ CRM" });
  if (convert && !error) await s.from("customers").update({ stage: "customer" }).eq("id", cid);
  revalidatePath("/customers"); revalidatePath("/insights");
  return { error: error?.message ?? null };
}

export async function deleteCustomer(cid: string) {
  const s = await getSupabase();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { error: "Chưa đăng nhập" };
  const { error } = await s.from("customers").delete().eq("id", cid);
  revalidatePath("/customers"); revalidatePath("/insights");
  return { error: error?.message ?? null };
}
