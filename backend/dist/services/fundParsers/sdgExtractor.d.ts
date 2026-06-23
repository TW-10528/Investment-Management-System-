import type { ParsedFundNotice } from './types';
/**
 * Parse an SDG notice. Returns null if `text` is not an SDG notice.
 *
 * Excel column mapping (all JPY, stored as-is in *Usd fields):
 *   B  grossCallUsd     = 払込み頂く金額                      (capital call notices)
 *   C  distributionUsd  = 分配金額 / 貴社への分配金額         (distribution notices)
 *   D  reinvestableUsd  = 0 (SDG distributions are all cash-out)
 *   current_transaction_cash_flow = -B + C
 */
export declare function extractSdgNotice(text: string, fileName?: string): ParsedFundNotice | null;
//# sourceMappingURL=sdgExtractor.d.ts.map