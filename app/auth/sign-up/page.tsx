import Link from "next/link";

export default function SignUpUnavailablePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <section className="w-full max-w-md space-y-4 rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Tài khoản CRM được cấp riêng</h1>
        <p className="text-sm text-gray-600">
          Đây là CRM nội bộ dành cho người dùng đã được cấp quyền. Tự đăng ký không tạo quyền truy cập.
          Vui lòng liên hệ quản trị viên nếu cần tài khoản.
        </p>
        <Link href="/auth/login" className="text-sm text-blue-700 underline">Quay lại đăng nhập</Link>
      </section>
    </main>
  );
}
