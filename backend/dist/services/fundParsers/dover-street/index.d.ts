import { extractDoverStreetReport } from './extractor';
import type { DoverPreviousState } from './types';
import type { ParsedFundNotice } from '../types';
export { extractDoverStreetReport };
export type { DoverStreetReport, DoverPreviousState } from './types';
export declare function parseDoverStreet(rawText: string, previousState?: DoverPreviousState | null, fileName?: string): ParsedFundNotice;
//# sourceMappingURL=index.d.ts.map