export default function CrmNav() {
  const L = "px-3 py-1.5 rounded-lg text-sm hover:bg-blue-50";
  return (
    <nav className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
        <span className="font-bold text-[#0046ff] mr-3">Shinhan RM</span>
        <a href="/insights" className={L}>Insight</a>
        <a href="/customers" className={L}>Khách hàng</a>
        <a href="/admin/weights" className={L}>Admin</a>
      </div>
    </nav>
  );
}
