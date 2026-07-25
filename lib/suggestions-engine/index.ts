import type { InsightDraft, SuggestionDraft } from "@/lib/types";
import type { anamnesis } from "@/lib/db/schema";

export interface GenerateSuggestionsInput {
  insights: InsightDraft[];
  anamnesis?: typeof anamnesis.$inferSelect | null;
}

export async function generateSuggestions(
  _input: GenerateSuggestionsInput,
): Promise<SuggestionDraft[]> {
  throw new Error("Motor de sugestoes nao implementado (MP-005)");
}
