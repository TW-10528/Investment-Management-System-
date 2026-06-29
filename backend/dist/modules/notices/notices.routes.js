"use strict";
// Notices module — /api/v1/notices
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("../../middleware/auth");
const guard_1 = require("../../middleware/guard");
const prisma_1 = require("../../lib/prisma");
const pdfParser_1 = require("../../services/pdfParser");
const index_1 = require("../../services/fundParsers/index");
const fund_resolver_1 = require("../../services/fundParsers/fund-resolver");
const notificationService_1 = require("../../services/notificationService");
const rulesEngine_1 = require("../../services/rulesEngine");
const validationService_1 = require("../../services/validationService");
const index_2 = require("../../config/index");
const router = new hono_1.Hono();
router.use('*', auth_1.auth);
// ── Serialiser ────────────────────────────────────────────────────────────────
function confidenceGrade(c) {
    if (!c)
        return 'low';
    if (c >= 0.65)
        return 'high';
    if (c >= 0.35)
        return 'medium';
    return 'low';
}
function noticeDict(n) {
    const grade = n.extractedData?.confidenceGrade ?? confidenceGrade(n.confidence);
    return {
        id: n.id,
        file_name: n.originalName ?? n.filename,
        filename: n.filename,
        original_name: n.originalName,
        notice_type: n.noticeType,
        status: n.status,
        fund_id: n.fundId,
        extracted_data: n.extractedData,
        confidence: n.confidence,
        confidence_grade: grade,
        admin_notes: n.adminNotes,
        uploaded_by: n.uploadedBy,
        created_at: n.createdAt?.toISOString(),
        approved_at: n.approvedAt?.toISOString() ?? null,
    };
}
// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (c) => {
    const { notice_type, status, fund_id } = c.req.query();
    const where = {};
    if (notice_type)
        where.noticeType = notice_type;
    if (status)
        where.status = status;
    if (fund_id)
        where.fundId = fund_id;
    const notices = await prisma_1.prisma.notice.findMany({ where, orderBy: { createdAt: 'desc' } });
    return c.json(notices.map(noticeDict));
});
// ── GET /pending-count ────────────────────────────────────────────────────────
router.get('/pending-count', async (c) => {
    const count = await prisma_1.prisma.notice.count({ where: { status: 'pending' } });
    return c.json({ count });
});
// ── GET /investments/recent ───────────────────────────────────────────────────
router.get('/investments/recent', async (c) => {
    const limit = parseInt(c.req.query('limit') ?? '8');
    const items = await prisma_1.prisma.investmentTarget.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { fund: { select: { fundName: true } } },
    });
    return c.json(items.map(it => ({
        id: it.id,
        fund_id: it.fundId,
        fund_name: it.fund?.fundName ?? '',
        project_name: it.projectName,
        actual_name: it.actualName,
        investment_date: it.investmentDate?.toISOString().slice(0, 10) ?? null,
        amount_usd: it.amountUsd ? parseFloat(it.amountUsd.toString()) : 0,
        investment_type: it.investmentType,
        sector: it.sector,
        geography: it.geography,
        deal_type: it.dealType,
    })));
});
// ── GET /investments/all ──────────────────────────────────────────────────────
router.get('/investments/all', async (c) => {
    const { fund_id, sector, geography } = c.req.query();
    const where = {};
    if (fund_id)
        where.fundId = fund_id;
    if (sector)
        where.sector = { contains: sector, mode: 'insensitive' };
    if (geography)
        where.geography = { contains: geography, mode: 'insensitive' };
    const items = await prisma_1.prisma.investmentTarget.findMany({
        where,
        orderBy: { investmentDate: 'desc' },
        include: { fund: { select: { fundName: true } } },
    });
    return c.json(items.map(it => ({
        id: it.id,
        fund_id: it.fundId,
        fund_name: it.fund?.fundName ?? '',
        project_name: it.projectName,
        actual_name: it.actualName,
        investment_date: it.investmentDate?.toISOString().slice(0, 10) ?? null,
        amount_usd: it.amountUsd ? parseFloat(it.amountUsd.toString()) : 0,
        investment_type: it.investmentType,
        sector: it.sector,
        geography: it.geography,
        deal_type: it.dealType,
    })));
});
// ── GET /nav/latest ───────────────────────────────────────────────────────────
router.get('/nav/latest', async (c) => {
    const funds = await prisma_1.prisma.fund.findMany({ where: { isActive: true } });
    const result = [];
    for (const fund of funds) {
        const nav = await prisma_1.prisma.navRecord.findFirst({ where: { fundId: fund.id }, orderBy: { navDate: 'desc' } });
        if (nav) {
            result.push({
                fund_id: fund.id,
                fund_name: fund.fundName,
                nav_date: nav.navDate.toISOString().slice(0, 10),
                nav_usd: nav.navUsd ? parseFloat(nav.navUsd.toString()) : 0,
                period: nav.period,
            });
        }
    }
    return c.json(result);
});
// ── GET /:id ──────────────────────────────────────────────────────────────────
router.get('/:id', async (c) => {
    const n = await prisma_1.prisma.notice.findUnique({ where: { id: c.req.param('id') } });
    if (!n)
        return c.json({ detail: 'Notice not found' }, 404);
    return c.json(noticeDict(n));
});
// ── POST /upload ──────────────────────────────────────────────────────────────
router.post('/upload', async (c) => {
    const user = c.get('user');
    let file = null;
    let noticeType = 'capital_call';
    let fundId;
    try {
        const body = await c.req.parseBody();
        file = body['file'];
        noticeType = body['notice_type'] ?? 'capital_call';
        fundId = body['fund_id'] || undefined;
    }
    catch {
        return c.json({ detail: 'Failed to parse upload' }, 400);
    }
    if (!file || typeof file === 'string')
        return c.json({ detail: 'No file uploaded' }, 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileSize = buffer.length;
    // ── Deduplication check: filename + file size (Option C)
    const existingNotice = await prisma_1.prisma.notice.findFirst({
        where: {
            originalName: file.name,
            filename: { contains: `_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}` },
        },
    });
    if (existingNotice) {
        // Check if file size matches (to avoid false positives on same filename different content)
        const existingFilepath = path_1.default.join(index_2.config.uploadDir, existingNotice.filename);
        if (fs_1.default.existsSync(existingFilepath)) {
            const existingStats = fs_1.default.statSync(existingFilepath);
            if (existingStats.size === fileSize) {
                return c.json({
                    detail: 'File already uploaded (duplicate detected)',
                    existing_notice_id: existingNotice.id,
                    ...noticeDict(existingNotice),
                }, 409);
            }
        }
    }
    if (!fs_1.default.existsSync(index_2.config.uploadDir))
        fs_1.default.mkdirSync(index_2.config.uploadDir, { recursive: true });
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${safe}`;
    const filepath = path_1.default.join(index_2.config.uploadDir, filename);
    fs_1.default.writeFileSync(filepath, buffer);
    // Try fund-specific parser first; fall back to generic parser
    let extractedData;
    let resolvedFundId = fundId ?? null;
    const fundParsed = await (0, index_1.parseFundPdf)(buffer, file.name);
    if (fundParsed.fundKey !== 'unknown') {
        // Known fund — use fund-specific extraction
        const { rawText: _, ...stored } = fundParsed;
        extractedData = stored;
        // Auto-resolve fundId if not manually supplied
        if (!resolvedFundId) {
            const resolved = await (0, fund_resolver_1.resolveFund)(fundParsed.fundKey);
            if (resolved) {
                resolvedFundId = resolved.id;
                // Update fund with manager info from PDF if not already set
                if (fundParsed.fundManager && !resolved.fundName?.includes('Unknown')) {
                    await prisma_1.prisma.fund.update({
                        where: { id: resolved.id },
                        data: { manager: fundParsed.fundManager },
                    }).catch(() => { }); // Silently ignore if update fails
                }
            }
        }
    }
    else {
        // Unknown fund — fall back to generic parser
        const generic = await (0, pdfParser_1.parsePdf)(buffer);
        if (noticeType && noticeType !== 'auto' && noticeType !== generic.noticeType) {
            generic.noticeType = noticeType;
        }
        extractedData = generic;
    }
    const finalNoticeType = extractedData.noticeType ?? noticeType ?? 'capital_call';
    // Verify resolvedFundId still exists before linking (prevents FK constraint error)
    if (resolvedFundId) {
        const fundExists = await prisma_1.prisma.fund.findUnique({ where: { id: resolvedFundId }, select: { id: true } });
        if (!fundExists)
            resolvedFundId = null;
    }
    // AI validation — compare extracted values against the fund's historical pattern
    const validation = await (0, validationService_1.validateExtractedNotice)(resolvedFundId, extractedData, finalNoticeType).catch(err => {
        console.error('[VALIDATION] Failed to run validation:', err);
        return null;
    });
    if (validation)
        extractedData._validation = validation;
    const notice = await prisma_1.prisma.notice.create({
        data: {
            filename,
            originalName: file.name,
            noticeType: finalNoticeType,
            status: 'approved',
            fundId: resolvedFundId,
            extractedData: { ...extractedData, _source: 'notice_page' },
            confidence: extractedData.confidence ?? null,
            uploadedBy: user.email,
            approvedAt: new Date(),
        },
    });
    // Auto-process the notice for capital calls and distributions
    if (resolvedFundId) {
        const data = notice.extractedData ?? {};
        if (notice.noticeType === 'capital_call') {
            const latestFx = await prisma_1.prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } });
            const fx = data.fxRate ?? (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150);
            const grossUsd = parseFloat(String(data.grossCallUsd ?? 0));
            const netUsd = parseFloat(String(data.netCallUsd ?? grossUsd));
            const reinvest = parseFloat(String(data.reinvestableUsd ?? 0));
            const callPct = parseFloat(String(data.callPct ?? 0));
            const netJpy = Math.round(netUsd * parseFloat(String(fx)));
            const dueDate = data.dueDate ? new Date(data.dueDate) : new Date();
            const noticeDate = data.noticeDate ? new Date(data.noticeDate) : new Date();
            const existing = await prisma_1.prisma.capitalCall.findFirst({ where: { fundId: resolvedFundId, dueDate } });
            if (!existing) {
                const last = await prisma_1.prisma.capitalCall.findFirst({ where: { fundId: resolvedFundId }, orderBy: { callNumber: 'desc' } });
                const callNum = (last?.callNumber ?? 0) + 1;
                await prisma_1.prisma.capitalCall.create({
                    data: {
                        fundId: resolvedFundId, noticeDate, dueDate, callNumber: callNum, callPct,
                        grossCallUsd: grossUsd, netCallUsd: netUsd, reinvestableUsd: reinvest,
                        investmentAmountUsd: grossUsd,
                        managementFeeUsd: parseFloat(String(data.managementFeeUsd ?? 0)),
                        expenseUsd: parseFloat(String(data.expenseUsd ?? 0)),
                        netCallJpy: netJpy, fxRate: fx,
                        wireReference: data.wireReference ?? null,
                        status: 'approved',
                    },
                });
            }
        }
        else if (notice.noticeType === 'distribution') {
            const latestFx = await prisma_1.prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } });
            const fx = data.fxRate ?? (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150);
            const fxNum = parseFloat(String(fx));
            const distDate = data.distributionDate ? new Date(data.distributionDate) : new Date();
            const total = data.distributionUsd ?? 0;
            const reinvest = data.reinvestableUsd ?? 0;
            if (total > 0) {
                await prisma_1.prisma.distribution.create({
                    data: {
                        fundId: resolvedFundId, distributionDate: distDate, distType: 'Distribution',
                        amountUsd: total, amountJpy: Math.round(total * fxNum), fxRate: fx,
                        reinvestableUsd: reinvest, isRecallable: false,
                    },
                });
            }
        }
    }
    await (0, notificationService_1.notifyAllAdmins)({
        type: 'notice_uploaded',
        title: 'Notice Uploaded & Auto-Approved',
        message: `${user.email} uploaded a ${finalNoticeType.replace('_', ' ')} notice for ${extractedData.fundName ?? 'unknown fund'}. Automatically processed.`,
        link: '/notices',
        metadata: { notice_id: notice.id, fund_key: extractedData.fundKey ?? null },
    });
    return c.json(noticeDict(notice));
});
// ── POST /:id/approve ─────────────────────────────────────────────────────────
router.post('/:id/approve', async (c) => {
    const user = c.get('user');
    if (!(0, guard_1.canEdit)(user.role))
        return c.json({ detail: 'Edit access required.' }, 403);
    const notice = await prisma_1.prisma.notice.findUnique({ where: { id: c.req.param('id') } });
    if (!notice)
        return c.json({ detail: 'Notice not found' }, 404);
    const fundId = c.req.query('fund_id') ?? notice.fundId ?? undefined;
    const adminNotes = c.req.query('admin_notes') ?? undefined;
    if (!fundId)
        return c.json({ detail: 'fund_id required to approve.' }, 400);
    const data = notice.extractedData ?? {};
    const created = {};
    if (notice.noticeType === 'capital_call') {
        const latestFx = await prisma_1.prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } });
        const fx = data.fxRate ?? (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150);
        const grossUsd = parseFloat(String(data.grossCallUsd ?? data.amounts?.[0] ?? 0));
        const netUsd = parseFloat(String(data.netCallUsd ?? grossUsd));
        const reinvest = parseFloat(String(data.reinvestableUsd ?? 0));
        const callPct = parseFloat(String(data.callPct ?? 0));
        const netJpy = Math.round(netUsd * parseFloat(String(fx)));
        const dueDate = data.dueDate ? new Date(data.dueDate) : (data.dates?.[0] ? new Date(data.dates[0]) : new Date());
        const noticeDate = data.noticeDate ? new Date(data.noticeDate) : new Date();
        // Deduplicate — skip if a call for this fund+dueDate already exists
        const existing = await prisma_1.prisma.capitalCall.findFirst({ where: { fundId, dueDate } });
        if (existing) {
            created.capital_call = { id: existing.id, deduplicated: true };
        }
        else {
            const last = await prisma_1.prisma.capitalCall.findFirst({ where: { fundId }, orderBy: { callNumber: 'desc' } });
            const callNum = (last?.callNumber ?? 0) + 1;
            const cc = await prisma_1.prisma.capitalCall.create({
                data: {
                    fundId, noticeDate, dueDate, callNumber: callNum, callPct,
                    grossCallUsd: grossUsd, netCallUsd: netUsd, reinvestableUsd: reinvest,
                    investmentAmountUsd: grossUsd,
                    managementFeeUsd: parseFloat(String(data.managementFeeUsd ?? 0)),
                    expenseUsd: parseFloat(String(data.expenseUsd ?? 0)),
                    netCallJpy: netJpy, fxRate: fx,
                    wireReference: data.wireReference ?? null,
                    // 'approved' = admin confirmed; shows in dashboard immediately.
                    // Change to 'paid' once the wire is sent.
                    status: 'approved',
                },
            });
            created.capital_call = { id: cc.id };
        }
        if (data.investmentTargets?.length) {
            for (const it of data.investmentTargets) {
                const target = await prisma_1.prisma.investmentTarget.create({
                    data: {
                        fundId, projectName: it.projectName, actualName: it.actualName ?? null,
                        amountUsd: it.amountUsd ?? null, investmentType: it.investmentType ?? null,
                        sector: it.sector ?? null, geography: it.geography ?? null, dealType: it.dealType ?? null,
                    },
                });
                (created.investment_targets = created.investment_targets ?? []).push(target.id);
            }
        }
    }
    else if (notice.noticeType === 'distribution') {
        const latestFx = await prisma_1.prisma.fxRate.findFirst({ orderBy: { rateDate: 'desc' } });
        const fx = data.fxRate ?? (latestFx ? parseFloat(latestFx.usdJpy.toString()) : 150);
        const fxNum = parseFloat(String(fx));
        const distDate = data.distributionDate ? new Date(data.distributionDate) : (data.dates?.[0] ? new Date(data.dates[0]) : new Date());
        const bd = data.distributionBreakdown ?? {};
        const capReturn = bd.capitalReturnUsd ?? 0;
        const income = bd.incomeUsd ?? 0;
        const total = bd.totalUsd ?? data.distributionUsd ?? data.amounts?.[0] ?? 0;
        const reinvest = data.reinvestableUsd ?? bd.recallableUsd ?? 0;
        created.distributions = [];
        if (capReturn > 0 && income > 0) {
            const cr = await prisma_1.prisma.distribution.create({ data: { fundId, distributionDate: distDate, distType: 'Capital Return', amountUsd: capReturn, amountJpy: Math.round(capReturn * fxNum), fxRate: fx, reinvestableUsd: 0, isRecallable: false } });
            created.distributions.push(cr.id);
            const inc = await prisma_1.prisma.distribution.create({ data: { fundId, distributionDate: distDate, distType: 'Income', amountUsd: income, amountJpy: Math.round(income * fxNum), fxRate: fx, reinvestableUsd: reinvest, isRecallable: false } });
            created.distributions.push(inc.id);
        }
        else {
            const amtUsd = total || capReturn || income;
            const dist = await prisma_1.prisma.distribution.create({ data: { fundId, distributionDate: distDate, distType: capReturn > 0 ? 'Capital Return' : 'Income', amountUsd: amtUsd, amountJpy: Math.round(amtUsd * fxNum), fxRate: fx, reinvestableUsd: reinvest, isRecallable: false } });
            created.distributions.push(dist.id);
        }
    }
    else if (notice.noticeType === 'financial_statement') {
        if (data.navUsd) {
            const nav = await prisma_1.prisma.navRecord.create({ data: { fundId, navDate: data.navDate ? new Date(data.navDate) : new Date(), navUsd: data.navUsd, period: data.period ?? null, sourceNoticeId: notice.id } });
            created.nav_record = { id: nav.id };
        }
    }
    const updated = await prisma_1.prisma.notice.update({
        where: { id: notice.id },
        data: { status: 'approved', fundId, adminNotes: adminNotes ?? null, approvedAt: new Date() },
    });
    if (notice.uploadedBy) {
        await (0, notificationService_1.notifyUser)(notice.uploadedBy, {
            type: 'notice_approved', title: 'Notice Approved ✓',
            message: `Your ${notice.noticeType.replace('_', ' ')} notice has been approved and records created.`,
            link: '/notices',
        });
    }
    (0, rulesEngine_1.runRulesForNotice)(updated.id, data, fundId, notice.noticeType).catch(err => console.error('[RULES] Failed to run rules on notice', updated.id, err));
    return c.json({ message: 'Notice approved — records created!', created, ...noticeDict(updated) });
});
// ── POST /:id/reject ──────────────────────────────────────────────────────────
router.post('/:id/reject', async (c) => {
    const user = c.get('user');
    if (!(0, guard_1.canEdit)(user.role))
        return c.json({ detail: 'Edit access required.' }, 403);
    const adminNotes = c.req.query('admin_notes') ?? undefined;
    const notice = await prisma_1.prisma.notice.findUnique({ where: { id: c.req.param('id') } });
    if (!notice)
        return c.json({ detail: 'Notice not found' }, 404);
    const updated = await prisma_1.prisma.notice.update({
        where: { id: notice.id },
        data: { status: 'rejected', adminNotes: adminNotes ?? null },
    });
    if (notice.uploadedBy) {
        await (0, notificationService_1.notifyUser)(notice.uploadedBy, {
            type: 'notice_rejected', title: 'Notice Rejected',
            message: `Your ${notice.noticeType.replace('_', ' ')} notice was not approved.`,
            link: '/notices',
        });
    }
    return c.json({ message: 'Notice rejected.', ...noticeDict(updated) });
});
// ── DELETE /:id/notes — clears admin_notes from a notice ─────────────────────
router.delete('/:id/notes', async (c) => {
    const user = c.get('user');
    if (!(0, guard_1.canEdit)(user.role))
        return c.json({ detail: 'Edit access required.' }, 403);
    const notice = await prisma_1.prisma.notice.findUnique({ where: { id: c.req.param('id') } });
    if (!notice)
        return c.json({ detail: 'Notice not found' }, 404);
    const updated = await prisma_1.prisma.notice.update({ where: { id: notice.id }, data: { adminNotes: null } });
    return c.json(noticeDict(updated));
});
// ── PUT /:id/extracted ────────────────────────────────────────────────────────
router.put('/:id/extracted', async (c) => {
    const user = c.get('user');
    if (!(0, guard_1.canEdit)(user.role))
        return c.json({ detail: 'Edit access required.' }, 403);
    const notice = await prisma_1.prisma.notice.findUnique({ where: { id: c.req.param('id') } });
    if (!notice)
        return c.json({ detail: 'Notice not found' }, 404);
    const data = await c.req.json().catch(() => ({}));
    const updated = await prisma_1.prisma.notice.update({ where: { id: notice.id }, data: { extractedData: data } });
    return c.json(noticeDict(updated));
});
exports.default = router;
//# sourceMappingURL=notices.routes.js.map