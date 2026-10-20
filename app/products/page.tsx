import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/server";
import { PRODUCT_GROUPS } from "@/lib/product-groups";
import { firstRelated } from "@/lib/related";

export const metadata = { title: "Sản phẩm · CRM Shinhan" };

type ProductStat = { leads: number; customers: number };
type GroupTotal = { leads: Set<string>; customers: Set<string> };

async function ProductsContent() {
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/login");

  const [{ data: products, error: productsError }, { data: holdings, error: holdingsError }] =
    await Promise.all([
      sb.from("products")
        .select("id, code, name, category")
        .eq("is_active", true)
        .order("name"),
      sb.from("product_holdings")
        .select("product_id, customer_id, customers!inner(stage)")
        .eq("status", "interested"),
    ]);
  const loadError = productsError ?? holdingsError;

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const productStats = new Map<string, ProductStat>();
  const groupTotals = new Map<string, GroupTotal>(
    PRODUCT_GROUPS.map((group) => [group.code, { leads: new Set(), customers: new Set() }]),
  );
  const allLeads = new Set<string>();
  const allCustomers = new Set<string>();
  const seen = new Set<string>();

  for (const holding of holdings ?? []) {
    const productId = holding.product_id;
    const customerId = holding.customer_id;
    if (!productId || !customerId) continue;

    // Một khách có thể có nhiều dòng holding cho cùng sản phẩm; chỉ tính 1 lần.
    const pairKey = `${productId}:${customerId}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const product = productById.get(productId);
    if (!product) continue;

    const stage = firstRelated(holding.customers)?.stage;
    if (stage !== "lead" && stage !== "customer") continue;

    const stat = productStats.get(productId) ?? { leads: 0, customers: 0 };
    if (stage === "lead") {
      stat.leads += 1;
      groupTotals.get(product.category)?.leads.add(customerId);
      allLeads.add(customerId);
    } else {
      stat.customers += 1;
      groupTotals.get(product.category)?.customers.add(customerId);
      allCustomers.add(customerId);
    }
    productStats.set(productId, stat);
  }

  const groups = PRODUCT_GROUPS.map((group) => {
    const groupProducts = (products ?? [])
      .filter((product) => product.category === group.code)
      .map((product) => ({
        ...product,
        stat: productStats.get(product.id) ?? { leads: 0, customers: 0 },
      }));
    const totals = groupTotals.get(group.code);
    return {
      ...group,
      products: groupProducts,
      totals: {
        leads: totals?.leads.size ?? 0,
        customers: totals?.customers.size ?? 0,
      },
    };
  });
  const totalProducts = groups.reduce((sum, group) => sum + group.products.length, 0);

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-gray-500">Danh mục sản phẩm · Shinhan Bank</div>
        <h1 className="text-2xl font-bold">Sản phẩm &amp; nhu cầu khách</h1>
        <p className="text-sm text-gray-500">
          Theo dõi lead và khách đang quan tâm theo từng nhóm sản phẩm. Bấm một sản phẩm để xem danh sách khách.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Chưa tải được dữ liệu sản phẩm. Anh tải lại trang giúp em nhé.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2 md:gap-3" aria-label="Tổng quan sản phẩm">
            {[
              { label: "Sản phẩm đang bán", value: totalProducts },
              { label: "Lead quan tâm", value: allLeads.size },
              { label: "Khách quan tâm", value: allCustomers.size },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border bg-white p-3 md:p-4">
                <div className="text-[11px] md:text-xs text-gray-500">{item.label}</div>
                <div className="text-xl md:text-2xl font-semibold text-[#0046ff]">{item.value}</div>
              </div>
            ))}
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            {groups.map((group) => (
              <article key={group.code} className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="border-b border-blue-100 bg-blue-50/50 px-4 py-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-[#0046ff]">{group.label}</h2>
                    <p className="text-xs text-gray-500">{group.products.length} sản phẩm</p>
                  </div>
                  <div className="text-right text-xs leading-5 shrink-0">
                    <div><span className="font-semibold text-[#0046ff]">{group.totals.leads}</span> lead</div>
                    <div><span className="font-semibold text-[#0046ff]">{group.totals.customers}</span> khách</div>
                  </div>
                </div>

                {group.products.length ? (
                  <ul className="divide-y">
                    {group.products.map((product) => (
                      <li key={product.id}>
                        <Link
                          href={`/customers?product=${encodeURIComponent(product.code ?? "")}`}
                          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0046ff]"
                        >
                          <span className="text-sm">{product.name}</span>
                          <span className="shrink-0 text-right text-xs text-gray-500">
                            {product.stat.leads || product.stat.customers ? (
                              <>
                                <span className="font-medium text-[#0046ff]">{product.stat.leads}</span> lead ·{" "}
                                <span className="font-medium text-[#0046ff]">{product.stat.customers}</span> khách
                              </>
                            ) : (
                              "Chưa có ai quan tâm"
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">Chưa có sản phẩm trong nhóm này.</p>
                )}
              </article>
            ))}
          </section>

          <p className="text-xs text-gray-400">
            Số liệu lấy từ sở thích sản phẩm đã ghi nhận. Một khách quan tâm nhiều sản phẩm được tính ở từng sản phẩm;
            tổng của nhóm tính theo số người.
          </p>
        </>
      )}
    </main>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<main className="max-w-6xl mx-auto p-8 text-gray-500">Đang tải sản phẩm…</main>}>
      <ProductsContent />
    </Suspense>
  );
}
