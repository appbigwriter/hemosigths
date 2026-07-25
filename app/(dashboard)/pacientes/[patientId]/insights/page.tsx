export default function InsightsPage({
  params,
}: {
  params: { patientId: string };
}) {
  return (
    <div>
      <h1 className="text-xl font-bold">Insights</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paciente: <code>{params.patientId}</code>
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        Fila de insights pendentes/aprovados — motor de regras no MP-004.
      </p>
    </div>
  );
}
