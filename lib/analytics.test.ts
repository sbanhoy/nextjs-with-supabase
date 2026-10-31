import { describe, expect, it } from "vitest";
import {
  acceptRate,
  buildWeeks,
  contactedCount,
  funnelCounts,
  rate,
  sourceTable,
  versionTable,
  weekStart,
  weeklySeries,
  type CustomerRow,
  type InsightRow,
  type WeightVersionRow,
} from "./analytics";

function insight(over: Partial<InsightRow> = {}): InsightRow {
  return {
    id: "i1",
    customer_id: "c1",
    status: "open",
    insight_type: "cross_sell",
    weight_version: 3,
    created_at: "2026-10-20T03:00:00.000Z",
    updated_at: "2026-10-20T03:00:00.000Z",
    priority_score: 70,
    ...over,
  };
}

describe("rate", () => {
  it("trả 0 khi mẫu số bằng 0 thay vì NaN", () => {
    expect(rate(0, 0)).toBe(0);
    expect(rate(5, 0)).toBe(0);
  });

  it("làm tròn phần trăm", () => {
    expect(rate(1, 3)).toBe(33);
    expect(rate(2, 3)).toBe(67);
    expect(rate(3, 3)).toBe(100);
  });
});

describe("weekStart", () => {
  it("luôn trả về thứ Hai", () => {
    for (const d of ["2026-10-26", "2026-10-29", "2026-10-31", "2026-11-01"]) {
      expect(weekStart(new Date(`${d}T10:00:00Z`)).getUTCDay()).toBe(1);
    }
  });

  it("giữ nguyên ngày nếu đã là thứ Hai", () => {
    expect(weekStart(new Date("2026-10-26T23:30:00Z")).toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("chủ nhật thuộc tuần bắt đầu từ thứ Hai trước đó", () => {
    expect(weekStart(new Date("2026-11-01T00:30:00Z")).toISOString().slice(0, 10)).toBe("2026-10-26");
  });
});

describe("buildWeeks", () => {
  it("trả đúng số tuần, cũ đến mới, tăng dần", () => {
    const weeks = buildWeeks(new Date("2026-10-31T12:00:00Z"), 8);
    expect(weeks).toHaveLength(8);
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].start.getTime() - weeks[i - 1].start.getTime()).toBe(7 * 86_400_000);
    }
    expect(weeks.at(-1)!.key).toBe("2026-10-26");
  });
});

describe("funnelCounts", () => {
  it("đếm insight tạo, đã nhận và đã chốt", () => {
    const rows = [
      insight({ id: "a", status: "open" }),
      insight({ id: "b", status: "accepted" }),
      insight({ id: "c", status: "converted" }),
      insight({ id: "d", status: "dismissed" }),
    ];
    expect(funnelCounts(rows)).toEqual({ generated: 4, accepted: 2, converted: 1 });
  });

  it("rỗng thì mọi số bằng 0", () => {
    expect(funnelCounts([])).toEqual({ generated: 0, accepted: 0, converted: 0 });
  });
});

describe("acceptRate", () => {
  it("bỏ qua insight đang mở và hết hạn", () => {
    const rows = [
      insight({ id: "a", status: "open" }),
      insight({ id: "b", status: "expired" }),
      insight({ id: "c", status: "accepted" }),
      insight({ id: "d", status: "dismissed" }),
    ];
    expect(acceptRate(rows)).toBe(50);
  });

  it("không có quyết định nào thì trả 0", () => {
    expect(acceptRate([insight({ status: "open" })])).toBe(0);
  });
});

describe("sourceTable", () => {
  const customers: CustomerRow[] = [
    { id: "c1", source: "Zalo", stage: "customer" },
    { id: "c2", source: "Zalo", stage: "lead" },
    { id: "c3", source: null, stage: "lead" },
    { id: "c4", source: "Giới thiệu", stage: "customer" },
  ];

  it("tách lead và khách, gộp khách chưa rõ nguồn", () => {
    const table = sourceTable(customers, [], new Map());
    const zalo = table.find(([name]) => name === "Zalo")![1];
    expect(zalo).toEqual({ total: 2, leads: 1, customers: 1, converted: 0 });
    expect(table.find(([name]) => name === "Chưa rõ")).toBeTruthy();
  });

  it("đếm insight đã chốt về đúng nguồn của khách đó", () => {
    const rows = [
      insight({ id: "a", status: "converted", customer_id: "c1" }),
      insight({ id: "b", status: "converted", customer_id: "c4" }),
      insight({ id: "c", status: "converted", customer_id: "khong-co" }),
      insight({ id: "d", status: "open", customer_id: "c1" }),
    ];
    const sourceOf = new Map([
      ["c1", "Zalo"],
      ["c4", "Giới thiệu"],
    ]);
    const table = sourceTable(customers, rows, sourceOf);
    expect(table.find(([name]) => name === "Zalo")![1].converted).toBe(1);
    expect(table.find(([name]) => name === "Giới thiệu")![1].converted).toBe(1);
  });

  it("sắp xếp giảm dần theo tổng số khách", () => {
    const table = sourceTable(customers, [], new Map());
    expect(table.map(([name]) => name)).toEqual(["Zalo", "Chưa rõ", "Giới thiệu"]);
  });
});

describe("versionTable", () => {
  const versions: WeightVersionRow[] = [
    { version: 3, name: "Q4", is_active: true },
    { version: 2, name: "Q3", is_active: false },
  ];

  it("tính tỷ lệ nhận theo từng phiên bản", () => {
    const rows = [
      insight({ id: "a", weight_version: 3, status: "accepted" }),
      insight({ id: "b", weight_version: 3, status: "dismissed" }),
      insight({ id: "c", weight_version: 2, status: "open" }),
    ];
    const table = versionTable(versions, rows);
    expect(table[0]).toMatchObject({ version: 3, total: 2, acceptRate: 50, is_active: true });
    expect(table[1]).toMatchObject({ version: 2, total: 1, acceptRate: 0 });
  });
});

describe("weeklySeries", () => {
  const now = new Date("2026-10-31T12:00:00Z");

  it("xếp insight vào đúng tuần tạo và tuần chốt", () => {
    const rows = [
      insight({ id: "a", created_at: "2026-10-20T03:00:00Z", status: "converted", updated_at: "2026-10-28T03:00:00Z" }),
      insight({ id: "b", created_at: "2026-10-29T03:00:00Z", status: "open" }),
      insight({ id: "c", created_at: "2026-08-01T03:00:00Z", status: "open" }),
    ];
    const weeks = weeklySeries(buildWeeks(now, 8), rows);
    const createdTotal = weeks.reduce((a, w) => a + w.created, 0);
    expect(createdTotal).toBe(2); // bài của tháng 8 nằm ngoài cửa sổ 8 tuần
    expect(weeks.find((w) => w.key === "2026-10-19")!.created).toBe(1);
    expect(weeks.find((w) => w.key === "2026-10-26")!.created).toBe(1);
    expect(weeks.find((w) => w.key === "2026-10-26")!.converted).toBe(1);
  });

  it("chỉ đếm đã chốt, không đếm bỏ qua", () => {
    const rows = [insight({ status: "dismissed", updated_at: "2026-10-28T03:00:00Z" })];
    const weeks = weeklySeries(buildWeeks(now, 8), rows);
    expect(weeks.reduce((a, w) => a + w.converted, 0)).toBe(0);
  });
});

describe("contactedCount", () => {
  it("chỉ tính insight đã nhận và khách có tương tác", () => {
    const rows = [
      insight({ id: "a", status: "accepted", customer_id: "c1" }),
      insight({ id: "b", status: "accepted", customer_id: "c2" }),
      insight({ id: "c", status: "open", customer_id: "c1" }),
    ];
    expect(contactedCount(rows, new Set(["c1"]))).toBe(1);
  });
});
