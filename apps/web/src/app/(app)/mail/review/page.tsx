"use client";

import { useEffect, useState } from "react";
import { apiFetch, getErrorMessage } from "@/lib/api";

interface CandidateItem {
  id: string;
  sender: string;
  subject: string;
  receivedAt: string;
  rule: { actionType: string };
}

// "승인" 버튼이 실제로 뭘 하는지 규칙 종류별로 다르므로(삭제/스팸 처리 vs 그냥 표시만),
// 헷갈리지 않도록 버튼 문구와 설명을 actionType에 따라 다르게 보여준다.
const ACTION_LABELS: Record<string, { badge: string; approveButton: string; description: string }> = {
  delete_candidate: {
    badge: "삭제 대상",
    approveButton: "삭제하기",
    description: "승인하면 이 메일을 Gmail에서 실제로 삭제합니다.",
  },
  spam_candidate: {
    badge: "스팸 대상",
    approveButton: "스팸 처리",
    description: "승인하면 이 메일을 Gmail에서 스팸으로 신고합니다.",
  },
  important: {
    badge: "중요 메일",
    approveButton: "중요 표시 확인",
    description: "승인하면 메일함은 그대로 두고 \"중요 메일\" 목록에 표시합니다.",
  },
};

function getActionInfo(actionType: string) {
  return (
    ACTION_LABELS[actionType] ?? {
      badge: actionType,
      approveButton: "승인",
      description: "승인하면 이 규칙에 설정된 동작을 수행합니다.",
    }
  );
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
          {candidates.map((candidate) => {
            const action = getActionInfo(candidate.rule.actionType);
            return (
              <li
                key={candidate.id}
                className="flex items-center justify-between gap-3 rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {action.badge}
                    </span>
                    <p className="font-medium">{candidate.subject || "(제목 없음)"}</p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {candidate.sender} · {new Date(candidate.receivedAt).toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">{action.description}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(candidate.id)}
                    className="rounded bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    {action.approveButton}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExclude(candidate.id)}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    무시하고 두기
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
