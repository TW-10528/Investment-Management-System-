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
      manager:       '株式会社サードウェーブ',
      administrator: '株式会社サードウェーブ',
      strategy:      'Other',
      vintageYear:   2022,
      currency:      'JPY',
      commitmentUsd: 1_000_000_000,   // ¥1,000,000,000 (JPY held in this field; no FX)
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
