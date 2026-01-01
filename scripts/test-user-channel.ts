/**
 * Test WebSocket User Channel Subscription
 *
 * 验证 RealtimeServiceV2.subscribeUserEvents() 是否正常工作
 *
 * 运行: pnpm exec tsx scripts/test-user-channel.ts
 *
 * 预期行为:
 * 1. 连接 WebSocket
 * 2. 使用 CLOB credentials 订阅 User Channel
 * 3. 等待并显示任何订单/成交事件
 *
 * 注意: 需要有活跃的订单或成交才能看到事件
 * 可以在另一个终端下单来触发事件
 */

import 'dotenv/config';
import { TradingService, RealtimeServiceV2, RateLimiter, createUnifiedCache } from '../src/index.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Testing WebSocket User Channel Subscription');
  console.log('='.repeat(60));

  const privateKey = process.env.PRIVATE_KEY || process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found in .env');
    process.exit(1);
  }
  console.log(`✅ Private key found: ${privateKey.slice(0, 10)}...`);

  // Create TradingService to get credentials
  const rateLimiter = new RateLimiter();
  const cache = createUnifiedCache();
  const tradingService = new TradingService(rateLimiter, cache, {
    privateKey,
    chainId: 137,
  });

  try {
    // Step 1: Initialize TradingService to derive CLOB credentials
    console.log('\n[1] Initializing TradingService to derive CLOB credentials...');
    await tradingService.initialize();
    const credentials = tradingService.getCredentials();
    if (!credentials) {
      throw new Error('Failed to get CLOB credentials');
    }
    console.log('✅ CLOB credentials derived');
    console.log(`   API Key: ${credentials.key.slice(0, 20)}...`);

    // Step 2: Create RealtimeServiceV2
    console.log('\n[2] Creating RealtimeServiceV2...');
    const realtimeService = new RealtimeServiceV2({
      autoReconnect: true,
      pingInterval: 5000,
      debug: true, // Enable verbose logging
    });

    // Step 3: Connect to WebSocket
    console.log('\n[3] Connecting to WebSocket...');
    realtimeService.connect();

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout (10s)'));
      }, 10000);

      if (realtimeService.isConnected()) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      realtimeService.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });

      realtimeService.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    console.log('✅ WebSocket connected');

    // Step 4: Subscribe to User Channel
    console.log('\n[4] Subscribing to User Channel...');
    console.log('   (Waiting for order/trade events...)');
    console.log('   (Place an order in another terminal to see events)');
    console.log('   (Press Ctrl+C to stop)\n');

    let orderCount = 0;
    let tradeCount = 0;

    const subscription = realtimeService.subscribeUserEvents(
      {
        key: credentials.key,
        secret: credentials.secret,
        passphrase: credentials.passphrase,
      },
      {
        onOrder: (order) => {
          orderCount++;
          console.log('\n📋 ORDER EVENT:');
          console.log(`   Type: ${order.eventType}`);
          console.log(`   Order ID: ${order.orderId.slice(0, 16)}...`);
          console.log(`   Side: ${order.side}`);
          console.log(`   Price: ${order.price}`);
          console.log(`   Size: ${order.matchedSize}/${order.originalSize}`);
          console.log(`   Timestamp: ${new Date(order.timestamp).toISOString()}`);
        },
        onTrade: (trade) => {
          tradeCount++;
          console.log('\n💰 TRADE EVENT:');
          console.log(`   Status: ${trade.status}`);
          console.log(`   Trade ID: ${trade.tradeId.slice(0, 16)}...`);
          console.log(`   Side: ${trade.side}`);
          console.log(`   Price: ${trade.price}`);
          console.log(`   Size: ${trade.size}`);
          console.log(`   Outcome: ${trade.outcome}`);
          if (trade.transactionHash) {
            console.log(`   Tx Hash: ${trade.transactionHash.slice(0, 16)}...`);
          }
          console.log(`   Timestamp: ${new Date(trade.timestamp).toISOString()}`);
        },
        onError: (error) => {
          console.error('\n❌ USER CHANNEL ERROR:', error.message);
        },
      }
    );

    console.log('✅ Subscribed to User Channel');

    // Keep running and show periodic status
    const statusInterval = setInterval(() => {
      console.log(`\n[Status] Orders: ${orderCount}, Trades: ${tradeCount}, Connected: ${realtimeService.isConnected()}`);
    }, 30000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nShutting down...');
      clearInterval(statusInterval);
      subscription.unsubscribe();
      realtimeService.disconnect();

      console.log('\n' + '='.repeat(60));
      console.log('Summary:');
      console.log(`   Order events received: ${orderCount}`);
      console.log(`   Trade events received: ${tradeCount}`);
      console.log('='.repeat(60));

      process.exit(0);
    });

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);
