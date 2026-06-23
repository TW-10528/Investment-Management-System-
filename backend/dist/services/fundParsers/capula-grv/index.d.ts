import { extractCapulaGrvReport } from './extractor';
import type { CapulaPreviousState } from './types';
import type { ParsedFundNotice } from '../types';
export { extractCapulaGrvReport };
export type { CapulaReport, CapulaPreviousState } from './types';
export declare function parseCapulaGrv(rawText: string, previousState?: CapulaPreviousState | null): ParsedFundNotice;
//# sourceMappingURL=index.d.ts.map