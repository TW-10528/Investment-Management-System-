/**
 * PDF Parser Service — Node.js port of the Python pdfplumber extractor.
 * Uses pdf-parse to extract text, then applies regex patterns.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

export interface ExtractedNotice {
  noticeType:    'capital_call' | 'distribution' | 'financial_statement'
  confidence:    number   // 0.0–1.0
  amounts:       number[]
  dates:         string[]
  grossCallUsd?: number
  netCallUsd?:   number
  distributionUsd?: number
  reinvestableUsd?: number
  navUsd?:       number
  navDate?:      string
  callNumber?:   number
  callPct?:      number
  fxRate?:       number
  wireReference?: string
  period?:       string
  // Investment targets (from capital call notices)
  investmentTargets?: Array<{
    projectName:    string
    amountUsd?:     number
    investmentType?: string
    sector?:        string
    geography?:     string
    dealType?:      string
  }>
  // Distribution breakdown
  distributionBreakdown?: {
    capitalReturnUsd?: number
    incomeUsd?:        number
    recallableUsd?:    number
  }
  keywords: string[]
}

// ── Regex helpers ─────────────────────────────────────────────────────────────

function extractUsdAmounts(text: string): number[] {
  const patterns = [
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:million|M)/gi,
    /USD\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /\$([\d,]+(?:\.\d{1,2})?)/g,
  ]
  const amounts: number[] = []
  for (const p of patterns) {
    let m: RegExpExecArray | null
    while ((m = p.exec(text)) !== null) {
      const val = parseFloat(m[1].replace(/,/g, ''))
      if (!isNaN(val) && val > 0) {
        const mult = /million|M/i.test(m[0]) ? 1_000_000 : 1
        amounts.push(val * mult)
      }
    }
  }
  return [...new Set(amounts)]
}

function extractDates(text: string): string[] {
  const patterns = [
    /(\d{4}[-/]\d{2}[-/]\d{2})/g,           // YYYY-MM-DD
    /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/g,        // MM/DD/YYYY
    /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g, // Japanese
  ]
  const dates: string[] = []
  for (const p of patterns) {
    let m: RegExpExecArray | null
    while ((m = p.exec(text)) !== null) {
      if (p.source.includes('年')) {
        dates.push(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`)
      } else {
        dates.push(m[1])
      }
    }
  }
  return [...new Set(dates)].slice(0, 10)
}

function detectNoticeType(text: string): 'capital_call' | 'distribution' | 'financial_statement' {
  const lc = text.toLowerCase()
  const ccScore = [
    'capital call', 'drawdown', 'contribution notice', '出資要請', 'wire instructions',
  ].filter(k => lc.includes(k)).length

  const distScore = [
    'distribution notice', 'distribution proceeds', '分配通知', 'return of capital',
  ].filter(k => lc.includes(k)).length

  const navScore = [
    'financial statement', 'net asset value', 'nav report', '財務諸表', 'quarterly report',
  ].filter(k => lc.includes(k)).length

  const max = Math.max(ccScore, distScore, navScore)
  if (max === 0) return 'capital_call'
  if (ccScore === max)   return 'capital_call'
  if (distScore === max) return 'distribution'
  return 'financial_statement'
}

function extractCallNumber(text: string): number | undefined {
  const m = text.match(/(?:call|drawdown)\s*#?\s*(\d+)/i)
  return m ? parseInt(m[1]) : undefined
}

function extractFxRate(text: string): number | undefined {
  const m = text.match(/(?:fx|exchange)\s*rate[^:]*:\s*([\d.]+)/i) ||
            text.match(/([\d.]+)\s*(?:jpy|¥)\s*per\s*(?:usd|\$)/i)
  return m ? parseFloat(m[1]) : undefined
}

function extractKeywords(text: string): string[] {
  const kw = [
    'buyout', 'venture', 'growth', 'infrastructure', 'real estate',
    'credit', 'secondaries', 'recallable', 'management fee', 'carry',
    'technology', 'healthcare', 'energy', 'consumer',
    'north america', 'europe', 'asia pacific', 'japan', 'global',
  ]
  return kw.filter(k => text.toLowerCase().includes(k))
}

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parsePdf(buffer: Buffer): Promise<ExtractedNotice> {
  let text = ''
  try {
    const data = await pdfParse(buffer)
    text = data.text
  } catch {
    return {
      noticeType: 'capital_call',
      confidence: 0,
      amounts:    [],
      dates:      [],
      keywords:   [],
    }
  }

  const noticeType = detectNoticeType(text)
  const amounts    = extractUsdAmounts(text)
  const dates      = extractDates(text)
  const keywords   = extractKeywords(text)

  // Confidence scoring
  let score = 0
  if (amounts.length > 0) score += 0.3
  if (dates.length > 0)   score += 0.2
  if (keywords.length > 0)score += 0.1
  if (text.length > 200)  score += 0.2
  const typeMatch = detectNoticeType(text) !== 'capital_call' || text.length > 100
  if (typeMatch)           score += 0.2
  const confidence = Math.min(score, 1.0)

  const result: ExtractedNotice = { noticeType, confidence, amounts, dates, keywords }

  // Capital call specific extraction
  if (noticeType === 'capital_call') {
    result.grossCallUsd  = amounts[0]
    result.netCallUsd    = amounts[1] ?? amounts[0]
    result.callNumber    = extractCallNumber(text)
    result.fxRate        = extractFxRate(text)

    // Investment targets
    const targetMatches = text.matchAll(/(?:investment in|invested in|portfolio company)[:\s]+([A-Z][a-zA-Z\s&,.-]{3,60})/g)
    const targets = []
    for (const m of targetMatches) {
      targets.push({
        projectName:    m[1].trim(),
        investmentType: 'equity',
        sector:         keywords.find(k => ['technology','healthcare','energy','consumer'].includes(k)),
        geography:      keywords.find(k => ['north america','europe','asia pacific','japan','global'].includes(k)),
      })
    }
    if (targets.length > 0) result.investmentTargets = targets
  }

  // Distribution specific
  if (noticeType === 'distribution') {
    result.distributionUsd  = amounts[0]
    result.reinvestableUsd  = amounts[1]
    const capitalM = text.match(/return of capital[:\s]+([\d,.]+)/i)
    const incomeM  = text.match(/(?:income|profit)[:\s]+([\d,.]+)/i)
    result.distributionBreakdown = {
      capitalReturnUsd: capitalM ? parseFloat(capitalM[1].replace(/,/g, '')) : undefined,
      incomeUsd:        incomeM  ? parseFloat(incomeM[1].replace(/,/g, ''))  : undefined,
    }
  }

  // NAV / financial statement
  if (noticeType === 'financial_statement') {
    result.navUsd  = amounts[0]
    result.navDate = dates[0]
    const periodM  = text.match(/(?:quarter|Q[1-4]|year)[^.]*(?:20\d{2})/i)
    result.period  = periodM?.[0]?.trim()
  }

  return result
}
