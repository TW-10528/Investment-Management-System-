import type { NbRealEstateReport } from './nb-real-estate/types';
import type { HamiltonLaneReport } from './hamilton-lane/types';
import type { HamiltonStrategicReport } from './hamilton-strategic/types';
import type { DoverStreetReport } from './dover-street/types';
export interface InvestmentTarget {
    projectName: string;
    amountUsd?: number;
    sector?: string;
}
export interface ParsedFundNotice {
    fundKey: string;
    fundName: string;
    noticeType: 'capital_call' | 'distribution' | 'capital_and_distribution' | 'financial_statement';
    noticeDate: string;
    dueDate: string;
    grossCallUsd: number;
    distributionUsd: number;
    reinvestableUsd: number;
    managementFeeUsd?: number;
    taxExpenseUsd?: number;
    commitmentUsd: number;
    totalCalledUsd: number;
    unfundedUsd: number;
    currentUnfundedUsd?: number;
    callPct: number;
    returnOfCapitalUsd?: number;
    gainUsd?: number;
    interestUsd?: number;
    wireReference: string | null;
    investmentTargets: InvestmentTarget[];
    confidence: number;
    confidenceGrade: 'high' | 'medium' | 'low';
    rawText?: string;
    extractionLog?: string[];
    fundReport?: NbRealEstateReport | HamiltonLaneReport | HamiltonStrategicReport | DoverStreetReport;
}
//# sourceMappingURL=types.d.ts.map