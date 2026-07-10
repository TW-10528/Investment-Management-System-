const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkFunds() {
  try {
    const funds = await prisma.fund.findMany({
      select: {
        id: true,
        fundName: true,
        strategy: true,
        vintageYear: true,
      },
      orderBy: { fundName: 'asc' },
    });

    console.log('\n=== All Funds in Database ===\n');
    funds.forEach((fund, idx) => {
      console.log(`${idx + 1}. ${fund.fundName}`);
      console.log(`   ID: ${fund.id}`);
      console.log(`   Strategy: ${fund.strategy || 'N/A'}`);
      console.log(`   Vintage: ${fund.vintageYear || 'N/A'}\n`);
    });

    // Check specifically for Dover XII
    const doverXII = await prisma.fund.findFirst({
      where: {
        fundName: {
          contains: 'Dover Street XII',
          mode: 'insensitive',
        },
      },
    });

    // Check for Dover XI
    const doverXI = await prisma.fund.findFirst({
      where: {
        fundName: {
          contains: 'Dover Street XI',
          mode: 'insensitive',
        },
      },
    });

    console.log('\n=== Dover Series Status ===');
    if (doverXI) {
      console.log('✅ Dover Street XI EXISTS');
      console.log(`   Fund Name: ${doverXI.fundName}`);
    } else {
      console.log('❌ Dover Street XI not found');
    }

    if (doverXII) {
      console.log('✅ Dover Street XII EXISTS');
      console.log(`   Fund Name: ${doverXII.fundName}`);
    } else {
      console.log('❌ Dover Street XII NOT found');
      console.log('   → Will CREATE new fund for Dover XII');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error querying database:', error.message);
    process.exit(1);
  }
}

checkFunds();
