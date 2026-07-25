import type { BiomarkerFlag } from "@/lib/types";

export interface RadarPoint {
  biomarker: string;
  value: number;
  refMin?: number;
  refMax?: number;
  flag: BiomarkerFlag;
}

export interface TemporalPoint {
  date: string;
  value: number;
  refMin?: number;
  refMax?: number;
}

export interface ComparativeBar {
  biomarker: string;
  atual: number;
  referencia?: number;
}

export function buildRadarData(_input: unknown): RadarPoint[] {
  throw new Error("buildRadarData nao implementado (MP-009)");
}

export function buildTemporalSeries(_input: unknown): TemporalPoint[] {
  throw new Error("buildTemporalSeries nao implementado (MP-009)");
}

export function buildComparativeBars(_input: unknown): ComparativeBar[] {
  throw new Error("buildComparativeBars nao implementado (MP-009)");
}
