/**
 * Prisma seed — populates the IMS database with realistic demo data
 * Run: npx tsx prisma/seed.ts
 *      OR: npm run db:seed
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱  Seeding IMS database…')

  // ── Clear existing data (in FK-safe order) ─────────────────────────────────
  await prisma.auditLog.deleteMany()
  await prisma.otpToken.deleteMany()
  await prisma.investmentTarget.deleteMany()
  await prisma.navRecord.deleteMany()
  await prisma.distribution.deleteMany()
  await prisma.capitalCall.deleteMany()
  await prisma.notice.deleteMany()
  await prisma.fxRate.deleteMany()
  await prisma.fund.deleteMany()
  await prisma.user.deleteMany()
  console.log('  ✔ Cleared existing data')

  // ── Users ──────────────────────────────────────────────────────────────────
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

  // ── FX Rates ───────────────────────────────────────────────────────────────
  await prisma.fxRate.createMany({
    data: [
      { rateDate: new Date('2024-01-31'), usdJpy: 146.52, source: 'MUFG TTM' },
      { rateDate: new Date('2024-02-29'), usdJpy: 150.08, source: 'MUFG TTM' },
      { rateDate: new Date('2024-03-31'), usdJpy: 151.34, source: 'MUFG TTM' },
      { rateDate: new Date('2024-04-30'), usdJpy: 156.79, source: 'MUFG TTM' },
      { rateDate: new Date('2024-05-31'), usdJpy: 156.64, source: 'MUFG TTM' },
      { rateDate: new Date('2024-06-30'), usdJpy: 160.86, source: 'MUFG TTM' },
      { rateDate: new Date('2024-07-31'), usdJpy: 149.98, source: 'MUFG TTM' },
      { rateDate: new Date('2024-08-31'), usdJpy: 145.52, source: 'MUFG TTM' },
      { rateDate: new Date('2024-09-30'), usdJpy: 143.44, source: 'MUFG TTM' },
      { rateDate: new Date('2024-10-31'), usdJpy: 153.40, source: 'MUFG TTM' },
      { rateDate: new Date('2024-11-30'), usdJpy: 149.70, source: 'MUFG TTM' },
      { rateDate: new Date('2024-12-31'), usdJpy: 157.15, source: 'MUFG TTM' },
      { rateDate: new Date('2025-01-31'), usdJpy: 155.02, source: 'MUFG TTM' },
      { rateDate: new Date('2025-02-28'), usdJpy: 150.53, source: 'MUFG TTM' },
      { rateDate: new Date('2025-03-31'), usdJpy: 149.85, source: 'MUFG TTM' },
    ],
  })
  console.log('  ✔ FX rates created (15 months)')

  // ── Funds ──────────────────────────────────────────────────────────────────
  const f1 = await prisma.fund.create({
    data: {
      fundName:      'GS Vintage X',
      fundNameJp:    'GSヴィンテージ X',
      manager:       'Goldman Sachs',
      strategy:      'Buyout',
      vintageYear:   2022,
      commitmentUsd: 10_000_000,
      entryFxRate:   151.34,
      isActive:      true,
    },
  })

  const f2 = await prisma.fund.create({
    data: {
      fundName:      'BlackRock Credit Alt V',
      fundNameJp:    'ブラックロック クレジット V',
      manager:       'BlackRock',
      strategy:      'Credit',
      vintageYear:   2021,
      commitmentUsd: 5_000_000,
      entryFxRate:   145.0,
      isActive:      true,
    },
  })

  const f3 = await prisma.fund.create({
    data: {
      fundName:      'KKR Growth VIII',
      fundNameJp:    'KKR グロース VIII',
      manager:       'KKR',
      strategy:      'Growth',
      vintageYear:   2023,
      commitmentUsd: 8_000_000,
      entryFxRate:   150.0,
      isActive:      true,
    },
  })

  console.log('  ✔ Funds created (3)')

  // ── Capital Calls ──────────────────────────────────────────────────────────
  await prisma.capitalCall.createMany({
    data: [
      {
        fundId:          f1.id,
        noticeDate:      new Date('2023-09-01'),
        dueDate:         new Date('2023-09-20'),
        callNumber:      1,
        grossCallUsd:    2_500_000,
        netCallUsd:      2_000_000,
        reinvestableUsd: 0,
        netCallJpy:      302_680_000,
        fxRate:          151.34,
        status:          'paid',
        paidAt:          new Date('2023-09-18'),
      },
      {
        fundId:          f1.id,
        noticeDate:      new Date('2024-02-01'),
        dueDate:         new Date('2024-02-20'),
        callNumber:      2,
        grossCallUsd:    1_800_000,
        netCallUsd:      1_500_000,
        reinvestableUsd: 0,
        netCallJpy:      225_120_000,
        fxRate:          150.08,
        status:          'paid',
        paidAt:          new Date('2024-02-18'),
      },
      {
        fundId:          f2.id,
        noticeDate:      new Date('2022-04-01'),
        dueDate:         new Date('2022-04-20'),
        callNumber:      1,
        grossCallUsd:    1_500_000,
        netCallUsd:      1_200_000,
        reinvestableUsd: 0,
        netCallJpy:      174_000_000,
        fxRate:          145.0,
        status:          'paid',
        paidAt:          new Date('2022-04-18'),
      },
      {
        // Overdue pending call for KKR — due date in the past
        fundId:          f3.id,
        noticeDate:      new Date('2024-04-01'),
        dueDate:         new Date('2024-05-01'),  // past due → overdue
        callNumber:      1,
        grossCallUsd:    2_000_000,
        netCallUsd:      1_800_000,
        reinvestableUsd: 0,
        netCallJpy:      270_000_000,
        fxRate:          150.0,
        status:          'pending',
      },
    ],
  })
  console.log('  ✔ Capital calls created (4)')

  // ── Distributions ──────────────────────────────────────────────────────────
  await prisma.distribution.createMany({
    data: [
      {
        fundId:           f1.id,
        distributionDate: new Date('2024-09-30'),
        distType:         'Income',
        amountUsd:        450_000,
        amountJpy:        64_548_000,
        fxRate:           143.44,
        reinvestableUsd:  200_000,
        isRecallable:     false,
      },
      {
        fundId:           f1.id,
        distributionDate: new Date('2024-12-31'),
        distType:         'Capital Return',
        amountUsd:        300_000,
        amountJpy:        47_145_000,
        fxRate:           157.15,
        reinvestableUsd:  0,
        isRecallable:     false,
      },
      {
        fundId:           f2.id,
        distributionDate: new Date('2024-06-30'),
        distType:         'Income',
        amountUsd:        120_000,
        amountJpy:        19_303_200,
        fxRate:           160.86,
        reinvestableUsd:  60_000,
        isRecallable:     false,
      },
    ],
  })
  console.log('  ✔ Distributions created (3)')

  // ── NAV Records ────────────────────────────────────────────────────────────
  await prisma.navRecord.createMany({
    data: [
      { fundId: f1.id, navDate: new Date('2024-12-31'), navUsd: 8_200_000, period: 'Q4 2024' },
      { fundId: f2.id, navDate: new Date('2024-12-31'), navUsd: 4_100_000, period: 'Q4 2024' },
      { fundId: f3.id, navDate: new Date('2024-09-30'), navUsd: 7_500_000, period: 'Q3 2024' },
    ],
  })
  console.log('  ✔ NAV records created (3)')

  // ── Investment Targets ─────────────────────────────────────────────────────
  await prisma.investmentTarget.createMany({
    data: [
      { fundId: f1.id, projectName: 'Proj-A1', actualName: 'Nexus Healthcare Corp',    amountUsd: 800_000,   investmentType: 'Equity', sector: 'Healthcare', geography: 'North America', dealType: 'LBO',      investmentDate: new Date('2023-10-15') },
      { fundId: f1.id, projectName: 'Proj-A2', actualName: 'TechStack Solutions',      amountUsd: 600_000,   investmentType: 'Equity', sector: 'Technology', geography: 'Europe',        dealType: 'Growth',   investmentDate: new Date('2024-01-20') },
      { fundId: f1.id, projectName: 'Proj-A3', actualName: 'GreenEnergy Partners',     amountUsd: 450_000,   investmentType: 'Equity', sector: 'Energy',     geography: 'Asia Pacific',  dealType: 'Platform', investmentDate: new Date('2024-03-05') },
      { fundId: f2.id, projectName: 'Proj-B1', actualName: 'Metro Logistics GmbH',     amountUsd: 500_000,   investmentType: 'Debt',   sector: 'Logistics',  geography: 'Europe',        dealType: 'Direct',   investmentDate: new Date('2022-05-10') },
      { fundId: f2.id, projectName: 'Proj-B2', actualName: 'Pacific Consumer Brands',  amountUsd: 400_000,   investmentType: 'Debt',   sector: 'Consumer',   geography: 'Asia Pacific',  dealType: 'Direct',   investmentDate: new Date('2022-09-15') },
      { fundId: f3.id, projectName: 'Proj-C1', actualName: 'CloudBase AI Inc',         amountUsd: 1_000_000, investmentType: 'Equity', sector: 'Technology', geography: 'North America', dealType: 'Series B', investmentDate: new Date('2024-05-01') },
      { fundId: f3.id, projectName: 'Proj-C2', actualName: 'BioTech Innovations',      amountUsd: 750_000,   investmentType: 'Equity', sector: 'Healthcare', geography: 'North America', dealType: 'Series C', investmentDate: new Date('2024-06-20') },
    ],
  })
  console.log('  ✔ Investment targets created (7)')

  console.log('\n✅  Database seeded successfully!')
  console.log('\n   Demo credentials:')
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
