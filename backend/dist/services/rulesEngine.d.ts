export interface AttributeInfo {
    name: string;
    label: string;
    noticeTypes: string[];
    description: string;
}
export declare const AVAILABLE_ATTRIBUTES: AttributeInfo[];
export declare function buildScope(data: Record<string, any>): Record<string, number>;
export interface EvalResult {
    value: number;
    inputs: Record<string, number>;
    outputText: string;
    error?: string;
}
export declare function evaluateFormula(formula: string, scope: Record<string, number>, outputUnit?: string): EvalResult;
export declare function runRulesForNotice(noticeId: string, extractedData: Record<string, any>, fundId?: string, noticeType?: string): Promise<void>;
//# sourceMappingURL=rulesEngine.d.ts.map