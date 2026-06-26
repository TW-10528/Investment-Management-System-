import type { ExtractionResult, ValidationCheck, CalculatedValues } from './types';
export interface ValidationGateResult {
    level: 'auto' | 'warning' | 'review' | 'reject';
    label: string;
    color: 'green' | 'yellow' | 'orange' | 'red';
}
/**
 * Calculate derived values (E, F, G) using deterministic engine
 * E = cumulative contributions
 * F = unfunded commitment
 * G = cumulative net cash flow
 */
export declare function calculateDerivedValues(extractedValues: ExtractionResult, fundKey: string, previousE?: number, previousF?: number, previousG?: number): CalculatedValues;
/**
 * Run validation checks on extracted and calculated values
 */
export declare function validateExtraction(extractedValues: ExtractionResult, calculatedValues: CalculatedValues, reportedNetWire?: number): ValidationCheck[];
/**
 * Determine the confidence gate level based on validation results
 */
export declare function determineValidationGate(validationChecks: ValidationCheck[]): ValidationGateResult;
/**
 * Full validation pipeline: extract → calculate → validate → gate
 */
export declare function performFullValidation(extractedValues: ExtractionResult, fundKey: string, previousE?: number, previousF?: number, previousG?: number, reportedNetWire?: number): {
    calculated: CalculatedValues;
    checks: ValidationCheck[];
    gate: ValidationGateResult;
};
//# sourceMappingURL=validation-engine.d.ts.map