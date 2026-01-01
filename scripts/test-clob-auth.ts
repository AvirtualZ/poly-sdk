/**
 * Test CLOB Client Authentication
 *
 * 只测试认证，不执行交易
 *
 * 运行: pnpm exec tsx scripts/test-clob-auth.ts
 */

import 'dotenv/config';
import { PolymarketSDK } from '../src/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Testing CLOB Client Authentication');
  console.log('='.repeat(60));

  const privateKey = process.env.PRIVATE_KEY || process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }
  console.log(`✅ Private key found: ${privateKey.slice(0, 10)}...`);

  try {
    // Step 1: Create SDK (this triggers CLOB auth)
    console.log('\n[1] Creating SDK with private key...');
    const sdk = await PolymarketSDK.create({ privateKey });
    console.log('✅ SDK created successfully');

    // Check if trading service is properly initialized
    console.log('\n[1.5] Checking TradingService internal state...');
    console.log('   isInitialized:', sdk.tradingService.isInitialized());
    console.log('   credentials:', sdk.tradingService.getCredentials() ? 'present' : 'null');
    console.log('   clobClient:', sdk.tradingService.getClobClient() ? 'present' : 'null');

    // Step 2: Check trading service status
    console.log('\n[2] Checking TradingService...');
    const tradingService = sdk.tradingService;
    console.log('✅ TradingService available');

    // Step 3: Try to get orders (read-only, tests API key)
    console.log('\n[3] Testing CLOB API - Getting open orders...');
    const orders = await tradingService.getOpenOrders();
    console.log(`✅ Got ${orders.length} open orders`);

    // Step 4: Get trade history (another read-only test)
    console.log('\n[4] Testing CLOB API - Getting trades...');
    const trades = await tradingService.getTrades();
    console.log(`✅ Got ${trades.length} recent trades`);

    // Step 5: Get wallet address
    console.log('\n[5] Wallet info:');
    const wallet = sdk.getWalletAddress();
    console.log(`   Address: ${wallet}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED - CLOB Auth is working!');
    console.log('='.repeat(60));

    sdk.stop();
  } catch (error: any) {
    console.error('\n❌ Error during test:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('\n   Full error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
