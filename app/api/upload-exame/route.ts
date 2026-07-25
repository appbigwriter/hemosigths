import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Ingestao de PDF nao implementada (MP-003)" },
    { status: 501 },
  );
}
