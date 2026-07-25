import type { ParsedLabExam } from "@/lib/types";

import { parseWithOcrFallback } from "./ocr-fallback";
import { resolveTemplate } from "./templates";

export interface ParseOptions {
  labName?: string;
}

export async function parseLabExamPdf(
  buffer: Buffer,
  opts: ParseOptions = {},
): Promise<ParsedLabExam> {
  const template = resolveTemplate(opts.labName);
  if (template) {
    throw new Error("Extracao por template nao implementada (MP-003)");
  }
  return parseWithOcrFallback(buffer);
}
