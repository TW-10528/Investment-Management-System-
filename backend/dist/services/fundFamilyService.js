"use strict";
/**
 * FundFamilyService — Isolated service for new fund family onboarding logic
 * Does NOT modify existing 8 funds (they have fund_family_id = NULL)
 * New funds ONLY use this service for family-based grouping
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fundFamilyService = void 0;
const prisma_1 = require("../lib/prisma");
class FundFamilyService {
    /**
     * Create a new fund family
     * Only used for NEW funds (e.g., Dover XII, not existing Dover XI)
     */
    async createFundFamily(input) {
        // Check if family already exists
        const existing = await prisma_1.prisma.fundFamily.findUnique({
            where: { familyName: input.familyName },
        });
        if (existing) {
            return existing;
        }
        // Create new family
        const family = await prisma_1.prisma.fundFamily.create({
            data: {
                familyName: input.familyName,
                familyCode: input.familyCode,
                strategy: input.strategy,
                manager: input.manager,
            },
        });
        return family;
    }
    /**
     * Get or create fund family
     */
    async getOrCreateFundFamily(input) {
        return this.createFundFamily(input);
    }
    /**
     * Add fund to family (isolated to new funds only)
     */
    async addFundToFamily(input) {
        const fund = await prisma_1.prisma.fund.update({
            where: { id: input.fundId },
            data: {
                fundFamilyId: input.fundFamilyId,
                familySequence: input.familySequence,
                isNewFund: true, // Mark as new fund
            },
            include: {
                fundFamily: true,
            },
        });
        return fund;
    }
    /**
     * Get fund family with all members
     */
    async getFundFamily(fundFamilyId) {
        const family = await prisma_1.prisma.fundFamily.findUnique({
            where: { id: fundFamilyId },
            include: {
                funds: {
                    where: { isNewFund: true }, // Only new funds in family
                    orderBy: { familySequence: 'asc' },
                },
            },
        });
        return family;
    }
    /**
     * List all fund families (new funds only, not existing 8)
     */
    async listFundFamilies() {
        const families = await prisma_1.prisma.fundFamily.findMany({
            include: {
                funds: {
                    where: { isNewFund: true },
                    orderBy: { familySequence: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return families;
    }
    /**
     * Detect fund family from extracted data
     * E.g., "Dover Street XII" → family: "Dover Street", sequence: 12
     */
    detectFundFamily(fundName) {
        // Pattern: "Fund Name" + Roman numeral or number
        const romanPatterns = [
            { pattern: /^(.+)\s+X{1,3}(IX|IV|V?I{0,3})$/i, suffix: 'roman' },
            { pattern: /^(.+)\s+(\d+)$/i, suffix: 'number' },
        ];
        for (const { pattern } of romanPatterns) {
            const match = fundName.match(pattern);
            if (match) {
                return {
                    familyName: match[1].trim(),
                    fullName: fundName,
                };
            }
        }
        // No family detected
        return null;
    }
    /**
     * Get only NEW funds (isNewFund = true)
     * Existing 8 funds are completely isolated
     */
    async getNewFunds() {
        const newFunds = await prisma_1.prisma.fund.findMany({
            where: { isNewFund: true },
            include: { fundFamily: true },
            orderBy: { createdAt: 'desc' },
        });
        return newFunds;
    }
    /**
     * Get existing 8 funds (isNewFund = false, fundFamilyId = NULL)
     * These are NEVER modified
     */
    async getExistingFunds() {
        const existingFunds = await prisma_1.prisma.fund.findMany({
            where: {
                isNewFund: false,
                fundFamilyId: null,
            },
            orderBy: { fundName: 'asc' },
        });
        return existingFunds;
    }
    /**
     * Get all families with their members (existing + new funds)
     * Groups existing funds by extracted family name and includes new funds in their families
     */
    async getAllFamiliesWithMembers() {
        // Get all families from database (new funds only)
        const families = await prisma_1.prisma.fundFamily.findMany({
            include: {
                funds: {
                    where: { isNewFund: true },
                    orderBy: { familySequence: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        // Get existing funds
        const existingFunds = await this.getExistingFunds();
        // Group existing funds by extracted family name
        const familiesByName = {};
        existingFunds.forEach(fund => {
            const detected = this.detectFundFamily(fund.fundName);
            const familyName = detected?.familyName || fund.fundName;
            if (!familiesByName[familyName]) {
                familiesByName[familyName] = {
                    id: `existing_${familyName.replace(/\s+/g, '_')}`, // Pseudo ID for existing families
                    familyName,
                    familyCode: null,
                    strategy: null,
                    manager: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    funds: [],
                };
            }
            familiesByName[familyName].funds.push(fund);
        });
        // Merge new families with existing families
        const allFamilies = families.map(f => ({
            ...f,
            funds: [...(familiesByName[f.familyName]?.funds || []), ...f.funds],
        }));
        // Add existing families that don't have new funds
        Object.values(familiesByName).forEach(existingFamily => {
            if (!allFamilies.find(f => f.familyName === existingFamily.familyName)) {
                allFamilies.push(existingFamily);
            }
        });
        return allFamilies;
    }
}
exports.fundFamilyService = new FundFamilyService();
//# sourceMappingURL=fundFamilyService.js.map