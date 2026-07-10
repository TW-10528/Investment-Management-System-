/**
 * Idempotent add — Dover Street XI.
 *
 * Adds the fund record so uploaded Dover notices auto-resolve
 * (fundParsers/fund-resolver.ts) and show as their own section on the Funds page —
 * WITHOUT wiping existing data like seed.ts.
 *
 * Run once:  npx tsx prisma/addDoverStreetFund.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FUND_NAME = 'Dover Street XI'

async function main() {
  const existing = await prisma.fund.findFirst({
    where: { fundName: { contains: 'Dover Street XI', mode: 'insensitive' } },
  })

  if (existing) {
    console.log(`✔ Dover Street fund already present (id=${existing.id}) — nothing to do.`)
    return
  }

  const fund = await prisma.fund.create({
    data: {
      fundName:      FUND_NAME,
      manager:       'HarbourVest',
      administrator: 'HarbourVest',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 20_000_000,
      isActive:      true,
    },
  })
  console.log(`✔ Dover Street fund created (id=${fund.id}): ${FUND_NAME}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    throw e
  })
