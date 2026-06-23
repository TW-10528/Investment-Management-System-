import { extractNbRealestateReport } from './extractor';
import type { NbPreviousState } from './types';
import type { ParsedFundNotice } from '../types';
export { extractNbRealestateReport };
export type { NbRealEstateReport, NbPreviousState } from './types';
export declare function parseNbRealEstate(rawText: string, previousState?: NbPreviousState | null): ParsedFundNotice;
//# sourceMappingURL=index.d.ts.map