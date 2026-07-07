"use strict";
/**
 * Fund Family Routes — Isolated API endpoints for new fund onboarding
 * Does NOT affect existing 8 funds
 */
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const fundFamilyService_1 = require("../../services/fundFamilyService");
const prisma_1 = require("../../lib/prisma");
const app = new hono_1.Hono();
// GET /api/fund-families — List all new fund families
app.get('/', async (c) => {
    try {
        const families = await fundFamilyService_1.fundFamilyService.listFundFamilies();
        return c.json({ data: families });
    }
    catch (error) {
        console.error('Error listing fund families:', error);
        return c.json({ error: 'Failed to list fund families' }, 500);
    }
});
// POST /api/fund-families — Create new fund family
app.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const { familyName, familyCode, strategy, manager } = body;
        if (!familyName) {
            return c.json({ error: 'Family name required' }, 400);
        }
        const family = await fundFamilyService_1.fundFamilyService.createFundFamily({
            familyName,
            familyCode,
            strategy,
            manager,
        });
        return c.json({ data: family }, 201);
    }
    catch (error) {
        console.error('Error creating fund family:', error);
        return c.json({ error: 'Failed to create fund family' }, 500);
    }
});
// GET /api/fund-families/:id — Get family with members
app.get('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const family = await fundFamilyService_1.fundFamilyService.getFundFamily(id);
        if (!family) {
            return c.json({ error: 'Fund family not found' }, 404);
        }
        return c.json({ data: family });
    }
    catch (error) {
        console.error('Error getting fund family:', error);
        return c.json({ error: 'Failed to get fund family' }, 500);
    }
});
// POST /api/fund-families/add-fund — Create new fund and add to family
app.post('/add-fund', async (c) => {
    try {
        const body = await c.req.json();
        const { fundName, manager, strategy, currency, commitmentUsd, familyName, familyCode, } = body;
        if (!fundName || !familyName) {
            return c.json({ error: 'Fund name and family name required' }, 400);
        }
        // Step 1: Create or get fund family
        const family = await fundFamilyService_1.fundFamilyService.getOrCreateFundFamily({
            familyName,
            familyCode,
            strategy,
            manager,
        });
        // Step 2: Create new fund
        const newFund = await prisma_1.prisma.fund.create({
            data: {
                fundName,
                manager,
                strategy,
                currency: currency || 'USD',
                commitmentUsd: commitmentUsd ? parseFloat(commitmentUsd) : 0,
                isActive: true,
                isNewFund: true, // Mark as new fund
                fundFamilyId: family.id, // Link to family
            },
            include: {
                fundFamily: true,
            },
        });
        return c.json({ data: newFund }, 201);
    }
    catch (error) {
        console.error('Error adding fund to family:', error);
        return c.json({ error: 'Failed to add fund' }, 500);
    }
});
// GET /api/fund-families/new-funds — Get only new funds (not existing 8)
app.get('/list/new-funds', async (c) => {
    try {
        const newFunds = await fundFamilyService_1.fundFamilyService.getNewFunds();
        return c.json({ data: newFunds });
    }
    catch (error) {
        console.error('Error listing new funds:', error);
        return c.json({ error: 'Failed to list new funds' }, 500);
    }
});
// GET /api/fund-families/existing-funds — Get only existing 8 funds (read-only)
app.get('/list/existing-funds', async (c) => {
    try {
        const existingFunds = await fundFamilyService_1.fundFamilyService.getExistingFunds();
        return c.json({ data: existingFunds });
    }
    catch (error) {
        console.error('Error listing existing funds:', error);
        return c.json({ error: 'Failed to list existing funds' }, 500);
    }
});
// GET /api/fund-families/with-members — Get all families with their members (existing + new funds)
app.get('/with-members', async (c) => {
    try {
        const familiesWithMembers = await fundFamilyService_1.fundFamilyService.getAllFamiliesWithMembers();
        return c.json({ data: familiesWithMembers });
    }
    catch (error) {
        console.error('Error listing families with members:', error);
        return c.json({ error: 'Failed to list families' }, 500);
    }
});
exports.default = app;
//# sourceMappingURL=fund-family.routes.js.map