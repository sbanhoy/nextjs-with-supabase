"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logInteraction, deleteCustomer } from "@/app/actions";

export default function ContactButtons({ cid, phone, stage, name }: { cid: string; phone?: string | null; stage: string; name: string }) {
  const router = useRouter(); const [busy, start] = useTransition(); const [msg, setMsg] = useState("");
  const B = "px-2 py-1 border rounded text-xs bg-white disabled:opacity-40";
  const log = (channel: string, convert = false) => start(async () => {
    const r = await logInteraction(cid, channel, convert);
    setMsg(r.error ? "Lỗi: " + r.error : "✓ đã ghi"); router.refresh(); setTimeout(() => setMsg(""), 2000);
  });
  const zalo = phone ? `https://zalo.me/${phone.replace(/^0/, "84")}` : null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button className={B} disabled={!phone || busy} title="Gọi" onClick={() => { window.location.href = `tel:${phone}`; log("call"); }}>📞</button>
      <button className={B} disabled={!zalo || busy} title="Zalo" onClick={() => { window.open(zalo!, "_blank"); log("zalo"); }}>💬</button>
      <button className={B} disabled={busy} title="Ghi buổi gặp" onClick={() => log("meeting")}>🤝</button>
      {stage === "lead" && <button className="px-2 py-1 rounded text-xs bg-green-600 text-white" disabled={busy} onClick={() => log("call", true)}>→ KH</button>}
      <button className={B + " text-red-600"} disabled={busy} title="Xoá"
        onClick={() => { if (confirm(`Xoá "${name}"? Dòng này cũng sẽ bị xoá trên Google Sheet.`)) start(async () => { await deleteCustomer(cid); router.refresh(); }); }}>🗑</button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
