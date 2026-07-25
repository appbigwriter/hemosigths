"use client";

import { useState } from "react";

export interface AnamneseFormProps {
  patientId: string;
  onSubmit?: (values: Record<string, unknown>) => Promise<void> | void;
}

export default function AnamneseForm({ patientId, onSubmit }: AnamneseFormProps) {
  const [dietType, setDietType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit?.({ patientId, dietType });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tipo de dieta</span>
        <input
          className="w-full rounded border border-neutral-300 px-2 py-1"
          value={dietType}
          onChange={(e) => setDietType(e.target.value)}
          placeholder="onivoro | vegetariano | vegano | restritivo | outro"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {submitting ? "Salvando..." : "Salvar anamnese"}
      </button>
      <p className="text-xs text-neutral-500">
        Formulario completo (sintomas, medicacoes, comorbidades, estilo de vida)
        implementado em MP-002.
      </p>
    </form>
  );
}
