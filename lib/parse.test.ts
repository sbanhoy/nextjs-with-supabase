import { describe, expect, it } from "vitest";
import { parseBulkRows, toDate, toNum } from "./parse";

describe("toDate", () => {
  it("đổi dd/mm/yyyy sang yyyy-mm-dd", () => {
    expect(toDate("02/01/1990")).toBe("1990-01-02");
  });

  it("đổi ngày dùng dấu chấm, không cần số 0 đứng đầu", () => {
    expect(toDate("2.1.1990")).toBe("1990-01-02");
  });

  it("trả null cho chuỗi rỗng", () => {
    expect(toDate("")).toBeNull();
    expect(toDate("   ")).toBeNull();
  });

  it("giữ nguyên chuỗi không đúng dạng, đã trim", () => {
    expect(toDate("abc")).toBe("abc");
    expect(toDate("  abc  ")).toBe("abc");
  });
});

describe("toNum", () => {
  it("bỏ dấu chấm phân cách nghìn", () => {
    expect(toNum("500.000.000")).toBe(500000000);
    expect(toNum("1.234.567")).toBe(1234567);
    expect(toNum(" 500.000.000 ")).toBe(500000000);
  });

  it("bỏ hậu tố đơn vị và dấu phân cách khác", () => {
    expect(toNum("500.000.000 đ")).toBe(500000000);
    expect(toNum("500,000,000")).toBe(500000000);
  });

  it("đọc số nguyên không có dấu chấm", () => {
    expect(toNum("1234")).toBe(1234);
  });

  it("giữ nguyên số thập phân có một dấu chấm", () => {
    expect(toNum("12.5")).toBe(12.5);
  });

  it("trả 0 cho chuỗi rỗng", () => {
    expect(toNum("")).toBe(0);
  });

  it("trả 0 khi không có chữ số", () => {
    expect(toNum("abc")).toBe(0);
  });
});

describe("parseBulkRows", () => {
  it("bỏ dòng tiêu đề, tách cột theo tab/chấm phẩy và bỏ ngoặc kép", () => {
    const input = [
      "Tên\tSĐT\tPhân khúc\tTài sản\tTài sản 3 tháng trước\tNgày sinh\tlead/customer\tNguồn\tGhi chú",
      'Nguyễn Văn A\t0912345678\tpremier\t2500000000\t2300000000\t15/03/1975\tcustomer\t"Giới thiệu"\tKhách VIP',
      'Trần B;0987654321;affluent;1000000000;;02/01/1990;lead;Đối tác;"Ghi chú, có dấu phẩy"',
    ].join("\n");

    const rows = parseBulkRows(input);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      "Nguyễn Văn A",
      "0912345678",
      "premier",
      "2500000000",
      "2300000000",
      "15/03/1975",
      "customer",
      "Giới thiệu",
      "Khách VIP",
    ]);
    expect(rows[1]).toEqual([
      "Trần B",
      "0987654321",
      "affluent",
      "1000000000",
      "",
      "02/01/1990",
      "lead",
      "Đối tác",
      "Ghi chú, có dấu phẩy",
    ]);
  });

  it("bỏ dòng rỗng và dòng tiêu đề kiểu name", () => {
    const input = ["", "name,phone", "Lê C,0900000000", "", "  ,  "].join("\r\n");

    expect(parseBulkRows(input)).toEqual([["Lê C", "0900000000"]]);
  });

  it("không tách phẩy nằm trong ngoặc kép", () => {
    const input = ['"Phạm D, Jr.",0911111111', "Tên,SĐT"].join("\n");

    expect(parseBulkRows(input)).toEqual([["Phạm D, Jr.", "0911111111"]]);
  });
});
