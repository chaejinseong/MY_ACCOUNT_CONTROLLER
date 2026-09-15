"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "대시보드" },
  { href: "/accounts", label: "계정 관리" },
  { href: "/mail/rules", label: "메일 규칙" },
  { href: "/mail/review", label: "오늘의 검토함" },
  { href: "/mail/important", label: "중요 메일" },
  { href: "/settings", label: "설정" },
];

// 로그인/잠금해제 여부는 src/middleware.ts가 먼저 걸러준다 — 여기까지 렌더링이
// 도달했다면 이미 인증된 상태라는 뜻이라 이 레이아웃은 nav만 그리면 된다.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLock() {
    await apiFetch("/auth/lock", { method: "POST" }).catch(() => {});
    router.push("/login?step=unlock");
  }

  async function handleLogout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  return (
    <div className="flex flex-1">
      <nav className="flex w-56 shrink-0 flex-col justify-between border-r border-neutral-200 p-4 dark:border-neutral-800">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded px-3 py-2 text-sm ${
                  pathname === item.href
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
          <li>
            <button
              type="button"
              onClick={handleLock}
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              잠금
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              로그아웃
            </button>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
