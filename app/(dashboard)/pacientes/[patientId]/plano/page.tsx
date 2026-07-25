export default function PlanoPage({
  params,
}: {
  params: { patientId: string };
}) {
  return (
    <div>
      <h1 className="text-xl font-bold">Plano de tratamento</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paciente: <code>{params.patientId}</code>
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        Plano ativo a partir de sugestões aprovadas — implementado no MP-006.
      </p>
    </div>
  );
}
