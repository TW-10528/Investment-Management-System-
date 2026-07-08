/**
 * Idempotent add — Secondary Fund VI-B.
 *
 * Adds the Hamilton Lane fund record so uploaded Hamilton capital-call /
 * distribution notices can auto-resolve (fundParsers/fund-resolver.ts) and show as
 * their own section on the Funds page — WITHOUT wiping existing data like seed.ts.
 *
 * Run once:  npx tsx prisma/addHamiltonFund.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FUND_NAME = 'Hamilton Lane Secondary Fund VI-B'

async function main() {
  const existing = await prisma.fund.findFirst({
    where: { fundName: { contains: 'Secondary Fund VI-B', mode: 'insensitive' } },
  })

  if (existing) {
    console.log(`✔ Hamilton Lane fund already present (id=${existing.id}) — nothing to do.`)
    return
  }

  const fund = await prisma.fund.create({
    data: {
      fundName:      FUND_NAME,
      manager:       'Hamilton Lane',
      administrator: 'Hamilton Lane',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      isActive:      true,
    },
  })
  console.log(`✔ Hamilton Lane fund created (id=${fund.id}): ${FUND_NAME}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
