"use client";

export type InsightReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "edited_by_physician";

export interface InsightReviewCardProps {
  hypothesis: string;
  severity: "info" | "atencao" | "critico";
  sourceReference?: string;
  status: InsightReviewStatus;
  onApprove?: () => void;
  onReject?: () => void;
}

const SEVERITY_STYLES: Record<InsightReviewCardProps["severity"], string> = {
  info: "border-neutral-300",
  atencao: "border-amber-400",
  critico: "border-red-500",
};

export default function InsightReviewCard({
  hypothesis,
  severity,
  sourceReference,
  status,
  onApprove,
  onReject,
}: InsightReviewCardProps) {
  return (
    <div className={`rounded-md border-l-4 bg-white p-4 shadow-sm ${SEVERITY_STYLES[severity]}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {severity}
        </span>
        <span className="text-xs text-neutral-400">{status}</span>
      </div>
      <p className="text-sm text-neutral-800">{hypothesis}</p>
      {sourceReference ? (
        <p className="mt-1 text-xs text-neutral-500">Fonte: {sourceReference}</p>
      ) : null}
      {status === "pending_review" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="rounded bg-green-600 px-2.5 py-1 text-xs text-white"
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={onReject}
            className="rounded bg-neutral-200 px-2.5 py-1 text-xs text-neutral-700"
          >
            Rejeitar
          </button>
        </div>
      ) : null}
    </div>
  );
}
