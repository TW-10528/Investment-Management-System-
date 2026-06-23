import { extractSigulerGuffReport } from './extractor';
import type { SigulerPreviousState } from './types';
import type { ParsedFundNotice } from '../types';
export { extractSigulerGuffReport };
export type { SigulerReport, SigulerPreviousState } from './types';
export declare function parseSigulerGuff(rawText: string, previousState?: SigulerPreviousState | null): ParsedFundNotice;
//# sourceMappingURL=index.d.ts.map