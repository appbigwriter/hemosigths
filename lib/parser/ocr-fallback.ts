import type { ParsedLabExam } from "@/lib/types";

export async function parseWithOcrFallback(
  _buffer: Buffer,
): Promise<ParsedLabExam> {
  throw new Error("OCR fallback (Tesseract.js) nao implementado (MP-003)");
}
