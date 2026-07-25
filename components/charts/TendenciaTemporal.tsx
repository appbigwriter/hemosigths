import type { TemporalPoint } from "@/lib/charts";

export interface TendenciaTemporalProps {
  data: TemporalPoint[];
  biomarkerLabel?: string;
}

export default function TendenciaTemporal({
  data,
  biomarkerLabel,
}: TendenciaTemporalProps) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">Sem serie historica.</p>;
  }
  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <h3 className="mb-2 text-sm font-semibold">
        Tendencia temporal{biomarkerLabel ? ` — ${biomarkerLabel}` : ""}
      </h3>
      <p className="text-xs text-neutral-500">
        Linha do tempo (Recharts) — implementado em MP-009.
      </p>
    </div>
  );
}
