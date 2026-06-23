import { extractHamiltonStrategicReport } from './extractor';
import type { HamStratPreviousState } from './types';
import type { ParsedFundNotice } from '../types';
export { extractHamiltonStrategicReport };
export type { HamiltonStrategicReport, HamStratPreviousState } from './types';
export declare function parseHamiltonStrategic(rawText: string, previousState?: HamStratPreviousState | null): ParsedFundNotice;
//# sourceMappingURL=index.d.ts.map