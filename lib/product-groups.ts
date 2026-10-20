/**
 * 7 nhóm sản phẩm khớp danh mục trên vay.kimminso.com.
 * Giữ thứ tự cố định để trang Sản phẩm và bộ lọc khách luôn hiển thị giống nhau.
 */
export type ProductGroup = {
  code: string;
  label: string;
};

export const PRODUCT_GROUPS: ProductGroup[] = [
  { code: "vay", label: "Vay vốn" },
  { code: "huy-dong", label: "Huy động" },
  { code: "the", label: "Thẻ" },
  { code: "quoc-te", label: "Thanh toán quốc tế" },
  { code: "bao-hiem", label: "Bảo hiểm" },
  { code: "thanh-toan", label: "Giải pháp thanh toán" },
  { code: "pwm", label: "Quản lý tài sản (PWM)" },
];

export const PRODUCT_GROUP_LABEL: Record<string, string> = Object.fromEntries(
  PRODUCT_GROUPS.map((group) => [group.code, group.label]),
);
