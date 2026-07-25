import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        MP-000 · Fundação
      </p>
      <h1 className="text-3xl font-bold tracking-tight">HemoSights</h1>
      <p className="mt-3 text-neutral-600">
        Hemograma Insights — transforma o hemograma em acompanhamento contínuo
        de saúde. Fundação do projeto pronta: stack montada, schema Drizzle,
        isolamento multi-tenant via RLS e estrutura de pastas.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/pacientes"
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Ir para o painel
        </Link>
        <Link
          href="/login"
          className="rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
