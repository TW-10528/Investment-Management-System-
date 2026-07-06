/**
 * Reprocess Siguler Guff PDFs Only
 *
 * Finds all PDF files in the Siguler Guff uploads folders and creates
 * capital calls/distributions from them.
 *
 * Run: npx tsx scripts/reprocessSigulerGuff.ts
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { parseFundPdf } from '../src/services/fundParsers/index'
import { resolveFund } from '../src/services/fundParsers/fund-resolver'

const prisma = new PrismaClient()
const uploadDir = path.join(__dirname, '../uploads')

async function reprocessSigulerGuff() {
  console.log('🔍 Scanning for Siguler Guff PDFs...\n')

  // Only look in Siguler Guff folders
  const sigulerFolders = [
    'siguler guff',
    'siguler-guff-small-buyout-opportunities-fund-vi-f-lp',
    'small-buyout-opportunities-fund-vi'
  ]

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const folderName of sigulerFolders) {
    const folderPath = path.join(uploadDir, folderName)

    if (!fs.existsSync(folderPath)) {
      console.log(`⏭️  Folder not found: ${folderName}`)
      continue
    }

    if (!fs.statSync(folderPath).isDirectory()) continue

    const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'))

    if (files.length === 0) {
      console.log(`⏭️  No PDFs in: ${folderName}`)
      continue
    }

    console.log(`📁 Processing folder: ${folderName}\n`)

    for (const file of files) {
      try {
        const filePath = path.join(folderPath, file)
        const buffer = fs.readFileSync(filePath)
        const fileHash = createHash('sha256').update(buffer).digest('hex')

        // Check if this PDF was already processed
        const existing = await prisma.notice.findFirst({ where: { fileHash } })
        if (existing) {
          console.log(`   ⏭️  SKIPPED: ${file} (already processed)`)
          skipped++
          continue
        }

        console.log(`   📄 Processing: ${file}`)

        // Parse the PDF
        const parsed = await parseFundPdf(buffer, file)

        if (parsed.fundKey === 'unknown') {
          console.log(`      ⚠️  Fund not recognised - skipping`)
          skipped++
          continue
        }

        // Resolve the fund
        const fund = await resolveFund(parsed.fundKey)
        if (!fund) {
          console.log(`      ⚠️  Fund not found in database - skipping`)
          skipped++
          continue
        }

        // Get latest FX rate
        const latestFx = await prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } })
        const fxRate = latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150
        const dueDate = parsed.dueDate ? new Date(parsed.dueDate) : new Date()
        const relPath = path.join(folderName, file)

        // Create records in transaction
        await prisma.$transaction(async (tx) => {
          const noticeType = parsed.noticeType || 'capital_call'
          const wantCall = noticeType === 'capital_call' || noticeType === 'capital_and_distribution'
          const wantDist = noticeType === 'distribution' || noticeType === 'capital_and_distribution'

          // Create capital call if needed
          if (wantCall && (parsed.grossCallUsd ?? 0) > 0) {
            const grossUsd = parseFloat(String(parsed.grossCallUsd ?? 0))
            const last = await tx.capitalCall.findFirst({
              where: { fundId: fund.id },
              orderBy: { callNumber: 'desc' }
            })

            await tx.capitalCall.create({
              data: {
                fundId: fund.id,
                callNumber: (last?.callNumber ?? 0) + 1,
                noticeDate: parsed.noticeDate ? new Date(parsed.noticeDate) : new Date(),
                dueDate,
                executionDate: dueDate,
                callPct: parseFloat(String(parsed.callPct ?? 0)),
                grossCallUsd: grossUsd,
                netCallUsd: grossUsd,
                distributionUsd: 0,
                reinvestableUsd: 0,
                investmentAmountUsd: grossUsd,
                managementFeeUsd: parseFloat(String(parsed.managementFeeUsd ?? 0)),
                expenseUsd: parseFloat(String(parsed.taxExpenseUsd ?? 0)),
                returnOfCapitalUsd: parseFloat(String(parsed.returnOfCapitalUsd ?? 0)),
                gainUsd: parseFloat(String(parsed.gainUsd ?? 0)),
                interestUsd: parseFloat(String(parsed.interestUsd ?? 0)),
                fxRate,
                netCallJpy: Math.round(grossUsd * fxRate),
                wireReference: parsed.wireReference ?? null,
                status: 'approved',
              },
            })
          }

          // Create distribution if needed
          if (wantDist && (parsed.distributionUsd ?? 0) > 0) {
            const amtUsd = parseFloat(String(parsed.distributionUsd ?? 0))
            await tx.distribution.create({
              data: {
                fundId: fund.id,
                distributionDate: dueDate,
                distType: 'Income',
                amountUsd: amtUsd,
                amountJpy: Math.round(amtUsd * fxRate),
                fxRate,
                reinvestableUsd: parseFloat(String(parsed.reinvestableUsd ?? 0)),
                returnOfCapitalUsd: parseFloat(String(parsed.returnOfCapitalUsd ?? 0)),
                gainUsd: parseFloat(String(parsed.gainUsd ?? 0)),
                interestUsd: parseFloat(String(parsed.interestUsd ?? 0)),
                isRecallable: false,
              },
            })
          }

          // Create notice record
          await tx.notice.create({
            data: {
              filename: relPath,
              originalName: file,
              fileHash,
              noticeType: noticeType,
              status: 'approved',
              approvedAt: new Date(),
              fundId: fund.id,
              extractedData: { ...parsed, rawText: undefined } as any,
              confidence: parsed.confidence || 0.8,
              uploadedBy: 'batch-reprocess-siguler',
            },
          })
        })

        console.log(`      ✅ Created records for ${fund.fundName}`)
        processed++

      } catch (e) {
        console.error(`      ❌ Error: ${(e as any).message}`)
        errors++
      }
    }
  }

  console.log(`\n📊 Siguler Guff Results:`)
  console.log(`   ✅ Processed: ${processed}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   ❌ Errors: ${errors}`)

  await prisma.$disconnect()
}

reprocessSigulerGuff().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
