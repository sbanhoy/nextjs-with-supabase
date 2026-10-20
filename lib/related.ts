/**
 * PostgREST trả quan hệ many-to-one dạng object, nhưng TypeScript của supabase-js
 * (khi chưa có generated types) lại suy ra dạng mảng. Hàm này đọc được cả hai.
 */
export function firstRelated<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}
