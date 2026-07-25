import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Callback n8n apos parsing nao implementado (MP-003)" },
    { status: 501 },
  );
}
