/**
 * Prisma seed — base users, FX rates, and the kept fund records.
 *
 * Funds seeded: NB Real Estate, Hamilton Lane Secondary, Hamilton Lane Strategic,
 * Dover Street XI. (SDG and per-fund ledger data are added via the addXFund.ts
 * scripts / PDF uploads.)
 */
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
  const adminPw = bcrypt.hashSync('Admin123!', 12)
  const staffPw = bcrypt.hashSync('Staff123!', 12)

  await prisma.user.createMany({
    data: [
      {
        email:          'admin@thirdwave.co.jp',
        fullName:       'Admin User',
        fullNameJp:     '管理者',
        hashedPassword: adminPw,
        role:           'admin',
        status:         'active',
        isActive:       true,
      },
      {
        email:          'finance@thirdwave.co.jp',
        fullName:       'Leena Saravanan',
        hashedPassword: staffPw,
        role:           'finance_manager',
        status:         'active',
        isActive:       true,
      },
      {
        email:          'board@thirdwave.co.jp',
        fullName:       'Kenji Tanaka',
        hashedPassword: staffPw,
        role:           'board_member',
        status:         'active',
        isActive:       true,
      },
    ],
  })
  console.log('  ✔ Users created (3)')

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

  // ── Fund — NB Real Estate Secondary Opportunities Offshore Fund II LP ────────
  // Neuberger Berman / NB Alternatives Advisers LLC. Drawdown notices are
  // combined capital call + deemed distribution; commitment from the LP notice.
  await prisma.fund.create({
    data: {
      fundName:      'NB Real Estate Secondary Opportunities Offshore Fund II LP',
      manager:       'NB Alternatives Advisers LLC',
      administrator: 'Neuberger Berman',
      strategy:      'Real Estate Secondaries',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      wireBank:      'Bank of America, N.A.',
      wireAba:       '026-009-593',
      wireSwift:     'BOFAUS3N',
      wireAccountName:   'NB Real Estate Secondary Opportunities Offshore Fund II LP',
      wireAccountNumber: '4451668246',
      wireReference:     'NBI13133',
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: NB Real Estate Secondary Opportunities Offshore Fund II LP (Neuberger Berman)')

  // ── Fund — Hamilton Lane Secondary Fund VI-B LP ─────────────────────────────
  // Notices are EITHER a capital call OR a distribution (separate documents).
  await prisma.fund.create({
    data: {
      fundName:      'Hamilton Lane Secondary Fund VI-B LP',
      manager:       'Hamilton Lane Advisors, L.L.C.',
      administrator: 'Hamilton Lane',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Hamilton Lane Secondary Fund VI-B LP (Hamilton Lane)')

  // ── Fund — Hamilton Lane Strategic Opportunities Fund IX-B LP ───────────────
  // Notices include capital calls, distributions, net capital calls, and
  // return-of-unused-capital true-ups (B can be negative).
  await prisma.fund.create({
    data: {
      fundName:      'Hamilton Lane Strategic Opportunities Fund IX-B LP',
      manager:       'Hamilton Lane Advisors, L.L.C.',
      administrator: 'Hamilton Lane',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 3_000_000,
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Hamilton Lane Strategic Opportunities Fund IX-B LP (Hamilton Lane)')

  // ── Fund — Dover Street XI Feeder Fund L.P. ─────────────────────────────────
  // Notices: initial contribution, cash distribution, and capital-call-and-deemed
  // -distribution. D (reinvestable) is 0 for Dover.
  await prisma.fund.create({
    data: {
      fundName:      'Dover Street XI Feeder Fund L.P.',
      manager:       'HarbourVest Partners',
      administrator: 'HarbourVest Partners',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 20_000_000,
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Dover Street XI Feeder Fund L.P. (HarbourVest)')

  console.log('\n✅  Database seeded successfully!')
  console.log('\n   Funds: NB Real Estate, Hamilton Lane Secondary, Hamilton Lane Strategic, Dover Street XI')
  console.log('\n   Credentials:')
  console.log('   Admin:   admin@thirdwave.co.jp  /  Admin123!')
  console.log('   Finance: finance@thirdwave.co.jp /  Staff123!')
  console.log('   Board:   board@thirdwave.co.jp  /  Staff123!')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
