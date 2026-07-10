import { applyCalcEngine, runCrossChecks } from '../ai-extract/calc';
import type { Extracted, PrevState, CalcResult, CrossCheck } from '../ai-extract/calc';
import type { ExtractionResult, ValidationCheck, CalculatedValues } from './types';

export interface ValidationGateResult {
  level: 'auto' | 'warning' | 'review' | 'reject';
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
}

/**
 * Convert extracted values to the format expected by calc engine
 */
function normalizeExtractedValues(values: ExtractionResult): Extracted {
  return {
    B_capital_contribution: values.B_capital_contribution ?? null,
    C_distribution_received: values.C_distribution_received ?? null,
    D_reinvestable: values.D_reinvestable ?? null,
    return_of_capital: null,
    gain: null,
    interest: null,
    report_provided_unfunded_before: null,
    report_provided_remaining_after: null,
    subsequent_close_interest: null,
    notes: values.notes || '',
  };
}

/**
 * Calculate derived values (E, F, G) using deterministic engine
 * E = cumulative contributions
 * F = unfunded commitment
 * G = cumulative net cash flow
 */
export function calculateDerivedValues(
  extractedValues: ExtractionResult,
  fundKey: string,
  previousE: number = 0,
  previousF: number = 0,
  previousG: number = 0
): CalculatedValues {
  const normalized = normalizeExtractedValues(extractedValues);
  const prevState: PrevState = {
    E: previousE,
    F: previousF,
    G: previousG,
  };

  const result = applyCalcEngine(normalized, fundKey, prevState);

  return {
    E_cumulative_drawn: result.E,
    F_investment_capacity: result.F,
    G_net_cash_flow: result.G,
  };
}

/**
 * Run validation checks on extracted and calculated values
 */
export function validateExtraction(
  extractedValues: ExtractionResult,
  calculatedValues: CalculatedValues,
  reportedNetWire?: number
): ValidationCheck[] {
  const normalized = normalizeExtractedValues(extractedValues);
  const calcResult: CalcResult = {
    B: extractedValues.B_capital_contribution ?? 0,
    C: extractedValues.C_distribution_received ?? 0,
    D: extractedValues.D_reinvestable ?? 0,
    L: (extractedValues.C_distribution_received ?? 0) - (extractedValues.D_reinvestable ?? 0),
    cash_flow: -(extractedValues.B_capital_contribution ?? 0) + (extractedValues.C_distribution_received ?? 0),
    E: calculatedValues.E_cumulative_drawn,
    F: calculatedValues.F_investment_capacity,
    G: calculatedValues.G_net_cash_flow,
    commitment_inferred: null,
  };

  const checks = runCrossChecks(normalized, calcResult, reportedNetWire);

  return checks.map(
    (check: CrossCheck): ValidationCheck => ({
      rule: check.rule,
      pass: check.pass,
      detail: check.detail,
    })
  );
}

/**
 * Determine the confidence gate level based on validation results
 */
export function determineValidationGate(
  validationChecks: ValidationCheck[]
): ValidationGateResult {
  const allPass = validationChecks.every((check) => check.pass);

  if (allPass) {
    return {
      level: 'auto',
      label: 'All checks passed - safe to save',
      color: 'green',
    };
  }

  const failCount = validationChecks.filter((check) => !check.pass).length;
  const totalCount = validationChecks.length;
  const failPct = (failCount / totalCount) * 100;

  if (failPct <= 25) {
    return {
      level: 'warning',
      label: 'Some checks failed - review before saving',
      color: 'yellow',
    };
  }

  if (failPct <= 50) {
    return {
      level: 'review',
      label: 'Multiple checks failed - manual review required',
      color: 'orange',
    };
  }

  return {
    level: 'reject',
    label: 'Critical validation errors - do not save',
    color: 'red',
  };
}

/**
 * Full validation pipeline: extract → calculate → validate → gate
 */
export function performFullValidation(
  extractedValues: ExtractionResult,
  fundKey: string,
  previousE?: number,
  previousF?: number,
  previousG?: number,
  reportedNetWire?: number
): {
  calculated: CalculatedValues;
  checks: ValidationCheck[];
  gate: ValidationGateResult;
} {
  const calculated = calculateDerivedValues(
    extractedValues,
    fundKey,
    previousE,
    previousF,
    previousG
  );

  const checks = validateExtraction(extractedValues, calculated, reportedNetWire);

  const gate = determineValidationGate(checks);

  return { calculated, checks, gate };
}
