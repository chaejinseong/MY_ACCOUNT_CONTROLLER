"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

const NAV_ITEMS = [
  { href: "/", label: "대시보드" },
  { href: "/accounts", label: "계정 관리" },
  { href: "/mail/rules", label: "메일 규칙" },
  { href: "/mail/review", label: "오늘의 검토함" },
  { href: "/mail/important", label: "중요 메일" },
  { href: "/settings", label: "설정" },
];

// 기술설계서 4장 라우트 중 /login을 제외한 전부가 이 레이아웃 아래에 있다 — 로그인 +
// 마스터 비밀번호 잠금해제가 안 된 세션은 여기서 전부 /login으로 되돌려보낸다.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, userId, unlocked } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      router.replace("/login");
    } else if (!unlocked) {
      router.replace("/login?step=unlock");
    }
  }, [loading, userId, unlocked, router]);

  if (loading || !userId || !unlocked) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">확인 중...</div>
    );
  }

  return (
    <div className="flex flex-1">
      <nav className="w-56 shrink-0 border-r border-neutral-200 p-4 dark:border-neutral-800">
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
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
