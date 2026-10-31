/**
 * Logic thuần cho trang /analytics.
 *
 * Tách khỏi component để test được mà không cần Supabase, không cần DOM.
 * Mọi hàm ở đây nhận dữ liệu đã đọc từ DB và trả về số đã tính.
 */

export const DAY_MS = 86_400_000;

export type InsightRow = {
  id: string;
  customer_id: string | null;
  status: string;
  insight_type: string;
  weight_version: number;
  created_at: string;
  updated_at: string;
  priority_score: number;
};

export type CustomerRow = {
  id: string;
  source: string | null;
  stage: string | null;
};

export type WeightVersionRow = {
  version: number;
  name: string | null;
  is_active: boolean;
};

export type SourceBucket = {
  total: number;
  leads: number;
  customers: number;
  converted: number;
};

export type VersionBucket = {
  version: number;
  name: string | null;
  is_active: boolean;
  total: number;
  acceptRate: number;
};

export type WeekBucket = {
  key: string;
  start: Date;
  created: number;
  converted: number;
};

const DECIDED = new Set(["accepted", "converted", "dismissed"]);
const ACCEPTED = new Set(["accepted", "converted"]);

/** Phần trăm, làm tròn. Mẫu số 0 thì trả 0 thay vì NaN. */
export function rate(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

/** Đầu tuần (thứ Hai, 00:00 UTC) của ngày cho trước. */
export function weekStart(date: Date): Date {
  const x = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Chủ nhật = 6 → 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/** `count` tuần gần nhất, cũ → mới, dùng cho biểu đồ. */
export function buildWeeks(now: Date, count = 8): WeekBucket[] {
  const thisWeek = weekStart(now);
  const weeks: WeekBucket[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const start = new Date(thisWeek.getTime() - k * 7 * DAY_MS);
    weeks.push({ key: start.toISOString().slice(0, 10), start, created: 0, converted: 0 });
  }
  return weeks;
}

export function funnelCounts(insights: InsightRow[]) {
  const generated = insights.length;
  const accepted = insights.filter((i) => ACCEPTED.has(i.status)).length;
  const converted = insights.filter((i) => i.status === "converted").length;
  return { generated, accepted, converted };
}

/** Số insight đã có quyết định của RM (nhận / chốt / bỏ qua). */
export function decidedCount(insights: InsightRow[]): number {
  return insights.filter((i) => DECIDED.has(i.status)).length;
}

/** Tỷ lệ nhận trên số insight đã có quyết định (bỏ qua đang mở / hết hạn). */
export function acceptRate(insights: InsightRow[]): number {
  const decided = insights.filter((i) => DECIDED.has(i.status)).length;
  const accepted = insights.filter((i) => ACCEPTED.has(i.status)).length;
  return rate(accepted, decided);
}

/** Bảng conversion theo nguồn khách, sắp xếp giảm dần theo số khách. */
export function sourceTable(
  customers: CustomerRow[],
  insights: InsightRow[],
  sourceOf: Map<string, string>,
  limit = 8,
): Array<[string, SourceBucket]> {
  const rows = new Map<string, SourceBucket>();

  for (const c of customers) {
    const key = c.source ?? "Chưa rõ";
    const row = rows.get(key) ?? { total: 0, leads: 0, customers: 0, converted: 0 };
    row.total += 1;
    if (c.stage === "lead") row.leads += 1;
    else row.customers += 1;
    rows.set(key, row);
  }

  for (const i of insights) {
    if (i.status !== "converted" || !i.customer_id) continue;
    const key = sourceOf.get(i.customer_id);
    if (!key) continue;
    const row = rows.get(key);
    if (row) row.converted += 1;
  }

  return [...rows.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, limit);
}

/** Tỷ lệ nhận theo từng phiên bản trọng số. */
export function versionTable(
  versions: WeightVersionRow[],
  insights: InsightRow[],
): VersionBucket[] {
  return versions.map((v) => {
    const rows = insights.filter((i) => i.weight_version === v.version);
    const decided = rows.filter((i) => DECIDED.has(i.status)).length;
    const accepted = rows.filter((i) => ACCEPTED.has(i.status)).length;
    return {
      version: v.version,
      name: v.name,
      is_active: v.is_active,
      total: rows.length,
      acceptRate: rate(accepted, decided),
    };
  });
}

/** Đếm insight tạo mới và đã chốt theo từng tuần đã dựng ở buildWeeks. */
export function weeklySeries(weeks: WeekBucket[], insights: InsightRow[]): WeekBucket[] {
  const out = weeks.map((w) => ({ ...w }));
  const index = new Map(out.map((w, i) => [w.key, i]));

  for (const i of insights) {
    const ci = index.get(weekStart(new Date(i.created_at)).toISOString().slice(0, 10));
    if (ci !== undefined) out[ci].created += 1;

    if (i.status === "converted") {
      const ui = index.get(weekStart(new Date(i.updated_at)).toISOString().slice(0, 10));
      if (ui !== undefined) out[ui].converted += 1;
    }
  }

  return out;
}

/** Insight đã nhận mà khách đó có ít nhất một tương tác được ghi nhận. */
export function contactedCount(insights: InsightRow[], contactedCustomerIds: Set<string>): number {
  return insights.filter(
    (i) => ACCEPTED.has(i.status) && i.customer_id && contactedCustomerIds.has(i.customer_id),
  ).length;
}
