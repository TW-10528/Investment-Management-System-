/**
 * Idempotent add — SDGs 投資事業有限責任組合 (SDG LPS).
 *
 * Adds the fund record so uploaded SDG notices auto-resolve
 * (fundParsers/fund-resolver.ts) and show as their own section on the Funds page —
 * WITHOUT wiping existing data like seed.ts.
 *
 * This is a JPY fund: the commitment and all amounts are in yen, no FX conversion.
 *
 * Run once:  npx tsx prisma/addSdgFund.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FUND_NAME = 'SDGs 投資事業有限責任組合'

async function main() {
  const existing = await prisma.fund.findFirst({
    where: { fundName: { contains: 'SDG', mode: 'insensitive' } },
  })

  if (existing) {
    console.log(`✔ SDG fund already present (id=${existing.id}) — nothing to do.`)
    return
  }

  const fund = await prisma.fund.create({
    data: {
      fundName:      FUND_NAME,
      fundNameJp:    'SDGs投資事業有限責任組合',
      // 無限責任組合員 (GP / managing partner) per the notices — renamed AFM in 2026.
      // (株式会社サードウェーブ is the LP being billed, not the manager.)
      manager:       'AFM株式会社（旧 アストマックス・ファンド・マネジメント株式会社）',
      administrator: 'AFM株式会社（旧 アストマックス・ファンド・マネジメント株式会社）',
      strategy:      'Other',
      vintageYear:   2022,
      currency:      'JPY',
      contractDate:  new Date('2022-10-07'),
      // ¥3,000,000,000 = total commitment across the three closes (2022-10-07 ¥1B →
      // 2023-10-02 ¥2B → 2024-09-20 ¥3B, per 投資キャッシュフロー_SDGS LPS.xlsx).
      // JPY held in this field; no FX (matches the extractor, which keeps yen in *Usd).
      commitmentUsd: 3_000_000_000,
      isActive:      true,
    },
  })
  console.log(`✔ SDG fund created (id=${fund.id}): ${FUND_NAME}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
