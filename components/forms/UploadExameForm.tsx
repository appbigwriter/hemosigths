"use client";

import { useRef, useState } from "react";

export interface UploadExameFormProps {
  patientId: string;
  onUpload?: (file: File) => Promise<void> | void;
}

export default function UploadExameForm({ patientId, onUpload }: UploadExameFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload?.(file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Hemograma (PDF)</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="block w-full text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={uploading}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {uploading ? "Enviando..." : "Enviar exame"}
      </button>
      <p className="text-xs text-neutral-500">
        Dispara o pipeline de parsing (n8n) — implementado em MP-003.
      </p>
    </form>
  );
}
