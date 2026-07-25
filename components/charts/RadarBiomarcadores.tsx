import type { RadarPoint } from "@/lib/charts";

export interface RadarBiomarcadoresProps {
  data: RadarPoint[];
}

export default function RadarBiomarcadores({ data }: RadarBiomarcadoresProps) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">Sem dados de biomarcadores.</p>;
  }
  return (
    <div className="rounded-md border border-neutral-200 p-4">
      <h3 className="mb-2 text-sm font-semibold">Radar de Biomarcadores</h3>
      <p className="text-xs text-neutral-500">
        Visualizacao radar (Recharts) — implementado em MP-009.
      </p>
    </div>
  );
}
