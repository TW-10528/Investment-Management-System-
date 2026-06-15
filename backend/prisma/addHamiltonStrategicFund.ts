/**
 * Idempotent add — Hamilton Lane Strategic Opportunities Fund IX-B LP.
 *
 * Adds the fund record so uploaded Hamilton Strategic notices auto-resolve
 * (fundParsers/fund-resolver.ts) and show as their own section on the Funds page —
 * WITHOUT wiping existing data like seed.ts.
 *
 * Run once:  npx tsx prisma/addHamiltonStrategicFund.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FUND_NAME = 'Hamilton Lane Strategic Opportunities Fund IX-B LP'

async function main() {
  const existing = await prisma.fund.findFirst({
    where: { fundName: { contains: 'Hamilton Lane Strategic Opportunities', mode: 'insensitive' } },
  })

  if (existing) {
    console.log(`✔ Hamilton Strategic fund already present (id=${existing.id}) — nothing to do.`)
    return
  }

  const fund = await prisma.fund.create({
    data: {
      fundName:      FUND_NAME,
      manager:       'Hamilton Lane Advisors, L.L.C.',
      administrator: 'Hamilton Lane',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 3_000_000,
      isActive:      true,
    },
  })
  console.log(`✔ Hamilton Strategic fund created (id=${fund.id}): ${FUND_NAME}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
