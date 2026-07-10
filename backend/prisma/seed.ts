/**
 * Prisma seed — base users, FX rates, and the kept fund records.
 *
 * Funds seeded: NB Real Estate, Hamilton Lane Secondary, Hamilton Lane Strategic,
 * Dover Street XI. (SDG and per-fund ledger data are added via the addXFund.ts
 * scripts / PDF uploads.)
 */
/// <reference types="node" />
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱  Seeding IMS database…')

  // ── Clear existing data (FK-safe order) ───────────────────────────────────
  await prisma.auditLog.deleteMany()
  await prisma.otpToken.deleteMany()
  await prisma.calculationResult.deleteMany()
  await prisma.calculationRule.deleteMany()
  await prisma.attributeExtractor.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.investmentTarget.deleteMany()
  await prisma.navRecord.deleteMany()
  await prisma.sigfSnapshot.deleteMany()
  await prisma.fundReport.deleteMany()
  await prisma.distribution.deleteMany()
  await prisma.capitalCall.deleteMany()
  await prisma.notice.deleteMany()
  await prisma.fxRate.deleteMany()
  await prisma.fund.deleteMany()
  await prisma.user.deleteMany()
  console.log('  ✔ Cleared existing data')

  // ── Users ─────────────────────────────────────────────────────────────────
  // Only the admin is seeded. Up to 5 users total — the rest self-register.
  const adminPw = bcrypt.hashSync('Admin123!', 12)

  await prisma.user.create({
    data: {
      email:          'admin@thirdwave.co.jp',
      fullName:       'Admin User',
      fullNameJp:     '管理者',
      hashedPassword: adminPw,
      role:           'admin',
      status:         'active',
      isActive:       true,
    },
  })
  console.log('  ✔ Admin user created')

  // ── FX Rates (historical + 2026 rates covering capital call dates) ─────────
  await prisma.fxRate.createMany({
    data: [
      { rateDate: new Date('2024-12-31'), usdJpy: 157.15, source: 'MUFG TTM' },
      { rateDate: new Date('2025-01-31'), usdJpy: 155.02, source: 'MUFG TTM' },
      { rateDate: new Date('2025-02-28'), usdJpy: 150.53, source: 'MUFG TTM' },
      { rateDate: new Date('2025-03-31'), usdJpy: 149.85, source: 'MUFG TTM' },
      { rateDate: new Date('2025-04-30'), usdJpy: 143.70, source: 'MUFG TTM' },
      { rateDate: new Date('2025-05-31'), usdJpy: 144.10, source: 'MUFG TTM' },
      { rateDate: new Date('2025-06-30'), usdJpy: 146.30, source: 'MUFG TTM' },
      { rateDate: new Date('2025-07-31'), usdJpy: 148.60, source: 'MUFG TTM' },
      { rateDate: new Date('2025-08-31'), usdJpy: 145.90, source: 'MUFG TTM' },
      { rateDate: new Date('2025-09-30'), usdJpy: 143.20, source: 'MUFG TTM' },
      { rateDate: new Date('2025-10-31'), usdJpy: 152.40, source: 'MUFG TTM' },
      { rateDate: new Date('2025-11-30'), usdJpy: 151.80, source: 'MUFG TTM' },
      { rateDate: new Date('2025-12-31'), usdJpy: 156.50, source: 'MUFG TTM' },
      // 2026 — covering recent capital call / distribution settlement months
      { rateDate: new Date('2026-01-31'), usdJpy: 154.20, source: 'MUFG TTM' },
      { rateDate: new Date('2026-02-28'), usdJpy: 150.80, source: 'MUFG TTM' },
      { rateDate: new Date('2026-03-31'), usdJpy: 149.60, source: 'MUFG TTM' },
      { rateDate: new Date('2026-04-30'), usdJpy: 152.30, source: 'MUFG TTM' },
      { rateDate: new Date('2026-05-31'), usdJpy: 153.90, source: 'MUFG TTM' },
    ],
  })
  console.log('  ✔ FX rates created')

  // ── Fund — Real Estate Secondary Opportunities Fund II ────────────────────
  // Neuberger Berman. Drawdown notices are combined capital call + deemed
  // distribution; commitment from the LP notice.
  // Commitment value will be extracted from uploaded PDFs or manually entered
  await prisma.fund.create({
    data: {
      fundName:      'Real Estate Secondary Opportunities Fund II',
      manager:       'Neuberger Berman',
      administrator: 'Neuberger Berman',
      strategy:      'Real Estate Secondaries',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 0,  // Populate from PDF uploads
      wireBank:      'Bank of America, N.A.',
      wireAba:       '026-009-593',
      wireSwift:     'BOFAUS3N',
      wireAccountName:   'NB Real Estate Secondary Opportunities Offshore Fund II LP',
      wireAccountNumber: '4451668246',
      wireReference:     'NBI13133',
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Real Estate Secondary Opportunities Fund II (Neuberger Berman)')

  // ── Fund — Small Buyout Opportunities Fund VI ────────────────────────────
  // Siguler Guff. Commitment will be extracted from uploaded PDFs or manually entered
  await prisma.fund.create({
    data: {
      fundName:            'Small Buyout Opportunities Fund VI',
      fundNameJp:          'シグラー・ガフ スモール・バイアウト・オポチュニティーズ ファンドVI',
      manager:             'Siguler Guff',
      administrator:       'Siguler Guff',
      strategy:            'Small Buyout',
      vintageYear:         2025,
      currency:            'USD',
      commitmentUsd:       0,  // Populate from PDF uploads or manual entry
      entryFxRate:         154.20,   // Jan 2026 MUFG TTM rate
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
  })
  console.log('  ✔ Fund created: Small Buyout Opportunities Fund VI (Siguler Guff)')

  // ── Fund — Vintage X(Flagship) ──────────────────────────────────────────────
  await prisma.fund.create({
    data: {
      fundName:      'Vintage X(Flagship)',
      manager:       'Goldman Sachs',
      administrator: 'Goldman Sachs',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 0,  // Populate from PDF uploads
      entryFxRate:   154.20,
      wireBank:      'State Street Bank & Trust co. Boston',
      wireAba:       '011000028',
      wireAccountName:   'Vintage X (Flagship) Offshore SCSp',
      wireAccountNumber: '11841533',
      wireReference:     'MG149345 Thirdwave Financial Inc.,',
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Vintage X(Flagship) (Goldman Sachs)')

  // ── Fund — Capula Global Relative Fund ────────────────────────────────────────
  await prisma.fund.create({
    data: {
      fundName:      'Capula Global Relative Fund',
      manager:       'Capula Investment Management',
      administrator: 'Capula Investment Management',
      strategy:      'Global Relative Value',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 0,  // Populate from PDF uploads or manual entry
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Capula Global Relative Fund (Capula Investment Management)')

  // ── Fund — Hamilton Lane Secondary Fund VI-B ──────────────────────────────────────────────
  // Hamilton Lane. Notices are EITHER a capital call OR a distribution (separate documents).
  await prisma.fund.create({
    data: {
      fundName:      'Hamilton Lane Secondary Fund VI-B',
      manager:       'Hamilton Lane',
      administrator: 'Hamilton Lane',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 0,  // Populate from PDF uploads or manual entry
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Hamilton Lane Secondary Fund VI-B (Hamilton Lane)')

  // ── Fund — Hamilton Lane Strategic Opportunities Fund IX ──────────────────────────────────
  // Hamilton Lane. Notices include capital calls, distributions, net capital calls, and
  // return-of-unused-capital true-ups (B can be negative).
  await prisma.fund.create({
    data: {
      fundName:      'Hamilton Lane Strategic Opportunities Fund IX',
      manager:       'Hamilton Lane',
      administrator: 'Hamilton Lane',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 0,  // Populate from PDF uploads or manual entry
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Hamilton Lane Strategic Opportunities Fund IX (Hamilton Lane)')

  // ── Fund — Dover Street XI ──────────────────────────────────────────────────
  // HarbourVest. Notices: initial contribution, cash distribution, and capital-call-and-deemed
  // -distribution. D (reinvestable) is 0 for Dover.
  await prisma.fund.create({
    data: {
      fundName:      'Dover Street XI',
      manager:       'HarbourVest',
      administrator: 'HarbourVest',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 0,  // Populate from PDF uploads
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Dover Street XI (HarbourVest)')

  // ── Fund — SDGs投資事業有限責任組合 ────────────────────────────────────────────
  // SDG fund has both contract_commitment_usd (fixed) and commitment_usd (dynamic tranches)
  // Contract commitment is the base/standard value shown on dashboard
  // Commitment value changes as tranches are added in the Commitments page
  // Currency is JPY - all amounts (capital calls, commitments) are in Japanese Yen
  await prisma.fund.create({
    data: {
      fundName:              'SDGs投資事業有限責任組合',
      fundNameJp:            'SDGs投資事業有限責任組合',
      manager:               'AFM株式会社',
      administrator:         'AFM株式会社',
      strategy:              'Development',
      vintageYear:           2024,
      currency:              'JPY',  // All amounts are in Japanese Yen, no FX conversion needed
      commitmentUsd:         0,  // Will be populated from PDF uploads (in JPY)
      contractCommitmentUsd: 0,  // Will be manually set (in JPY)
      entryFxRate:           154.20,
      isActive:              true,
    },
  })
  console.log('  ✔ Fund created: SDGs投資事業有限責任組合 (AFM株式会社)')

  console.log('\n✅  Database seeded successfully!')
  console.log('\n   Funds: Hamilton Lane Strategic Opportunities Fund IX, Hamilton Lane Secondary Fund VI-B, Capula Global Relative Fund, HarbourVest Dover Street XI, Neuberger Berman Real Estate Secondary Opportunities Fund II, Siguler Guff Small Buyout Opportunities Fund VI, Goldman Sachs Vintage X(Flagship), AFM SDGs投資事業有限責任組合')
  console.log('   (ledger empty — upload PDFs via UI to populate)')
  console.log('\n   Credentials:')
  console.log('   Admin:   admin@thirdwave.co.jp  /  Admin123!')
  console.log('   (other users self-register — max 5 active)')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
