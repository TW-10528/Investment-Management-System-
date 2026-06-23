import { extractHamiltonReport } from './extractor';
import type { HamiltonPreviousState } from './types';
import type { ParsedFundNotice } from '../types';
export { extractHamiltonReport };
export type { HamiltonLaneReport, HamiltonPreviousState } from './types';
export declare function parseHamiltonLane(rawText: string, previousState?: HamiltonPreviousState | null): ParsedFundNotice;
//# sourceMappingURL=index.d.ts.map