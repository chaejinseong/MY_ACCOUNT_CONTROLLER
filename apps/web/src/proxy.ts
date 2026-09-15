import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

// /login을 제외한 모든 화면(대시보드/계정/메일/설정)에 적용 — 여기서 먼저 걸러내면
// (app)/layout.tsx에서 클라이언트 리다이렉트로 인한 깜빡임 없이 서버에서 바로 걸러진다.
// 브라우저의 Cookie 헤더를 그대로 백엔드에 전달해 세션을 확인한다.
// (Next.js 16부터 "middleware.ts" 대신 "proxy.ts" + export function proxy() 컨벤션 사용)
export const config = {
  matcher: ["/", "/accounts/:path*", "/mail/:path*", "/settings/:path*"],
};

export async function proxy(request: NextRequest) {
  const cookie = request.headers.get("cookie") ?? "";

  let session: { userId?: string; unlocked?: boolean } | null = null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: { cookie } });
    if (res.ok) {
      session = await res.json();
    }
  } catch {
    session = null;
  }

  if (!session?.userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!session.unlocked) {
    return NextResponse.redirect(new URL("/login?step=unlock", request.url));
  }

  return NextResponse.next();
}
