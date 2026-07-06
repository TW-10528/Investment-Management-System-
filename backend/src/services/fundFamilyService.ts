/**
 * FundFamilyService — Isolated service for new fund family onboarding logic
 * Does NOT modify existing 8 funds (they have fund_family_id = NULL)
 * New funds ONLY use this service for family-based grouping
 */

import { prisma } from '../lib/prisma';

export interface CreateFundFamilyInput {
  familyName: string;
  familyCode?: string;
  strategy?: string;
  manager?: string;
}

export interface AddFundToFamilyInput {
  fundFamilyId: string;
  fundId: string;
  familySequence?: number;
}

class FundFamilyService {
  /**
   * Create a new fund family
   * Only used for NEW funds (e.g., Dover XII, not existing Dover XI)
   */
  async createFundFamily(input: CreateFundFamilyInput) {
    // Check if family already exists
    const existing = await prisma.fundFamily.findUnique({
      where: { familyName: input.familyName },
    });

    if (existing) {
      return existing;
    }

    // Create new family
    const family = await prisma.fundFamily.create({
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
  async getOrCreateFundFamily(input: CreateFundFamilyInput) {
    return this.createFundFamily(input);
  }

  /**
   * Add fund to family (isolated to new funds only)
   */
  async addFundToFamily(input: AddFundToFamilyInput) {
    const fund = await prisma.fund.update({
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
  async getFundFamily(fundFamilyId: string) {
    const family = await prisma.fundFamily.findUnique({
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
    const families = await prisma.fundFamily.findMany({
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
  detectFundFamily(fundName: string) {
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
    const newFunds = await prisma.fund.findMany({
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
    const existingFunds = await prisma.fund.findMany({
      where: {
        isNewFund: false,
        fundFamilyId: null,
      },
      orderBy: { fundName: 'asc' },
    });

    return existingFunds;
  }
}

export const fundFamilyService = new FundFamilyService();
