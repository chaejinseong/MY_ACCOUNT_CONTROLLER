"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface SessionState {
  loading: boolean;
  userId: string | null;
  unlocked: boolean;
}

// 스캐폴딩 단계 구현: 페이지마다 클라이언트에서 /auth/me를 호출해 상태를 확인한다.
// 서버사이드에서 쿠키를 미리 검사해 리다이렉트하는 middleware.ts로 옮기면 깜빡임 없이
// 더 매끄러워지지만, 지금은 라우트 뼈대 확인이 우선이라 나중 개선 과제로 남긴다.
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    userId: null,
    unlocked: false,
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ userId: string; unlocked: boolean }>("/auth/me")
      .then((data) => {
        if (!cancelled) setState({ loading: false, userId: data.userId, unlocked: data.unlocked });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, userId: null, unlocked: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
