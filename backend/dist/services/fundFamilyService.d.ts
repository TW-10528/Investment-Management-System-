/**
 * FundFamilyService — Isolated service for new fund family onboarding logic
 * Does NOT modify existing 8 funds (they have fund_family_id = NULL)
 * New funds ONLY use this service for family-based grouping
 */
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
declare class FundFamilyService {
    /**
     * Create a new fund family
     * Only used for NEW funds (e.g., Dover XII, not existing Dover XI)
     */
    createFundFamily(input: CreateFundFamilyInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        manager: string | null;
        strategy: string | null;
        familyName: string;
        familyCode: string | null;
    }>;
    /**
     * Get or create fund family
     */
    getOrCreateFundFamily(input: CreateFundFamilyInput): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        manager: string | null;
        strategy: string | null;
        familyName: string;
        familyCode: string | null;
    }>;
    /**
     * Add fund to family (isolated to new funds only)
     */
    addFundToFamily(input: AddFundToFamilyInput): Promise<{
        fundFamily: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            manager: string | null;
            strategy: string | null;
            familyName: string;
            familyCode: string | null;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        wireReference: string | null;
        notes: string | null;
        manager: string | null;
        strategy: string | null;
        currency: string;
        fundName: string;
        fundNameJp: string | null;
        administrator: string | null;
        vintageYear: number | null;
        commitmentUsd: import("@prisma/client/runtime/library").Decimal;
        contractCommitmentUsd: import("@prisma/client/runtime/library").Decimal | null;
        commitmentJpy: bigint | null;
        contractCommitmentJpy: bigint | null;
        entryFxRate: import("@prisma/client/runtime/library").Decimal | null;
        contractDate: Date | null;
        investmentPeriodStart: Date | null;
        investmentPeriodEnd: Date | null;
        fundTermYears: number | null;
        managementFeePct: import("@prisma/client/runtime/library").Decimal | null;
        carryPct: import("@prisma/client/runtime/library").Decimal | null;
        hurdleRatePct: import("@prisma/client/runtime/library").Decimal | null;
        wireBank: string | null;
        wireAccountName: string | null;
        wireAccountNumber: string | null;
        wireAba: string | null;
        wireSwift: string | null;
        aiExtractionTemplate: import("@prisma/client/runtime/library").JsonValue | null;
        fundFamilyId: string | null;
        familySequence: number | null;
        isNewFund: boolean;
    }>;
    /**
     * Get fund family with all members
     */
    getFundFamily(fundFamilyId: string): Promise<({
        funds: {
            id: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            wireReference: string | null;
            notes: string | null;
            manager: string | null;
            strategy: string | null;
            currency: string;
            fundName: string;
            fundNameJp: string | null;
            administrator: string | null;
            vintageYear: number | null;
            commitmentUsd: import("@prisma/client/runtime/library").Decimal;
            contractCommitmentUsd: import("@prisma/client/runtime/library").Decimal | null;
            commitmentJpy: bigint | null;
            contractCommitmentJpy: bigint | null;
            entryFxRate: import("@prisma/client/runtime/library").Decimal | null;
            contractDate: Date | null;
            investmentPeriodStart: Date | null;
            investmentPeriodEnd: Date | null;
            fundTermYears: number | null;
            managementFeePct: import("@prisma/client/runtime/library").Decimal | null;
            carryPct: import("@prisma/client/runtime/library").Decimal | null;
            hurdleRatePct: import("@prisma/client/runtime/library").Decimal | null;
            wireBank: string | null;
            wireAccountName: string | null;
            wireAccountNumber: string | null;
            wireAba: string | null;
            wireSwift: string | null;
            aiExtractionTemplate: import("@prisma/client/runtime/library").JsonValue | null;
            fundFamilyId: string | null;
            familySequence: number | null;
            isNewFund: boolean;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        manager: string | null;
        strategy: string | null;
        familyName: string;
        familyCode: string | null;
    }) | null>;
    /**
     * List all fund families (new funds only, not existing 8)
     */
    listFundFamilies(): Promise<({
        funds: {
            id: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            wireReference: string | null;
            notes: string | null;
            manager: string | null;
            strategy: string | null;
            currency: string;
            fundName: string;
            fundNameJp: string | null;
            administrator: string | null;
            vintageYear: number | null;
            commitmentUsd: import("@prisma/client/runtime/library").Decimal;
            contractCommitmentUsd: import("@prisma/client/runtime/library").Decimal | null;
            commitmentJpy: bigint | null;
            contractCommitmentJpy: bigint | null;
            entryFxRate: import("@prisma/client/runtime/library").Decimal | null;
            contractDate: Date | null;
            investmentPeriodStart: Date | null;
            investmentPeriodEnd: Date | null;
            fundTermYears: number | null;
            managementFeePct: import("@prisma/client/runtime/library").Decimal | null;
            carryPct: import("@prisma/client/runtime/library").Decimal | null;
            hurdleRatePct: import("@prisma/client/runtime/library").Decimal | null;
            wireBank: string | null;
            wireAccountName: string | null;
            wireAccountNumber: string | null;
            wireAba: string | null;
            wireSwift: string | null;
            aiExtractionTemplate: import("@prisma/client/runtime/library").JsonValue | null;
            fundFamilyId: string | null;
            familySequence: number | null;
            isNewFund: boolean;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        manager: string | null;
        strategy: string | null;
        familyName: string;
        familyCode: string | null;
    })[]>;
    /**
     * Detect fund family from extracted data
     * E.g., "Dover Street XII" → family: "Dover Street", sequence: 12
     */
    detectFundFamily(fundName: string): {
        familyName: string;
        fullName: string;
    } | null;
    /**
     * Get only NEW funds (isNewFund = true)
     * Existing 8 funds are completely isolated
     */
    getNewFunds(): Promise<({
        fundFamily: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            manager: string | null;
            strategy: string | null;
            familyName: string;
            familyCode: string | null;
        } | null;
    } & {
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        wireReference: string | null;
        notes: string | null;
        manager: string | null;
        strategy: string | null;
        currency: string;
        fundName: string;
        fundNameJp: string | null;
        administrator: string | null;
        vintageYear: number | null;
        commitmentUsd: import("@prisma/client/runtime/library").Decimal;
        contractCommitmentUsd: import("@prisma/client/runtime/library").Decimal | null;
        commitmentJpy: bigint | null;
        contractCommitmentJpy: bigint | null;
        entryFxRate: import("@prisma/client/runtime/library").Decimal | null;
        contractDate: Date | null;
        investmentPeriodStart: Date | null;
        investmentPeriodEnd: Date | null;
        fundTermYears: number | null;
        managementFeePct: import("@prisma/client/runtime/library").Decimal | null;
        carryPct: import("@prisma/client/runtime/library").Decimal | null;
        hurdleRatePct: import("@prisma/client/runtime/library").Decimal | null;
        wireBank: string | null;
        wireAccountName: string | null;
        wireAccountNumber: string | null;
        wireAba: string | null;
        wireSwift: string | null;
        aiExtractionTemplate: import("@prisma/client/runtime/library").JsonValue | null;
        fundFamilyId: string | null;
        familySequence: number | null;
        isNewFund: boolean;
    })[]>;
    /**
     * Get existing 8 funds (isNewFund = false, fundFamilyId = NULL)
     * These are NEVER modified
     */
    getExistingFunds(): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        wireReference: string | null;
        notes: string | null;
        manager: string | null;
        strategy: string | null;
        currency: string;
        fundName: string;
        fundNameJp: string | null;
        administrator: string | null;
        vintageYear: number | null;
        commitmentUsd: import("@prisma/client/runtime/library").Decimal;
        contractCommitmentUsd: import("@prisma/client/runtime/library").Decimal | null;
        commitmentJpy: bigint | null;
        contractCommitmentJpy: bigint | null;
        entryFxRate: import("@prisma/client/runtime/library").Decimal | null;
        contractDate: Date | null;
        investmentPeriodStart: Date | null;
        investmentPeriodEnd: Date | null;
        fundTermYears: number | null;
        managementFeePct: import("@prisma/client/runtime/library").Decimal | null;
        carryPct: import("@prisma/client/runtime/library").Decimal | null;
        hurdleRatePct: import("@prisma/client/runtime/library").Decimal | null;
        wireBank: string | null;
        wireAccountName: string | null;
        wireAccountNumber: string | null;
        wireAba: string | null;
        wireSwift: string | null;
        aiExtractionTemplate: import("@prisma/client/runtime/library").JsonValue | null;
        fundFamilyId: string | null;
        familySequence: number | null;
        isNewFund: boolean;
    }[]>;
    /**
     * Get all families with their members (existing + new funds)
     * Groups existing funds by extracted family name and includes new funds in their families
     */
    getAllFamiliesWithMembers(): Promise<{
        funds: any[];
        id: string;
        createdAt: Date;
        updatedAt: Date;
        manager: string | null;
        strategy: string | null;
        familyName: string;
        familyCode: string | null;
    }[]>;
}
export declare const fundFamilyService: FundFamilyService;
export {};
//# sourceMappingURL=fundFamilyService.d.ts.map