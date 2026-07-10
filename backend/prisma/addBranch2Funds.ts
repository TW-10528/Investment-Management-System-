/**
 * Idempotent add — Goldman Sachs (Vintage X), Siguler Guff, Capula Global RV.
 *
 * Adds the three Working-Branch2 fund records so their uploaded notices can
 * auto-resolve and show as their own sections — WITHOUT wiping data like seed.ts.
 *
 * Run once:  npx tsx prisma/addBranch2Funds.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FUNDS = [
  {
    match: 'Vintage X',
    data: {
      fundName:      'Vintage X (Flagship) Offshore SCSp',
      manager:       'Goldman Sachs Asset Management',
      administrator: 'Goldman Sachs Asset Management',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 20_000_000,
      entryFxRate:   154.20,
      wireBank:          'State Street Bank & Trust co. Boston',
      wireAba:           '011000028',
      wireAccountName:   'Vintage X (Flagship) Offshore SCSp',
      wireAccountNumber: '11841533',
      wireReference:     'MG149345 Thirdwave Financial Inc.,',
      isActive:      true,
    },
  },
  {
    match: 'Siguler Guff',
    data: {
      fundName:            'Siguler Guff Small Buyout Opportunities Fund VI (F), LP',
      fundNameJp:          'シグラー・ガフ スモール・バイアウト・オポチュニティーズ ファンドVI(F)',
      manager:             'Siguler Guff & Company, LP',
      administrator:       'Siguler Guff & Company, LP',
      strategy:            'Small Buyout',
      vintageYear:         2025,
      currency:            'USD',
      commitmentUsd:       1_000_000,
      entryFxRate:         154.20,
      contractDate:        new Date('2025-12-01'),
      wireBank:            'JPMORGAN CHASE BANK, N.A.',
      wireSwift:           'CHASUS33XXX',
      wireAba:             '021000021',
      wireAccountName:     'SIGULER GUFF SMALL BUYOUT OPPORTUNITIES VI F',
      wireAccountNumber:   '515067018',
      wireReference:       '11873-Thirdwave Financial Inc.',
      notes:               'ExtInvestorID: 11873 · FundComplex: 442065 · ClientID: 1541',
      isActive:            true,
    },
  },
  {
    match: 'Capula',
    data: {
      fundName:      'Capula Global Relative Value Trust',
      manager:       'Capula Investment Management LLP',
      administrator: 'Capula Investment Management LLP',
      strategy:      'Global Relative Value',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      isActive:      true,
    },
  },
]

async function main() {
  for (const f of FUNDS) {
    const existing = await prisma.fund.findFirst({
      where: { fundName: { contains: f.match, mode: 'insensitive' } },
    })
    if (existing) {
      console.log(`✔ already present: ${existing.fundName}`)
      continue
    }
    const created = await prisma.fund.create({ data: f.data as any })
    console.log(`＋ created: ${created.fundName}`)
  }
  const total = await prisma.fund.count()
  console.log(`Total funds now: ${total}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
