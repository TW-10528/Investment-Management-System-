/**
 * Seed PDF Reports
 * Processes all existing PDFs in uploads/siguler guff/ and persists:
 *   - FundReport records (one per PDF)
 *   - SigfSnapshot (computed columns E/F/G/L for the fund)
 *   - Links each CapitalCall.sourcePdfId back to its FundReport
 *
 * Run: npx tsx prisma/seedPdfReports.ts
 */
import { PrismaClient } from '@prisma/client'
import { FUND_REGISTRY } from '../src/services/fundRegistry'
import { seedFundReports } from '../src/services/pdfPersistence'

const prisma = new PrismaClient()

async function main() {
  console.log('📄  Seeding PDF reports from uploads folder…\n')

  for (const entry of FUND_REGISTRY) {
    console.log(`Processing fund: ${entry.displayName}`)
    const { processed, errors } = await seedFundReports(entry, 'seed')
    console.log(`  ✔ ${processed} PDFs processed`)
    if (errors.length > 0) {
      console.log(`  ⚠ Errors:`)
      errors.forEach(e => console.log(`    - ${e}`))
    }

    // Show the resulting snapshot
    const snap = await prisma.sigfSnapshot.findUnique({ where: { fundId: await getFundId(entry) } })
    if (snap) {
      console.log(`\n  SigfSnapshot stored:`)
      console.log(`    PDFs:              ${snap.pdfCount}`)
      console.log(`    Commitment:        $${Number(snap.commitmentUsd).toLocaleString()}`)
      console.log(`    E  Cum. Drawn:     $${Number(snap.cumulativeDrawn).toLocaleString()}`)
      console.log(`    F  Inv. Capacity:  $${Number(snap.investmentCapacity).toLocaleString()}`)
      console.log(`    G  Net Cash Flow:  -$${Math.abs(Number(snap.netCashFlow)).toLocaleString()}`)
      console.log(`    L  NR Dist:        $${Number(snap.nonRecallableDist).toLocaleString()}`)
    }
  }

  // Verify FundReport ↔ CapitalCall links
  const reports = await prisma.fundReport.findMany({
    orderBy: { dueDate: 'asc' },
    include: { fund: { select: { fundName: true } } },
  })

  console.log(`\n  FundReport records:`)
  for (const r of reports) {
    console.log(`    #${reports.indexOf(r)+1} ${r.dueDate.toISOString().slice(0,10)} $${Number(r.netCallUsd)} → CallID: ${r.capitalCallId?.slice(0,8)}…`)
  }

  console.log('\n✅  PDF reports seeded successfully')
}

async function getFundId(entry: { namePatterns: string[] }): Promise<string> {
  const fund = await prisma.fund.findFirst({
    where: { fundName: { contains: entry.namePatterns[0], mode: 'insensitive' } },
  })
  return fund?.id ?? ''
}

main()
  .then(() => prisma.$disconnect())
  .catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
