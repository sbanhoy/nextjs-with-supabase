"use server";

import { revalidatePath } from "next/cache";
import { requireAuthorizedUser } from "@/lib/supabase/authorization";

const CHANNELS = new Set(["call", "zalo", "meeting"]);

export async function logInteraction(cid: string, channel: string, convert = false) {
  const { supabase, user } = await requireAuthorizedUser();
  if (!cid || cid.length > 128) return { error: "Mã khách hàng không hợp lệ" };
  if (!CHANNELS.has(channel)) return { error: "Kênh tương tác không hợp lệ" };

  const { data: customer, error: customerError } = await supabase
    .from("customers").select("id").eq("id", cid).eq("rm_id", user.id).maybeSingle();
  if (customerError || !customer) return { error: "Không tìm thấy khách hàng hoặc không có quyền truy cập" };

  const { error } = await supabase.from("interactions").insert({
    customer_id: cid, rm_id: user.id, channel, note: "Ghi từ CRM",
  });
  if (error) return { error: "Không thể lưu tương tác. Vui lòng thử lại." };

  if (convert) {
    const { error: updateError } = await supabase.from("customers")
      .update({ stage: "customer" }).eq("id", cid).eq("rm_id", user.id);
    if (updateError) {
      revalidatePath("/customers"); revalidatePath("/insights");
      return { error: "Đã ghi tương tác nhưng chưa cập nhật trạng thái khách hàng." };
    }
  }
  revalidatePath("/customers"); revalidatePath("/insights");
  return { error: null };
}

export async function deleteCustomer(cid: string) {
  const { supabase, user } = await requireAuthorizedUser();
  if (!cid || cid.length > 128) return { error: "Mã khách hàng không hợp lệ" };
  const { error } = await supabase.from("customers")
    .delete().eq("id", cid).eq("rm_id", user.id);
  if (error) return { error: "Không thể xoá khách hàng. Vui lòng thử lại." };
  revalidatePath("/customers"); revalidatePath("/insights");
  return { error: null };
}
