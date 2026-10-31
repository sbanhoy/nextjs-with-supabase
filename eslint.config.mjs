import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Nợ tạm thời: các trang này đọc thẳng kết quả Supabase chưa có kiểu
    // (client chưa sinh Database generic), nên `any` nằm ở lớp biên dữ liệu.
    // Khi có `supabase gen types` thì thay bằng kiểu sinh tự động và bỏ khối này.
    files: [
      "app/message/page.tsx",
      "app/customers/\\[id\\]/page.tsx",
      "app/admin/weights/page.tsx",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];

export default eslintConfig;
