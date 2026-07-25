import { z } from "zod";

export const BiomarkerFlag = z.enum(["normal", "low", "high", "critical"]);
export type BiomarkerFlag = z.infer<typeof BiomarkerFlag>;

export const ParsedExamResult = z.object({
  biomarkerCode: z.string(),
  value: z.number(),
  unit: z.string(),
  refMin: z.number().nullable().optional(),
  refMax: z.number().nullable().optional(),
  refSource: z.string().optional(),
  flag: BiomarkerFlag.default("normal"),
});
export type ParsedExamResult = z.infer<typeof ParsedExamResult>;

export const ParsedLabExam = z.object({
  labName: z.string().optional(),
  collectedAt: z.date().nullable().optional(),
  results: z.array(ParsedExamResult),
  confidence: z.number().min(0).max(1),
});
export type ParsedLabExam = z.infer<typeof ParsedLabExam>;

export const InsightSeverity = z.enum(["info", "atencao", "critico"]);
export type InsightSeverity = z.infer<typeof InsightSeverity>;

export const InsightDraft = z.object({
  ruleId: z.string().uuid().nullable().optional(),
  biomarkersInvolved: z.array(z.string()).default([]),
  hypothesis: z.string(),
  severity: InsightSeverity,
  confidenceLevel: z.enum(["alta", "media", "baixa"]),
  sourceReference: z.string(),
});
export type InsightDraft = z.infer<typeof InsightDraft>;

export const SuggestionType = z.enum([
  "exame_complementar",
  "suplementacao",
  "dieta",
  "estilo_de_vida",
]);
export type SuggestionType = z.infer<typeof SuggestionType>;

export const SuggestionDraft = z.object({
  insightId: z.string().uuid().nullable().optional(),
  type: SuggestionType,
  content: z.record(z.unknown()),
});
export type SuggestionDraft = z.infer<typeof SuggestionDraft>;
