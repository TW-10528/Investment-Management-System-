// Detect viewing-only documents (contracts, amendments, audits, financial statements)
// These should be stored WITHOUT extraction/processing

export interface ViewingDocumentType {
  isViewingDoc: boolean
  docType?: 'contract' | 'amendment' | 'audit' | 'financial_statement' | 'nav_report' | 'commitment_notice'
  reason?: string
}

/**
 * Detect if a document is for viewing only (not a transaction).
 * Returns early to skip extraction for these document types.
 */
export function detectViewingDocument(text: string, fileName: string = ''): ViewingDocumentType {
  const lowerText = text.toLowerCase()
  const lowerName = fileName.toLowerCase()

  // ── Contract / Amendment Indicators ──────────────────────────────────────
  // Japanese: 契約書, 変更契約, 投資事業有限責任組合契約
  const contractPatterns = [
    /契約書/, // Contract
    /変更契約/, // Amendment agreement
    /投資事業有限責任組合契約/, // Partnership agreement
    /組合契約/, // LP agreement
    /投資契約/, // Investment agreement
    /合意書/, // Memorandum of understanding
    /覚書/, // Agreement/Note
  ]

  const isJapaneseContract = contractPatterns.some(p => p.test(text))

  // English: contract, agreement, amendment
  const englishContractKeywords = ['partnership agreement', 'investment agreement', 'limited partnership agreement', 'amended and restated', 'amendment agreement']
  const isEnglishContract = englishContractKeywords.some(kw => lowerText.includes(kw))

  if (isJapaneseContract || isEnglishContract) {
    return {
      isViewingDoc: true,
      docType: isJapaneseContract && /変更契約/.test(text) ? 'amendment' : 'contract',
      reason: 'Partnership/investment contract or amendment',
    }
  }

  // ── Audit / Financial Statement Indicators ───────────────────────────────
  // Japanese: 監査報告書, 財務諸表, 決算書, 監査意見書
  const auditPatterns = [
    /監査報告書/, // Audit report
    /監査意見書/, // Audit opinion
    /財務諸表/, // Financial statements
    /決算書/, // Financial statements
    /監査済み/, // Audited
    /監査人/, // Auditor
  ]

  const isAudit = auditPatterns.some(p => p.test(text))
  const isEnglishAudit = ['audit report', 'financial statements', 'auditor\'s report', 'independent auditor'].some(kw => lowerText.includes(kw))

  if (isAudit || isEnglishAudit) {
    return {
      isViewingDoc: true,
      docType: 'audit',
      reason: 'Audit report or financial statement',
    }
  }

  // ── NAV / Valuation Report ──────────────────────────────────────────────
  // Japanese: NAV, 純資産価値, 評価報告書
  const navPatterns = [
    /NAV|net asset value|純資産価値|評価報告書/i,
  ]

  const isNav = navPatterns.some(p => p.test(text))

  if (isNav) {
    return {
      isViewingDoc: true,
      docType: 'nav_report',
      reason: 'NAV or valuation report',
    }
  }

  // ── Commitment Notice (Contract Level) ────────────────────────────────────
  // If it says "Commitment" in title but NOT "Capital Call" or "Distribution" in body
  const hasCommitmentTitle = /commitment|commitment amount|commitment agreement/i.test(lowerName)
  const hasTransactionKeywords = /capital call|distribution|call notice|capital contribution request/i.test(lowerText)

  if (hasCommitmentTitle && !hasTransactionKeywords) {
    return {
      isViewingDoc: true,
      docType: 'commitment_notice',
      reason: 'Commitment document (not a transaction notice)',
    }
  }

  // Not a viewing document - proceed with normal extraction
  return {
    isViewingDoc: false,
  }
}
