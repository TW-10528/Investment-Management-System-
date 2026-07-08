/**
 * Idempotent add — Real Estate Secondary Opportunities Fund II.
 *
 * Adds the NB fund record so uploaded NB drawdown notices can auto-resolve
 * (fundParsers/fund-resolver.ts) WITHOUT wiping existing data like seed.ts does.
 *
 * Run once:  npx tsx prisma/addNbFund.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FUND_NAME = 'Real Estate Secondary Opportunities Fund II'

async function main() {
  const existing = await prisma.fund.findFirst({
    where: { fundName: { contains: 'Real Estate Secondary Opportunities Fund II', mode: 'insensitive' } },
  })

  if (existing) {
    console.log(`✔ NB fund already present (id=${existing.id}) — nothing to do.`)
    return
  }

  const fund = await prisma.fund.create({
    data: {
      fundName:      FUND_NAME,
      manager:       'Neuberger Berman',
      administrator: 'Neuberger Berman',
      strategy:      'Real Estate Secondaries',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      wireBank:      'Bank of America, N.A.',
      wireAba:       '026-009-593',
      wireSwift:     'BOFAUS3N',
      wireAccountName:   FUND_NAME,
      wireAccountNumber: '4451668246',
      wireReference:     'NBI13133',
      isActive:      true,
    },
  })
  console.log(`✔ NB fund created (id=${fund.id}): ${FUND_NAME}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
