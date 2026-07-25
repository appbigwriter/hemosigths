import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Revisao manual de parsing nao implementada (MP-003)" },
    { status: 501 },
  );
}
