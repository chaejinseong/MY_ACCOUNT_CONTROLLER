const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// 백엔드가 httpOnly 쿠키 세션이라 credentials: "include"가 필수 — 이게 빠지면
// 크로스 오리진(3000 → 3001) 요청에 세션 쿠키가 실리지 않는다.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? `요청이 실패했습니다 (${res.status})`);
  }

  return body as T;
}

// ApiError뿐 아니라 브라우저 API가 던지는 DOMException(WebAuthn 등) 같은 일반 Error도
// 메시지를 그대로 보여준다 — ApiError만 걸러내면 원인 파악이 안 되는 뭉뚱그린 메시지만 남는다.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
