import Link from "next/link";
export default function CrmNav() {
  const L = "px-3 py-1.5 rounded-lg text-sm hover:bg-blue-50";
  return (
    <nav className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-1 sm:gap-2">
        <span className="font-bold text-[#0046ff] mr-1 sm:mr-3">CRM Shinhan</span>
        <Link href="/insights" className={L}>Insight</Link>
        <Link href="/customers" className={L}>Khách hàng</Link>
        <Link href="/products" className={L}>Sản phẩm</Link>
        <Link href="/message" className={L}>Soạn tin</Link>
        <Link href="/admin/weights" className={L}>Admin</Link>
      </div>
    </nav>
  );
}
