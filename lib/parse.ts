/**
 * Logic thuần dùng cho form nhập khách hàng (tách khỏi app/customers/page.tsx).
 * Hành vi giữ như cũ, riêng toNum hiểu thêm số có dấu chấm phân cách nghìn
 * (trước đây "500.000.000" bị đọc thành 0).
 */

/** Tách cột: tab, chấm phẩy, hoặc phẩy nằm ngoài cặp ngoặc kép. */
const BULK_COLUMN_SEP = /\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/;

/**
 * Chuẩn hoá ngày sinh.
 * - rỗng → null
 * - dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy → yyyy-mm-dd
 * - còn lại → chuỗi đã trim, giữ nguyên
 */
export function toDate(s: string): string | null {
  const t = (s || "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : t;
}

/**
 * Đổi chuỗi số tiền sang Number.
 * - trim, rỗng → 0
 * - chuỗi đúng dạng nhóm nghìn kiểu VN (vd "500.000.000", "1.234.567") → bỏ dấu chấm
 * - còn lại: bỏ mọi ký tự không phải số hoặc dấu chấm rồi Number (vd "12.5" → 12.5)
 * - không đọc được → 0
 */
export function toNum(s: string): number {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t.replace(/[^\d.]/g, "")) || 0;
}

/**
 * Tách khối văn bản dán từ Excel / Google Sheet thành các dòng dữ liệu.
 * Mỗi dòng một mảng cột đã bỏ ngoặc kép bao ngoài và trim; bỏ dòng rỗng
 * và dòng tiêu đề (bắt đầu bằng tên/ten/name/họ).
 */
export function parseBulkRows(text: string): string[][] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(BULK_COLUMN_SEP)
        .map((cell) => cell.replace(/^"|"$/g, "").trim()),
    )
    .filter((row) => row[0] && !/^(tên|ten|name|họ)/i.test(row[0]));
}
