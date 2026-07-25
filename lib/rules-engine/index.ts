import type { InsightDraft, ParsedExamResult } from "@/lib/types";

export interface EvaluateRulesInput {
  results: ParsedExamResult[];
  sex?: "M" | "F" | "outro" | null;
  ageYears?: number | null;
}

export async function evaluateRules(
  _input: EvaluateRulesInput,
): Promise<InsightDraft[]> {
  throw new Error("Motor de regras clinicas nao implementado (MP-004)");
}
