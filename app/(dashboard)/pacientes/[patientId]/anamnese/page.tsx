import AnamneseForm from "@/components/forms/AnamneseForm";

export default function AnamnesePage({
  params,
}: {
  params: { patientId: string };
}) {
  return (
    <div>
      <h1 className="text-xl font-bold">Anamnese</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paciente: <code>{params.patientId}</code>
      </p>
      <div className="mt-6 max-w-xl">
        <AnamneseForm patientId={params.patientId} />
      </div>
    </div>
  );
}
