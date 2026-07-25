import type { ComparativeBar } from "@/lib/charts";

export interface ComparativoBarrasProps {
  data: ComparativeBar[];
}

export default function ComparativoBarras({ data }: ComparativoBarrasProps) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">Sem dados comparativos.</p>;
  }
  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <h3 className="mb-2 text-sm font-semibold">Comparativo por parâmetro</h3>
      <p className="text-xs text-neutral-500">
        Barras comparativas (Recharts) — implementado em MP-009.
      </p>
    </div>
  );
}
