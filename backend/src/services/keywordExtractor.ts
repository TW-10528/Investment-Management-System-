// Lightweight keyword-based field extractor used by the rules engine.
// Searches for a keyword in text and extracts the value that follows it.

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseMoney(s: string): number {
  return parseFloat(s.replace(/[$,¥\s()]/g, ''))
}

function extractDates(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/g))
    found.add(`${m[1]}-${m[2]}-${m[3]}`)
  for (const m of text.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g)) {
    const [a, b, y] = [parseInt(m[1]), parseInt(m[2]), m[3]]
    found.add(`${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`)
  }
  const monthRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi
  for (const m of text.matchAll(monthRe)) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo) found.add(`${m[3]}-${mo}-${String(parseInt(m[2])).padStart(2, '0')}`)
  }
  return [...found].sort()
}

export function extractByKeyword(
  text:           string,
  keywords:       string[],
  extractionType: 'usd' | 'pct' | 'number' | 'date' | 'text',
): string | number | undefined {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(escaped + '[^\\n]{0,120}', 'i')
    const m  = text.match(re)
    if (!m) continue
    const context = m[0]

    if (extractionType === 'usd') {
      const moneyRe = /(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/
      const mv = context.slice(kw.length).match(moneyRe)
      if (mv) {
        const v = parseMoney(mv[1])
        if (!isNaN(v) && v >= 0) return v
      }
    } else if (extractionType === 'pct') {
      const pv = context.slice(kw.length).match(/([\d.]+)\s*%/)
      if (pv) {
        const v = parseFloat(pv[1])
        if (!isNaN(v)) return v
      }
    } else if (extractionType === 'number') {
      const nv = context.slice(kw.length).match(/([\d,]+(?:\.\d+)?)/)
      if (nv) {
        const v = parseFloat(nv[1].replace(/,/g, ''))
        if (!isNaN(v)) return v
      }
    } else if (extractionType === 'date') {
      const dates = extractDates(context.slice(kw.length))
      if (dates[0]) return dates[0]
    } else if (extractionType === 'text') {
      const tv = context.slice(kw.length).match(/[:=\s]+([A-Za-z0-9][^\n,;]{1,60})/)
      if (tv) return tv[1].trim()
    }
  }
  return undefined
}
