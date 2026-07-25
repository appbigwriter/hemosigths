"use client";

export type SuggestionReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "edited_by_physician";

export interface SuggestionReviewCardProps {
  type: "exame_complementar" | "suplementacao" | "dieta" | "estilo_de_vida";
  summary: string;
  status: SuggestionReviewStatus;
  onApprove?: () => void;
  onReject?: () => void;
}

const TYPE_LABEL: Record<SuggestionReviewCardProps["type"], string> = {
  exame_complementar: "Exame complementar",
  suplementacao: "Suplementação",
  dieta: "Dieta",
  estilo_de_vida: "Estilo de vida",
};

export default function SuggestionReviewCard({
  type,
  summary,
  status,
  onApprove,
  onReject,
}: SuggestionReviewCardProps) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {TYPE_LABEL[type]}
        </span>
        <span className="text-xs text-neutral-400">{status}</span>
      </div>
      <p className="text-sm text-neutral-800">{summary}</p>
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
