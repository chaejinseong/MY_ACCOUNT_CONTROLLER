"use client";

import { useState } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}

// 계정 등록/수정 폼에서 공용으로 쓰는 비밀번호 입력 필드.
// "자동 생성" 버튼으로 POST /accounts/generate-password를 호출해 값을 채워주고,
// "보기" 토글로 평문 확인도 가능하게 한다.
export function PasswordField({ label, value, onChange, required, placeholder }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const { password } = await apiFetch<{ password: string }>("/accounts/generate-password", {
        method: "POST",
        body: JSON.stringify({ length: 16 }),
      });
      onChange(password);
      setShow(true);
    } catch (err) {
      setError(getErrorMessage(err, "비밀번호를 생성하지 못했습니다."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-700 dark:text-neutral-300">{label}</span>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="shrink-0 rounded border border-neutral-300 px-2 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          {show ? "숨기기" : "보기"}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="shrink-0 rounded border border-neutral-300 px-2 text-xs text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
        >
          {generating ? "생성 중..." : "자동 생성"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}
