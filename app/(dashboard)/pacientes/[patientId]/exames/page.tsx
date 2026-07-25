import UploadExameForm from "@/components/forms/UploadExameForm";

export default function ExamesPage({
  params,
}: {
  params: { patientId: string };
}) {
  return (
    <div>
      <h1 className="text-xl font-bold">Exames</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Paciente: <code>{params.patientId}</code>
      </p>
      <div className="mt-6 max-w-xl">
        <UploadExameForm patientId={params.patientId} />
      </div>
    </div>
  );
}
