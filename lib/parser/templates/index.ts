import FLEURY from "./fleury";

export interface LabParserTemplate {
  labName: string;
  templateJson: Record<string, unknown>;
}

const REGISTRY: LabParserTemplate[] = [FLEURY];

export function resolveTemplate(labName?: string | null): LabParserTemplate | null {
  if (!labName) return null;
  const needle = labName.trim().toLowerCase();
  return REGISTRY.find((t) => t.labName.toLowerCase() === needle) ?? null;
}
