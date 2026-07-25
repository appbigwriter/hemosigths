export default function EvolucaoPage({
  params,
}: {
  params: { patientId: string };
}) {
  return (
    <div>
      <h1 className="text-xl font-bold">Evolução</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paciente: <code>{params.patientId}</code>
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        Gráficos de evolução longitudinal — implementado no MP-007/MP-009.
      </p>
    </div>
  );
}
