/**
 * E2E Test: WebSocket User Channel with Order Placement
 *
 * 完整测试流程:
 * 1. 连接 WebSocket 并订阅 User Channel
 * 2. 下一个限价单（价格设低，不会立即成交）
 * 3. 观察 ORDER PLACEMENT 事件
 * 4. 取消订单
 * 5. 观察 ORDER CANCELLATION 事件
 *
 * 运行: pnpm exec tsx scripts/test-user-channel-e2e.ts
 *
 * ⚠️ 注意: 这个测试会下真实订单然后取消
 */

import 'dotenv/config';
import {
  PolymarketSDK,
  RealtimeServiceV2,
} from '../src/index.js';

// Test config - use a liquid, active market
// Using a future event that's likely to stay open
const TEST_MARKET_SLUG = 'us-recession-in-2025'; // Active market
const ORDER_PRICE = 0.01; // Very low price, won't fill
const ORDER_SIZE = 100; // Min order value is $1, so 100 * $0.01 = $1

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

async function main() {
  const results: TestResult[] = [];
  let realtimeService: RealtimeServiceV2 | null = null;
  let sdk: PolymarketSDK | null = null;
  let placedOrderId: string | null = null;

  console.log('='.repeat(60));
  console.log('E2E Test: WebSocket User Channel with Order Placement');
  console.log('='.repeat(60));

  const privateKey = process.env.PRIVATE_KEY || process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }

  try {
    // ========== Step 1: Setup SDK ==========
    console.log('\n[1] Setting up SDK...');

    sdk = await PolymarketSDK.create({ privateKey });

    const credentials = sdk.tradingService.getCredentials();
    if (!credentials) {
      throw new Error('Failed to get CLOB credentials');
    }

    results.push({ step: 'Setup SDK', success: true, message: 'SDK initialized' });
    console.log('✅ SDK initialized');

    // ========== Step 2: Get Market Info ==========
    console.log('\n[2] Getting market info...');

    const market = await sdk.markets.getMarket(TEST_MARKET_SLUG);

    if (!market) {
      throw new Error(`Market not found: ${TEST_MARKET_SLUG}`);
    }

    // Get Yes token ID
    const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
    const yesTokenId = yesToken?.tokenId;
    if (!yesTokenId) {
      throw new Error('Yes token not found');
    }
    console.log(`   Yes Token ID: ${yesTokenId.slice(0, 20)}...`);

    results.push({
      step: 'Get Market',
      success: true,
      message: `Found market: ${market.question?.slice(0, 50)}...`,
      data: { conditionId: market.condition_id, yesTokenId }
    });
    console.log(`✅ Market: ${market.question?.slice(0, 50)}...`);
    console.log(`   Condition ID: ${market.condition_id?.slice(0, 20)}...`);

    // ========== Step 3: Connect WebSocket ==========
    console.log('\n[3] Connecting WebSocket...');

    realtimeService = new RealtimeServiceV2({
      autoReconnect: false,
      pingInterval: 5000,
      debug: false,
    });

    realtimeService.connect();

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
      if (realtimeService!.isConnected()) {
        clearTimeout(timeout);
        resolve();
        return;
      }
      realtimeService!.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    results.push({ step: 'WebSocket Connect', success: true, message: 'Connected' });
    console.log('✅ WebSocket connected');

    // ========== Step 4: Subscribe to User Channel ==========
    console.log('\n[4] Subscribing to User Channel...');

    const receivedEvents: { type: string; data: any; timestamp: number }[] = [];

    const subscription = realtimeService.subscribeUserEvents(
      {
        key: credentials.key,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
      },
      {
        onOrder: (order) => {
          console.log(`\n   📋 ORDER EVENT: ${order.eventType}`);
          console.log(`      Order ID: ${order.orderId.slice(0, 16)}...`);
          console.log(`      Side: ${order.side}, Price: ${order.price}`);
          receivedEvents.push({ type: `ORDER_${order.eventType}`, data: order, timestamp: Date.now() });
        },
        onTrade: (trade) => {
          console.log(`\n   💰 TRADE EVENT: ${trade.status}`);
          console.log(`      Trade ID: ${trade.tradeId.slice(0, 16)}...`);
          receivedEvents.push({ type: `TRADE_${trade.status}`, data: trade, timestamp: Date.now() });
        },
        onError: (error) => {
          console.error(`\n   ❌ ERROR: ${error.message}`);
        },
      }
    );

    results.push({ step: 'Subscribe User Channel', success: true, message: 'Subscribed' });
    console.log('✅ Subscribed to User Channel');

    // Small delay to ensure subscription is active
    await sleep(1000);

    // ========== Step 5: Place Order ==========
    console.log('\n[5] Placing test order...');
    console.log(`   Token: YES`);
    console.log(`   Side: BUY`);
    console.log(`   Price: ${ORDER_PRICE}`);
    console.log(`   Size: ${ORDER_SIZE}`);

    const orderResult = await sdk.tradingService.createLimitOrder({
      tokenId: yesTokenId,
      side: 'BUY',
      price: ORDER_PRICE,
      size: ORDER_SIZE,
    });

    if (!orderResult.success || !orderResult.orderId) {
      throw new Error(`Order placement failed: ${orderResult.errorMsg || 'Unknown error'}`);
    }

    placedOrderId = orderResult.orderId;
    results.push({
      step: 'Place Order',
      success: true,
      message: `Order placed: ${placedOrderId.slice(0, 16)}...`
    });
    console.log(`✅ Order placed: ${placedOrderId.slice(0, 16)}...`);

    // ========== Step 6: Wait for PLACEMENT Event ==========
    console.log('\n[6] Waiting for PLACEMENT event (max 10s)...');

    const placementReceived = await waitForEvent(
      () => receivedEvents.some(e => e.type === 'ORDER_PLACEMENT'),
      10000
    );

    if (placementReceived) {
      results.push({ step: 'Receive PLACEMENT', success: true, message: 'Event received' });
      console.log('✅ PLACEMENT event received via WebSocket');
    } else {
      results.push({ step: 'Receive PLACEMENT', success: false, message: 'Timeout' });
      console.log('⚠️ PLACEMENT event not received (timeout)');
    }

    // ========== Step 7: Cancel Order ==========
    console.log('\n[7] Canceling order...');

    const cancelResult = await sdk.tradingService.cancelOrder(placedOrderId);

    if (!cancelResult.success) {
      throw new Error(`Cancel failed: ${cancelResult.errorMsg || 'Unknown error'}`);
    }

    results.push({ step: 'Cancel Order', success: true, message: 'Order canceled' });
    console.log('✅ Order canceled');

    // ========== Step 8: Wait for CANCELLATION Event ==========
    console.log('\n[8] Waiting for CANCELLATION event (max 10s)...');

    const cancellationReceived = await waitForEvent(
      () => receivedEvents.some(e => e.type === 'ORDER_CANCELLATION'),
      10000
    );

    if (cancellationReceived) {
      results.push({ step: 'Receive CANCELLATION', success: true, message: 'Event received' });
      console.log('✅ CANCELLATION event received via WebSocket');
    } else {
      results.push({ step: 'Receive CANCELLATION', success: false, message: 'Timeout' });
      console.log('⚠️ CANCELLATION event not received (timeout)');
    }

    // ========== Cleanup ==========
    console.log('\n[9] Cleaning up...');
    subscription.unsubscribe();
    realtimeService.disconnect();
    placedOrderId = null; // Already canceled

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    results.push({ step: 'Error', success: false, message: error.message });

    // Try to cancel order if it was placed
    if (placedOrderId && sdk) {
      console.log('\n[Cleanup] Attempting to cancel order...');
      try {
        await sdk.tradingService.cancelOrder(placedOrderId);
        console.log('✅ Order canceled during cleanup');
      } catch (e) {
        console.error('⚠️ Failed to cancel order during cleanup');
      }
    }
  } finally {
    if (realtimeService?.isConnected()) {
      realtimeService.disconnect();
    }
    if (sdk) {
      sdk.stop();
    }
  }

  // ========== Summary ==========
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.step}: ${result.message}`);
  }

  console.log('-'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForEvent(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (condition()) return true;
    await sleep(100);
  }
  return false;
}

main().catch(console.error);
