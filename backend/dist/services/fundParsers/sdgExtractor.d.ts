/**
 * SDGs 投資事業有限責任組合 (SDG Fund) Extractor
 *
 * Port of the Python reference implementation from sdg_lps_module.py
 * Uses deterministic field extraction with flexible Japanese patterns
 * to parse SDG capital call and distribution notices.
 */
import { type SDGExtractionResult, type SDGPreviousState } from '../ocr/sdgExtractor';
import type { ParsedFundNotice } from './types';
/**
 * Convert SDG extraction result to ParsedFundNotice interface
 */
export declare function extractSdgNotice(text: string, fileName?: string): ParsedFundNotice | null;
/**
 * Extract SDG notice with previous state for cumulative calculations
 * Used when processing multiple SDG notices in sequence
 */
export declare function extractSdgNoticeWithPreviousState(text: string, fileName?: string, previousState?: SDGPreviousState | null): SDGExtractionResult;
//# sourceMappingURL=sdgExtractor.d.ts.map