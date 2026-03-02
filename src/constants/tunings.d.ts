export interface StringPosition {
  name: string;
  note: string;
  frequency: number;
  stringNumber: number;
  fret?: number;
  displayName?: string;
  targetFrequency?: number;
}

export interface Tuning {
  name: string;
  hz: number;
  strings: StringPosition[];
  allPositions: StringPosition[];
}

export const TUNINGS: {
  standard: Tuning;
  dropD: Tuning;
  halfStepDown: Tuning;
  openG: Tuning;
};

export const DEFAULT_TUNING: string;
