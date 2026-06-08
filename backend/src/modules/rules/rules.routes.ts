// Calculation Rules module — /api/v1/rules

import { Hono } from 'hono'
import type { HonoEnv } from '../../types/index'
import { auth } from '../../middleware/auth'
import { canEdit } from '../../middleware/guard'
import { prisma } from '../../lib/prisma'
import { AVAILABLE_ATTRIBUTES, evaluateFormula, runRulesForNotice } from '../../services/rulesEngine'

const router = new Hono<HonoEnv>()
router.use('*', auth)

// GET /attributes
router.get('/attributes', (c) => c.json(AVAILABLE_ATTRIBUTES))

// GET /dashboard
router.get('/dashboard', async (c) => {
  const rules = await prisma.calculationRule.findMany({
    where:   { isActive: true, displayOnDashboard: true },
    orderBy: { sortOrder: 'asc' },
  })

  const items = await Promise.all(rules.map(async (rule) => {
    const result = await prisma.calculationResult.findFirst({
      where:   { ruleId: rule.id, error: null },
      orderBy: { createdAt: 'desc' },
    })
    return {
      rule: {
        id:          rule.id,
        name:        rule.name,
        description: rule.description,
        formula:     rule.formula,
        explanation: rule.explanation,
        outputUnit:  rule.outputUnit,
        sortOrder:   rule.sortOrder,
      },
      result: result ? {
        id:          result.id,
        noticeId:    result.noticeId,
        fundId:      result.fundId,
        outputValue: result.outputValue ? parseFloat(result.outputValue.toString()) : null,
        outputText:  result.outputText,
        inputValues: result.inputValues,
        createdAt:   result.createdAt.toISOString(),
      } : null,
    }
  }))

  return c.json(items)
})

// GET /results/:noticeId
router.get('/results/:noticeId', async (c) => {
  const results = await prisma.calculationResult.findMany({
    where:   { noticeId: c.req.param('noticeId') },
    include: { rule: true },
    orderBy: { rule: { sortOrder: 'asc' } },
  })
  return c.json(results.map(r => ({
    id:          r.id,
    ruleId:      r.ruleId,
    noticeId:    r.noticeId,
    fundId:      r.fundId,
    outputValue: r.outputValue ? parseFloat(r.outputValue.toString()) : null,
    outputText:  r.outputText,
    inputValues: r.inputValues,
    error:       r.error,
    createdAt:   r.createdAt.toISOString(),
    rule: {
      id:          r.rule.id,
      name:        r.rule.name,
      formula:     r.rule.formula,
      explanation: r.rule.explanation,
      outputUnit:  r.rule.outputUnit,
    },
  })))
})

// POST /run/:noticeId
router.post('/run/:noticeId', async (c) => {
  const user   = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const notice = await prisma.notice.findUnique({ where: { id: c.req.param('noticeId') } })
  if (!notice) return c.json({ detail: 'Notice not found' }, 404)

  const data = (notice.extractedData as any) ?? {}
  await runRulesForNotice(notice.id, data, notice.fundId ?? undefined, notice.noticeType)

  const results = await prisma.calculationResult.findMany({
    where:   { noticeId: notice.id },
    include: { rule: true },
    orderBy: { rule: { sortOrder: 'asc' } },
  })

  return c.json({
    message: `Ran ${results.length} rule(s) against notice ${notice.id}.`,
    results: results.map(r => ({
      ruleName:   r.rule.name,
      formula:    r.rule.formula,
      outputText: r.outputText,
      error:      r.error,
    })),
  })
})

// GET /
router.get('/', async (c) => {
  const rules = await prisma.calculationRule.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  const enriched = await Promise.all(rules.map(async (rule) => {
    const latest = await prisma.calculationResult.findFirst({
      where:   { ruleId: rule.id, error: null },
      orderBy: { createdAt: 'desc' },
    })
    return {
      id:                 rule.id,
      name:               rule.name,
      description:        rule.description,
      formula:            rule.formula,
      explanation:        rule.explanation,
      outputUnit:         rule.outputUnit,
      applicableTypes:    rule.applicableTypes,
      displayOnDashboard: rule.displayOnDashboard,
      isActive:           rule.isActive,
      sortOrder:          rule.sortOrder,
      createdBy:          rule.createdBy,
      createdAt:          rule.createdAt.toISOString(),
      updatedAt:          rule.updatedAt.toISOString(),
      latestResult: latest ? {
        outputText:  latest.outputText,
        outputValue: latest.outputValue ? parseFloat(latest.outputValue.toString()) : null,
        noticeId:    latest.noticeId,
        createdAt:   latest.createdAt.toISOString(),
      } : null,
    }
  }))

  return c.json(enriched)
})

// POST /
router.post('/', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const { name, description, formula, explanation, outputUnit, applicableTypes, displayOnDashboard, isActive, sortOrder } = body

  if (!name?.trim())    return c.json({ detail: 'name is required' }, 400)
  if (!formula?.trim()) return c.json({ detail: 'formula is required' }, 400)

  const testResult = evaluateFormula(formula, {})
  if (testResult.error && testResult.error.includes('invalid characters')) {
    return c.json({ detail: `Formula error: ${testResult.error}` }, 400)
  }

  const rule = await prisma.calculationRule.create({
    data: {
      name:               name.trim(),
      description:        description?.trim()  || null,
      formula:            formula.trim(),
      explanation:        explanation?.trim()  || null,
      outputUnit:         outputUnit?.trim()   || null,
      applicableTypes:    Array.isArray(applicableTypes) ? applicableTypes : [],
      displayOnDashboard: displayOnDashboard ?? true,
      isActive:           isActive ?? true,
      sortOrder:          sortOrder ?? 0,
      createdBy:          user.email,
    },
  })

  return c.json(rule, 201)
})

// PUT /:id
router.put('/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const existing = await prisma.calculationRule.findUnique({ where: { id: c.req.param('id') } })
  if (!existing) return c.json({ detail: 'Rule not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  if (body.formula) {
    const testResult = evaluateFormula(body.formula, {})
    if (testResult.error && testResult.error.includes('invalid characters')) {
      return c.json({ detail: `Formula error: ${testResult.error}` }, 400)
    }
  }

  const updated = await prisma.calculationRule.update({
    where: { id: existing.id },
    data: {
      name:               body.name?.trim()        ?? existing.name,
      description:        body.description?.trim() ?? existing.description,
      formula:            body.formula?.trim()      ?? existing.formula,
      explanation:        body.explanation?.trim()  ?? existing.explanation,
      outputUnit:         body.outputUnit?.trim()   ?? existing.outputUnit,
      applicableTypes:    Array.isArray(body.applicableTypes) ? body.applicableTypes : existing.applicableTypes,
      displayOnDashboard: body.displayOnDashboard ?? existing.displayOnDashboard,
      isActive:           body.isActive           ?? existing.isActive,
      sortOrder:          body.sortOrder          ?? existing.sortOrder,
    },
  })

  return c.json(updated)
})

// DELETE /:id
router.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const existing = await prisma.calculationRule.findUnique({ where: { id: c.req.param('id') } })
  if (!existing) return c.json({ detail: 'Rule not found' }, 404)

  await prisma.calculationRule.delete({ where: { id: existing.id } })
  return c.json({ message: 'Rule deleted.' })
})

// POST /preview
router.post('/preview', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { formula, outputUnit, sampleValues } = body
  if (!formula?.trim()) return c.json({ detail: 'formula is required' }, 400)

  const scope: Record<string, number> = {}
  if (sampleValues && typeof sampleValues === 'object') {
    for (const [k, v] of Object.entries(sampleValues)) {
      const n = parseFloat(String(v))
      if (!isNaN(n)) scope[k] = n
    }
  }

  const result = evaluateFormula(formula, scope, outputUnit)
  return c.json({ value: result.value, outputText: result.outputText, inputs: result.inputs, error: result.error ?? null })
})

// ── AttributeExtractor CRUD ───────────────────────────────────────────────────

router.get('/extractors', async (c) => {
  const rows = await prisma.attributeExtractor.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  })
  return c.json(rows.map(r => ({
    id:             r.id,
    attributeName:  r.attributeName,
    label:          r.label,
    keywords:       r.keywords,
    extractionType: r.extractionType,
    isActive:       r.isActive,
    createdBy:      r.createdBy,
    createdAt:      r.createdAt.toISOString(),
  })))
})

router.post('/extractors', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const body = await c.req.json().catch(() => ({}))
  const { attributeName, label, keywords, extractionType, isActive } = body

  if (!attributeName?.trim()) return c.json({ detail: 'attributeName is required' }, 400)
  if (!label?.trim())         return c.json({ detail: 'label is required' }, 400)
  if (!Array.isArray(keywords) || keywords.length === 0)
    return c.json({ detail: 'At least one keyword is required' }, 400)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(attributeName.trim()))
    return c.json({ detail: 'attributeName must be a valid identifier (letters, digits, underscore)' }, 400)

  const row = await prisma.attributeExtractor.create({
    data: {
      attributeName:  attributeName.trim(),
      label:          label.trim(),
      keywords:       keywords.map((k: string) => k.trim()).filter(Boolean),
      extractionType: extractionType ?? 'usd',
      isActive:       isActive ?? true,
      createdBy:      user.email,
    },
  })
  return c.json(row, 201)
})

router.put('/extractors/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const existing = await prisma.attributeExtractor.findUnique({ where: { id: c.req.param('id') } })
  if (!existing) return c.json({ detail: 'Extractor not found' }, 404)

  const body    = await c.req.json().catch(() => ({}))
  const updated = await prisma.attributeExtractor.update({
    where: { id: existing.id },
    data: {
      attributeName:  body.attributeName?.trim() ?? existing.attributeName,
      label:          body.label?.trim()         ?? existing.label,
      keywords:       Array.isArray(body.keywords) ? body.keywords.map((k: string) => k.trim()).filter(Boolean) : existing.keywords,
      extractionType: body.extractionType ?? existing.extractionType,
      isActive:       body.isActive       ?? existing.isActive,
    },
  })
  return c.json(updated)
})

router.delete('/extractors/:id', async (c) => {
  const user = c.get('user')
  if (!canEdit(user.role)) return c.json({ detail: 'Edit access required.' }, 403)

  const existing = await prisma.attributeExtractor.findUnique({ where: { id: c.req.param('id') } })
  if (!existing) return c.json({ detail: 'Extractor not found' }, 404)

  await prisma.attributeExtractor.delete({ where: { id: existing.id } })
  return c.json({ message: 'Extractor deleted.' })
})

router.post('/extractors/test', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { noticeId, keywords, extractionType } = body
  if (!noticeId || !keywords?.length) return c.json({ detail: 'noticeId and keywords are required' }, 400)

  const notice = await prisma.notice.findUnique({ where: { id: noticeId } })
  if (!notice) return c.json({ detail: 'Notice not found' }, 404)

  const { extractByKeyword } = await import('../../services/pdfParser')
  const fs   = await import('fs')
  const path = await import('path')
  const { config } = await import('../../config/index')

  const filepath = path.join(config.uploadDir, notice.filename)
  if (!fs.existsSync(filepath)) return c.json({ detail: 'PDF file not found on disk' }, 404)

  const pdfParse = (await import('pdf-parse')).default
  const buffer   = fs.readFileSync(filepath)
  const parsed   = await pdfParse(buffer, { max: 0 })
  const text     = parsed.text ?? ''

  const value = extractByKeyword(text, keywords, extractionType ?? 'usd')
  return c.json({ value: value ?? null, found: value !== undefined })
})

export default router
