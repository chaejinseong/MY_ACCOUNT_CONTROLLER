"use client";

import { useEffect, useState } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";

interface CandidateItem {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string;
}

export default function MailReviewPage() {
  const [candidates, setCandidates] = useState<CandidateItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  function loadCandidates() {
    apiFetch<CandidateItem[]>("/email-candidates")
      .then(setCandidates)
      .catch((err) => setError(getErrorMessage(err, "후보 메일을 불러오지 못했습니다.")));
  }

  useEffect(() => {
    loadCandidates();
  }, []);

  async function handleScan() {
    setError(null);
    setInfo(null);
    setScanning(true);
    try {
      const result = await apiFetch<{ scannedAccounts: number; createdCandidates: number }>(
        "/email-candidates/scan",
        { method: "POST" },
      );
      setInfo(`계정 ${result.scannedAccounts}개 스캔, 새 후보 ${result.createdCandidates}건 발견`);
      loadCandidates();
    } catch (err) {
      setError(getErrorMessage(err, "스캔에 실패했습니다."));
    } finally {
      setScanning(false);
    }
  }

  async function handleApprove(id: string) {
    setError(null);
    try {
      await apiFetch(`/email-candidates/${id}/approve`, { method: "POST" });
      setCandidates((prev) => prev?.filter((c) => c.id !== id) ?? null);
    } catch (err) {
      setError(getErrorMessage(err, "승인하지 못했습니다."));
    }
  }

  async function handleExclude(id: string) {
    setError(null);
    try {
      await apiFetch(`/email-candidates/${id}/exclude`, { method: "POST" });
      setCandidates((prev) => prev?.filter((c) => c.id !== id) ?? null);
    } catch (err) {
      setError(getErrorMessage(err, "제외하지 못했습니다."));
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">오늘의 검토함</h1>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {scanning ? "스캔 중..." : "지금 스캔"}
        </button>
      </div>

      {info && <p className="text-sm text-green-700 dark:text-green-500">{info}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!candidates && <p className="text-sm text-neutral-500">불러오는 중...</p>}
      {candidates && candidates.length === 0 && (
        <p className="text-sm text-neutral-500">대기 중인 후보 메일이 없습니다. &quot;지금 스캔&quot;을 눌러 확인해보세요.</p>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="space-y-2">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="flex items-center justify-between rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            >
              <div>
                <p className="font-medium">{candidate.subject || "(제목 없음)"}</p>
                <p className="text-xs text-neutral-500">
                  {candidate.sender} · {new Date(candidate.receivedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleApprove(candidate.id)}
                  className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={() => handleExclude(candidate.id)}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                >
                  제외
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
