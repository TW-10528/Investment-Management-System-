"use strict";
/**
 * PDF Parser Service — Advanced extraction for fund management documents.
 * Handles: Capital Call Notices, Distribution Notices, Financial Statements,
 *          and Combined Capital Call + Distribution notices.
 *
 * Key patterns learned:
 *   - "Capital Call and Deemed Distribution" → combined type
 *   - "Net Amount of Capital Call $X" → netCallUsd
 *   - "Amount of Capital Call $X" → grossCallUsd
 *   - "Project [Name]" → investment targets with sector/geography inference
 *   - Wire instructions: Bank, ABA, SWIFT, Account Name, Account Number
 *   - LP ID: "LPID[0-9]+" or "LP ID Number"
 *   - Commitment summary: "Commitment Amount $X", "Total Capital Called", "Unfunded Commitment"
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractByKeyword = extractByKeyword;
exports.parsePdf = parsePdf;
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const prisma_1 = require("../lib/prisma");
// ── Helpers ───────────────────────────────────────────────────────────────────
function normalise(text) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n');
}
function extractUsdAmounts(text) {
    const found = new Set();
    for (const m of text.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*[Mm](?:illion)?/g)) {
        const v = parseFloat(m[1].replace(/,/g, '')) * 1_000_000;
        if (v > 0)
            found.add(v);
    }
    for (const m of text.matchAll(/USD\s*([\d,]+(?:\.\d{1,2})?)/gi)) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v > 0)
            found.add(v);
    }
    for (const m of text.matchAll(/\$([\d,]+(?:\.\d{1,2})?)/g)) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v > 0)
            found.add(v);
    }
    return [...found].sort((a, b) => b - a);
}
function parseMoney(s) {
    return parseFloat(s.replace(/[$,¥\s()]/g, ''));
}
function extractLabelledUsd(text, ...labelPatterns) {
    for (const label of labelPatterns) {
        const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
            '[^\\n\\$\\d]{0,30}(?:USD\\s*)?(\\$?[\\d,]+(?:\\.\\d{1,2})?)', 'i');
        const m = text.match(re);
        if (m) {
            const v = parseMoney(m[1]);
            if (!isNaN(v) && v > 0)
                return v;
        }
    }
    return undefined;
}
function extractLabelledPct(text, ...labelPatterns) {
    for (const label of labelPatterns) {
        const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
            '[^\\n\\d]{0,20}([\\d.]+)\\s*%', 'i');
        const m = text.match(re);
        if (m) {
            const v = parseFloat(m[1]);
            if (!isNaN(v))
                return v;
        }
    }
    return undefined;
}
const MONTHS = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
};
function extractDates(text) {
    const found = new Set();
    for (const m of text.matchAll(/\b(\d{4})[-/](\d{2})[-/](\d{2})\b/g))
        found.add(`${m[1]}-${m[2]}-${m[3]}`);
    for (const m of text.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g)) {
        const [a, b, y] = [parseInt(m[1]), parseInt(m[2]), m[3]];
        found.add(`${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`);
    }
    const monthRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
    for (const m of text.matchAll(monthRe)) {
        const mo = MONTHS[m[1].toLowerCase()];
        if (mo)
            found.add(`${m[3]}-${mo}-${m[2].padStart(2, '0')}`);
    }
    for (const m of text.matchAll(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g))
        found.add(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
    return [...found].slice(0, 15);
}
function scoreTypes(text) {
    const t = text.toLowerCase();
    const ccKws = ['capital call', 'drawdown notice', 'contribution notice', 'call notice',
        '出資要請', 'wire instructions', 'called amount', 'capital contribution',
        'capital drawdown', 'fund drawdown', 'investment call', 'amount of capital call',
        'payable by', 'net capital call', 'gross capital call'];
    const distKws = ['distribution notice', 'distribution proceeds', 'return of capital',
        'distribution payment', '分配通知', 'income distribution',
        'realized distribution', 'dividend notice', 'capital return',
        'distribution amount', 'total distribution', 'deemed distribution',
        'gross distribution', 'net distribution'];
    const navKws = ['financial statement', 'net asset value', 'quarterly report', 'annual report',
        '財務諸表', 'nav report', 'fund performance', 'portfolio valuation',
        'as of quarter', 'total return', 'irr', 'tvpi', 'dpi', 'moic',
        'since inception', 'portfolio company update'];
    return {
        cc: ccKws.filter(k => t.includes(k)).length,
        dist: distKws.filter(k => t.includes(k)).length,
        nav: navKws.filter(k => t.includes(k)).length,
    };
}
function detectNoticeType(text) {
    const { cc, dist, nav } = scoreTypes(text);
    if (cc === 0 && dist === 0 && nav === 0)
        return 'capital_call';
    if (cc >= dist && cc >= nav)
        return 'capital_call';
    if (dist >= cc && dist >= nav)
        return 'distribution';
    return 'financial_statement';
}
function isCombinedNotice(text) {
    const t = text.toLowerCase();
    return ((t.includes('capital call') && t.includes('distribution')) &&
        (t.includes('deemed distribution') || t.includes('net capital call') ||
            t.includes('net amount of capital call') || t.includes('partially offset')));
}
function extractKeywords(text) {
    const kw = [
        'buyout', 'venture', 'growth equity', 'infrastructure', 'real estate', 'credit',
        'secondaries', 'secondary', 'recallable', 'management fee', 'carry', 'technology',
        'healthcare', 'energy', 'consumer', 'financial services', 'software',
        'north america', 'europe', 'asia pacific', 'japan', 'global', 'middle market',
        'private equity', 'private credit', 'real assets', 'co-investment',
        'continuation fund', 'gp-led', 'lp secondary', 'single asset', 'multi-asset',
    ];
    return kw.filter(k => text.toLowerCase().includes(k));
}
function extractFundName(text) {
    // "RE: Capital Call ... from [Fund Name]"
    const rePattern = /RE:\s*(?:Capital Call[^,\n]*from\s+)?([A-Z][A-Za-z0-9\s,&.\-–—]{4,80}(?:Fund|LP|Ltd|Limited|Partners|Capital|L\.P\.))/i;
    const m1 = text.match(rePattern);
    if (m1)
        return m1[1].trim().replace(/\s+/g, ' ');
    const patterns = [
        /(?:Fund(?:\s+Name)?|Subject|Re)\s*:\s*([A-Z][A-Za-z0-9\s,&.\-–—]{4,80}(?:Fund|LP|Ltd|Limited|Partners|Capital|L\.P\.))/,
        /([A-Z][A-Za-z0-9\s,&.\-–—]{4,60}(?:Feeder\s+Fund|Fund\s+L\.P\.|Fund,\s+L\.P\.))/,
        /([A-Z][A-Za-z0-9\s,&.\-–—]{4,60}(?:Fund|LP|Ltd|Limited|Partners|Capital))\s*(?:–|—|-|\n)/,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m)
            return m[1].trim().replace(/\s+/g, ' ');
    }
    return undefined;
}
function extractLpId(text) {
    const patterns = [
        /LP\s*ID\s*(?:Number\s*)?:?\s*([A-Z0-9\-]{4,20})/i,
        /Investor\s+(?:LP\s+)?ID(?:\s+Number)?\s*:?\s*([A-Z0-9\-]{4,20})/i,
        /(LPID\d+)/i,
        /Reference\s*:\s*([A-Z0-9\-]{4,20})\s*and\s+Your\s+Name/i,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m)
            return m[1].trim();
    }
    return undefined;
}
function extractWireInstructions(text) {
    const wire = {};
    const bankM = text.match(/(?:Beneficiary\s+)?Bank(?:\s+Name)?\s*:?\s*([^\n]{4,60})/i);
    if (bankM)
        wire.bank = bankM[1].trim();
    const abaM = text.match(/ABA\s*:?\s*(\d{9})/i);
    if (abaM)
        wire.aba = abaM[1];
    const swiftM = text.match(/SWIFT\s*(?:\/BIC)?\s*:?\s*([A-Z0-9]{8,11})/i);
    if (swiftM)
        wire.swift = swiftM[1];
    const acctNameM = text.match(/Account\s+Name\s*:?\s*([^\n]{4,80})/i);
    if (acctNameM)
        wire.accountName = acctNameM[1].trim();
    const acctNumM = text.match(/Account\s+(?:Number|No\.?)\s*:?\s*([A-Z0-9\-]{4,30})/i);
    if (acctNumM)
        wire.accountNumber = acctNumM[1].trim();
    const refM = text.match(/(?:Wire\s+)?Reference\s*:?\s*([A-Za-z0-9\- ]{4,50}(?=\s*and\s+Your|\s*$|\n))/i);
    if (refM)
        wire.reference = refM[1].trim();
    return Object.keys(wire).length > 0 ? wire : undefined;
}
function extractCommitmentSummary(text) {
    const summary = {};
    summary.commitmentUsd = extractLabelledUsd(text, 'Commitment Amount', 'Total Commitment', 'LP Commitment', 'Capital Commitment', 'Your Commitment');
    summary.totalCalledUsd = extractLabelledUsd(text, 'Total Capital Called', 'Cumulative Capital Called', 'Total Called', 'Capital Called to Date');
    summary.unfundedUsd = extractLabelledUsd(text, 'Unfunded Commitment', 'Remaining Commitment', 'Remaining Unfunded', 'Undrawn Commitment');
    summary.totalDistributionsUsd = extractLabelledUsd(text, 'Total Distributions', 'Total Limited Partner Distributions', 'Cumulative Distributions', 'Total Distributed');
    // Percentages
    const calledPct = extractLabelledPct(text, 'Total Capital Called', 'Cumulative Capital Called');
    if (calledPct)
        summary.totalCalledPct = calledPct;
    const unfundedPct = extractLabelledPct(text, 'Unfunded Commitment', 'Remaining Commitment');
    if (unfundedPct)
        summary.unfundedPct = unfundedPct;
    // DPI / distribution multiple from commitment summary
    const dpiM = text.match(/Total\s+(?:Limited\s+Partner\s+)?Distributions.*?([0-9.]+)\s*[xX×]\s+contributed/i);
    if (dpiM)
        summary.distributionMultiple = parseFloat(dpiM[1]);
    return Object.keys(summary).length > 0 ? summary : undefined;
}
// ── Sector/geography inference from project descriptions ─────────────────────
const SECTOR_KEYWORDS = [
    [/software|SaaS|tech(?:nology)?|digital/i, 'Technology'],
    [/insurance|financial\s+services|banking|fintech/i, 'Financial Services'],
    [/HVAC|plumbing|electrical|home\s+services|facility/i, 'Industrials'],
    [/healthcare|pharma|medical|biotech|life\s+sciences/i, 'Healthcare'],
    [/energy|oil|gas|renewable|utilities|power/i, 'Energy'],
    [/consumer|retail|food|beverage|restaurant/i, 'Consumer'],
    [/industrial|manufacturing|aerospace|defense/i, 'Industrials'],
    [/real\s+estate|property|REIT/i, 'Real Estate'],
    [/infrastructure|transport|logistics/i, 'Infrastructure'],
    [/secondary|secondaries|continuation\s+fund/i, 'Secondaries'],
    [/private\s+equity|buyout|PE\s+fund/i, 'Private Equity'],
];
const GEO_KEYWORDS = [
    [/\bUS\b|United\s+States|North\s+America|American|US\s+pension/i, 'North America'],
    [/Europe(?:an)?|UK|Germany|German|Spain|Spanish|France|French|Nordic|Dutch/i, 'Europe'],
    [/Asia|Japan|Japanese|China|Chinese|Singapore|Korea|Korean|Hong\s+Kong/i, 'Asia Pacific'],
    [/global|worldwide|multi.?region|international/i, 'Global'],
    [/Latin\s+America|Brazil|Mexico|South\s+America/i, 'Latin America'],
    [/Middle\s+East|Africa|MENA/i, 'Middle East & Africa'],
];
const DEAL_KEYWORDS = [
    [/GP.?led|manager.?led|continuation\s+fund/i, 'GP-Led Secondary'],
    [/LP\s+secondary|traditional.*LP|LP\s+interest/i, 'LP Secondary'],
    [/LP.?tender|tender\s+offer|acquisition\s+vehicle/i, 'LP Tender'],
    [/single.?asset/i, 'Single Asset'],
    [/multi.?asset|portfolio/i, 'Multi-Asset'],
    [/co.?investment|direct\s+investment/i, 'Co-Investment'],
    [/primary|fund\s+commitment/i, 'Primary'],
];
function inferSector(desc) {
    for (const [re, sector] of SECTOR_KEYWORDS) {
        if (re.test(desc))
            return sector;
    }
    return undefined;
}
function inferGeography(desc) {
    for (const [re, geo] of GEO_KEYWORDS) {
        if (re.test(desc))
            return geo;
    }
    return undefined;
}
function inferDealType(desc) {
    for (const [re, deal] of DEAL_KEYWORDS) {
        if (re.test(desc))
            return deal;
    }
    return undefined;
}
// ── Enhanced investment target extraction ─────────────────────────────────────
function extractInvestmentTargets(text, dates) {
    const targets = [];
    const seen = new Set();
    // Pattern 1: "Project [Name] is a ..." — extract paragraph as description
    const projectRe = /\b(Project\s+([A-Z][a-zA-Z]+))\s+is\s+(a|an)\s+([^\n]{20,400})/gi;
    for (const m of text.matchAll(projectRe)) {
        const projectName = m[1].trim();
        const desc = m[0].slice(0, 500);
        if (!seen.has(projectName)) {
            targets.push({
                projectName,
                investmentType: 'Secondary',
                sector: inferSector(desc),
                geography: inferGeography(desc),
                dealType: inferDealType(desc),
                description: desc.slice(0, 200),
            });
            seen.add(projectName);
        }
    }
    // Pattern 2: Distribution source table — "Project [Name]\n[ActualName]\tamt\tamt\tamt"
    // Also: "Project Raindrop\nTriton IV Continuation Fund SCSp\t17,483,891..."
    const distTableRe = /\b(Project\s+[A-Z][a-zA-Z]+)\s*\n([A-Z][A-Za-z0-9\s,.'&\-]{3,60}?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/gm;
    for (const m of text.matchAll(distTableRe)) {
        const projectName = m[1].trim();
        const actualName = m[2].trim();
        const total = parseMoney(m[5]);
        if (!seen.has(projectName) && total > 0) {
            targets.push({
                projectName,
                actualName,
                amountUsd: total,
                investmentType: 'Secondary',
                sector: 'Secondaries',
                geography: 'Global',
                dealType: 'LP Secondary',
            });
            seen.add(projectName);
        }
        else if (seen.has(projectName)) {
            // Update existing with actual name and amount if missing
            const existing = targets.find(t => t.projectName === projectName);
            if (existing) {
                if (!existing.actualName && actualName.length > 3)
                    existing.actualName = actualName;
                if (!existing.amountUsd && total > 0)
                    existing.amountUsd = total;
            }
        }
    }
    // Pattern 3: Simple "Project [Name]" mentions without full description
    const mentionRe = /\b(Project\s+([A-Z][a-zA-Z]+))\b/g;
    for (const m of text.matchAll(mentionRe)) {
        const projectName = m[1].trim();
        if (!seen.has(projectName)) {
            targets.push({ projectName, investmentType: 'Secondary', dealType: 'Secondary' });
            seen.add(projectName);
        }
    }
    // Pattern 4: Investment in / Portfolio Company
    for (const m of text.matchAll(/(?:Investment\s+(?:in|into)|Portfolio\s+Company|New\s+Investment|Follow-?On)[:\s–—]+([A-Z][A-Za-z0-9\s&,.'"\-–]{2,60})/gi)) {
        const name = m[1].trim().replace(/\s+/g, ' ').replace(/[,.:]+$/, '');
        if (!seen.has(name) && name.length >= 3 && !/^(the|a|an|this|that)\b/i.test(name)) {
            targets.push({ projectName: name, investmentType: 'Equity' });
            seen.add(name);
        }
    }
    // Set date from notice dates for undated targets
    const investDate = dates[0];
    targets.forEach(t => {
        if (!('investmentDate' in t)) {
            t.investmentDate = investDate ?? null;
        }
    });
    return targets.slice(0, 30); // cap at 30
}
// ── Capital-Call extraction ───────────────────────────────────────────────────
function extractCapitalCall(text, amounts, dates, combined) {
    const result = {};
    // Gross call — look for "Amount of Capital Call"
    result.grossCallUsd = extractLabelledUsd(text, 'Amount of Capital Call', 'Gross Capital Call', 'Gross Call Amount', 'Total Capital Call', 'Capital Call Amount', '出資要請額', 'Gross Amount', 'Gross Contribution', '6.00% Capital Call') ?? amounts[0];
    // Net call — "Net Amount of Capital Call" / "Net Capital Call"
    result.netCallUsd = extractLabelledUsd(text, 'Net Amount of Capital Call', 'Net Capital Call', 'Net Call Amount', 'Net Drawdown', 'Amount Due', 'Amount Payable', 'Wire Amount', 'Total Due', 'Total Payable', 'Please send your contribution of', 'Net Amount') ?? (combined ? undefined : (amounts[1] ?? result.grossCallUsd));
    // Deemed distribution offset in combined notices
    if (combined) {
        result.deemedDistUsd = extractLabelledUsd(text, 'Deemed Distribution', 'Less: Deemed Distribution', 'Distribution Offset', 'Less Distribution', 'Gross Distribution', 'Net Distribution');
        // Infer net if we have gross and deemed
        if (!result.netCallUsd && result.grossCallUsd && result.deemedDistUsd) {
            result.netCallUsd = result.grossCallUsd - result.deemedDistUsd;
        }
        result.reinvestableUsd = result.deemedDistUsd;
    }
    else {
        result.reinvestableUsd = extractLabelledUsd(text, 'Reinvestable Amount', 'Recallable Amount', 'Amount Being Reinvested');
    }
    // Components
    result.investmentAmountUsd = extractLabelledUsd(text, 'Investment Amount', 'New Investment', 'Follow-On Investment', 'Equity Investment');
    result.managementFeeUsd = extractLabelledUsd(text, 'Management Fee', 'Advisory Fee', 'Fund Expenses', 'Management Fees');
    result.expenseUsd = extractLabelledUsd(text, 'Fund Expenses', 'Other Expenses', 'Organisation Costs', 'Administrative Fee');
    // Call number
    const callNoM = text.match(/(?:Capital\s+)?Call\s+(?:No\.?|Number|#)\s*(\d+)/i)
        || text.match(/(\d+)(?:st|nd|rd|th)\s+Capital\s+Call/i);
    result.callNumber = callNoM ? parseInt(callNoM[1]) : undefined;
    // Call percentage — "6.00% Capital Call" or "6.00% of each Partner's capital commitment"
    const callPctM = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:Capital\s+Call|of\s+each\s+Partner|of\s+(?:committed|capital|commitment))/i)
        || text.match(/(?:call(?:ing|ed)?|draw(?:ing|down)?)\s+(?:an\s+additional\s+)?([0-9]+(?:\.[0-9]+)?)\s*%/i);
    result.callPct = callPctM ? parseFloat(callPctM[1]) / 100 : undefined;
    // Cumulative percentage — "cumulative capital contributions to 25.00%"
    const cumPctM = text.match(/cumulative\s+capital\s+contributions\s+to\s+([0-9]+(?:\.[0-9]+)?)\s*%/i)
        || text.match(/(?:total|cumulative)\s+called\s+(?:to\s+date\s+)?[^%\d]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    result.cumulativePct = cumPctM ? parseFloat(cumPctM[1]) / 100 : undefined;
    // Due date
    const dueDateRe = /(?:payable\s+by|due\s+(?:date\s+)?(?:by|on)?|payment\s+due|wire\s+(?:by|before)|deadline)[:\s,]+([A-Za-z0-9,/ \-.]{4,30})/i;
    const dueDateM = text.match(dueDateRe);
    if (dueDateM) {
        const parsed = extractDates(dueDateM[1] + ' ' + dueDateM[0].slice(-10));
        result.dueDate = parsed[0] ?? extractDates(dueDateM[0])[0];
    }
    if (!result.dueDate && dates.length > 0)
        result.dueDate = dates[0];
    // FX rate
    const fxPatterns = [
        /(?:FX|Exchange)\s+Rate[:\s]+([0-9]{2,4}(?:\.[0-9]{1,6})?)\s*(?:JPY|¥)?\/(?:USD|\$)/i,
        /1\s*(?:USD|\$)\s*=\s*([0-9]{2,4}(?:\.[0-9]{1,4})?)\s*(?:JPY|¥)/i,
        /([0-9]{2,4}(?:\.[0-9]{1,4})?)\s*(?:JPY|¥)\/(?:USD|\$)/i,
        /(?:applicable|spot)\s+(?:fx\s+)?rate[:\s]+([0-9]{2,4}(?:\.[0-9]{1,4})?)/i,
    ];
    for (const p of fxPatterns) {
        const m = text.match(p);
        if (m) {
            result.fxRate = parseFloat(m[1]);
            break;
        }
    }
    // Wire reference from LP ID
    const lpId = extractLpId(text);
    result.wireReference = lpId;
    // Wire instructions
    result.wireInstructions = extractWireInstructions(text);
    // Commitment summary
    result.commitmentSummary = extractCommitmentSummary(text);
    // LP ID
    result.lpId = lpId;
    // Investment targets
    result.investmentTargets = extractInvestmentTargets(text, dates);
    return result;
}
// ── Distribution extraction ───────────────────────────────────────────────────
function extractDistribution(text, amounts, dates) {
    const result = {};
    result.distributionUsd = extractLabelledUsd(text, 'Total Distribution', 'Total:', 'Distribution Amount', 'Total Proceeds', 'Gross Distribution', 'Net Distribution', '分配金総額', 'Distribution Proceeds', 'Total Distributable Amount', 'Total Secondary Investments') ?? amounts[0];
    const capitalReturn = extractLabelledUsd(text, 'Return of Capital', 'Capital Return', 'Capital Returned', 'Return of Invested Capital', 'Total.*Return of Capital');
    const income = extractLabelledUsd(text, 'Income Distribution', 'Realized Gain', 'Gain', 'Net Gain', 'Capital Gain', 'Net Profit', 'Total.*Gain');
    const recallable = extractLabelledUsd(text, 'Recallable Amount', 'Reinvestable Amount', 'Amount Subject to Recall');
    let totalUsd = result.distributionUsd;
    let capRet = capitalReturn;
    let inc = income;
    if (capRet && inc && !totalUsd)
        totalUsd = capRet + inc;
    if (totalUsd && capRet && !inc)
        inc = totalUsd - capRet;
    if (totalUsd && inc && !capRet)
        capRet = totalUsd - inc;
    // Extract distribution sources table
    const sources = [];
    const srcRe = /(Project\s+[A-Z][a-zA-Z]+|[A-Z][A-Za-z0-9\s,.'&\-]{5,50})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/gm;
    for (const m of text.matchAll(srcRe)) {
        const capRet2 = parseMoney(m[2]);
        const gain = parseMoney(m[3]);
        const total2 = parseMoney(m[4]);
        if (total2 > 10_000) {
            sources.push({ name: m[1].trim(), capitalReturn: capRet2, gain, total: total2 });
        }
    }
    result.distributionBreakdown = {
        capitalReturnUsd: capRet,
        incomeUsd: inc,
        recallableUsd: recallable,
        totalUsd,
        sources: sources.length > 0 ? sources : undefined,
    };
    result.reinvestableUsd = recallable;
    // Distribution date
    const distDateRe = /(?:Distribution\s+Date|Payment\s+Date|Record\s+Date|Value\s+Date|Cash\s+Distribution)[:\s]+([A-Za-z0-9,/\-. ]{4,30})/i;
    const dm = text.match(distDateRe);
    if (dm) {
        const parsed = extractDates(dm[1]);
        if (parsed[0])
            result.distributionDate = parsed[0];
    }
    if (!result.distributionDate && dates.length > 0)
        result.distributionDate = dates[0];
    // Investment targets from distribution sources
    result.investmentTargets = extractInvestmentTargets(text, dates);
    return result;
}
// ── Financial Statement ───────────────────────────────────────────────────────
function extractFinancialStatement(text, amounts, dates) {
    const result = {};
    result.navUsd = extractLabelledUsd(text, 'Net Asset Value', 'Total NAV', 'Fund NAV', 'NAV', 'Net Assets', 'Total Net Assets', '純資産総額') ?? amounts[0];
    result.navDate = dates[0];
    const periodPatterns = [
        /(?:As\s+of|Quarter\s+[Ee]nded|Period\s+[Ee]nded|[Ff]or\s+the\s+(?:period|quarter|year)\s+ended?)\s+([A-Za-z0-9,/ ]{4,30})/,
        /(Q[1-4]\s+20\d{2})/i,
        /([A-Za-z]+ (?:Quarter|Year) 20\d{2})/i,
        /(FY\s*20\d{2})/i,
    ];
    for (const p of periodPatterns) {
        const m = text.match(p);
        if (m) {
            result.period = m[1].trim();
            break;
        }
    }
    const irrM = text.match(/(?:Since\s+Inception\s+)?IRR[:\s]+([0-9.]+)\s*%/i)
        || text.match(/Internal\s+Rate\s+of\s+Return[:\s]+([0-9.]+)\s*%/i);
    result.irr = irrM ? parseFloat(irrM[1]) : undefined;
    const tvpiM = text.match(/TVPI[:\s]+([0-9.]+)\s*[xX×]?/i)
        || text.match(/Total\s+Value\s+(?:to|\/)\s+Paid[- ]In[:\s]+([0-9.]+)/i);
    result.tvpi = tvpiM ? parseFloat(tvpiM[1]) : undefined;
    const dpiM = text.match(/DPI[:\s]+([0-9.]+)\s*[xX×]?/i);
    result.dpi = dpiM ? parseFloat(dpiM[1]) : undefined;
    return result;
}
// ── Confidence ────────────────────────────────────────────────────────────────
function computeConfidence(noticeType, extracted, textLen) {
    let score = 0;
    if (textLen > 200)
        score += 0.10;
    if (textLen > 1000)
        score += 0.10;
    if (noticeType === 'capital_call') {
        if (extracted.grossCallUsd)
            score += 0.20;
        if (extracted.netCallUsd)
            score += 0.15;
        if (extracted.dueDate)
            score += 0.15;
        if (extracted.wireInstructions?.aba)
            score += 0.10;
        if (extracted.wireInstructions?.swift)
            score += 0.05;
        if (extracted.commitmentSummary?.commitmentUsd)
            score += 0.10;
        if (extracted.callPct)
            score += 0.05;
        if ((extracted.investmentTargets?.length ?? 0) > 0)
            score += 0.05;
    }
    else if (noticeType === 'distribution') {
        if (extracted.distributionUsd)
            score += 0.25;
        if (extracted.distributionBreakdown?.capitalReturnUsd)
            score += 0.15;
        if (extracted.distributionBreakdown?.incomeUsd)
            score += 0.10;
        if (extracted.distributionDate)
            score += 0.10;
        if ((extracted.distributionBreakdown?.sources?.length ?? 0) > 0)
            score += 0.10;
    }
    else {
        if (extracted.navUsd)
            score += 0.35;
        if (extracted.navDate)
            score += 0.15;
        if (extracted.period)
            score += 0.10;
        if (extracted.tvpi)
            score += 0.10;
        if (extracted.irr)
            score += 0.05;
    }
    const confidence = Math.min(score, 1.0);
    const grade = confidence >= 0.65 ? 'high' : confidence >= 0.35 ? 'medium' : 'low';
    return { confidence, grade };
}
// ── Keyword-anchored extraction ───────────────────────────────────────────────
// Finds a keyword label in the PDF text and extracts the value that follows it.
function extractByKeyword(text, keywords, extractionType) {
    for (const kw of keywords) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Search for the keyword, then capture text within the next 120 characters
        const re = new RegExp(escaped + '[^\\n]{0,120}', 'i');
        const m = text.match(re);
        if (!m)
            continue;
        const context = m[0];
        if (extractionType === 'usd') {
            // Match "$X,XXX.XX" or "USD X,XXX.XX" or plain numbers ≥ 100
            const moneyRe = /(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{1,2})?)/;
            const mv = context.slice(kw.length).match(moneyRe);
            if (mv) {
                const v = parseMoney(mv[1]);
                if (!isNaN(v) && v >= 0)
                    return v;
            }
        }
        else if (extractionType === 'pct') {
            const pv = context.slice(kw.length).match(/([\d.]+)\s*%/);
            if (pv) {
                const v = parseFloat(pv[1]);
                if (!isNaN(v))
                    return v;
            }
        }
        else if (extractionType === 'number') {
            const nv = context.slice(kw.length).match(/([\d,]+(?:\.\d+)?)/);
            if (nv) {
                const v = parseFloat(nv[1].replace(/,/g, ''));
                if (!isNaN(v))
                    return v;
            }
        }
        else if (extractionType === 'date') {
            const dates = extractDates(context.slice(kw.length));
            if (dates[0])
                return dates[0];
        }
        else if (extractionType === 'text') {
            // Grab first word/phrase after the keyword (up to newline or separator)
            const tv = context.slice(kw.length).match(/[:=\s]+([A-Za-z0-9][^\n,;]{1,60})/);
            if (tv)
                return tv[1].trim();
        }
    }
    return undefined;
}
// Run all active AttributeExtractors against the PDF text and merge results
async function applyCustomExtractors(text, base) {
    try {
        const extractors = await prisma_1.prisma.attributeExtractor.findMany({ where: { isActive: true } });
        const custom = {};
        for (const ext of extractors) {
            const value = extractByKeyword(text, ext.keywords, ext.extractionType);
            if (value !== undefined) {
                custom[ext.attributeName] = value;
            }
        }
        if (Object.keys(custom).length > 0) {
            return { ...base, _custom: custom, ...custom };
        }
    }
    catch (e) {
        console.warn('[EXTRACTOR] Custom extraction failed:', e);
    }
    return base;
}
// ── Main export ───────────────────────────────────────────────────────────────
async function parsePdf(buffer) {
    let text = '';
    try {
        const data = await (0, pdf_parse_1.default)(buffer, { max: 0 });
        text = normalise(data.text ?? '');
    }
    catch {
        return { noticeType: 'capital_call', confidence: 0, confidenceGrade: 'low', amounts: [], dates: [], keywords: [] };
    }
    if (!text.trim()) {
        return { noticeType: 'capital_call', confidence: 0, confidenceGrade: 'low', amounts: [], dates: [], keywords: [] };
    }
    const noticeType = detectNoticeType(text);
    const combined = isCombinedNotice(text);
    const amounts = extractUsdAmounts(text);
    const dates = extractDates(text);
    const keywords = extractKeywords(text);
    const fundName = extractFundName(text);
    const lpId = extractLpId(text);
    let specific = {};
    if (noticeType === 'capital_call')
        specific = extractCapitalCall(text, amounts, dates, combined);
    else if (noticeType === 'distribution')
        specific = extractDistribution(text, amounts, dates);
    else
        specific = extractFinancialStatement(text, amounts, dates);
    const { confidence, grade } = computeConfidence(noticeType, specific, text.length);
    const base = {
        noticeType,
        isCombined: combined,
        confidence,
        confidenceGrade: grade,
        fundName,
        lpId,
        amounts,
        dates,
        keywords,
        ...specific,
    };
    // Merge any custom keyword-anchored extractions from user-defined extractors
    return applyCustomExtractors(text, base);
}
//# sourceMappingURL=pdfParser.js.map