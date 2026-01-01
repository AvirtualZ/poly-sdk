import { PolymarketSDK } from '../src/index.js';

async function test() {
  const sdk = new PolymarketSDK();

  console.log('Testing SDK getLeaderboard with offset=50...');
  const result = await sdk.smartMoney.getLeaderboard({
    period: 'week',
    limit: 5,
    offset: 50,
    sortBy: 'pnl'
  });

  console.log('First 3 results:');
  result.slice(0, 3).forEach(e => console.log('Rank:', e.rank, 'Address:', e.address.slice(0, 10)));
}

test().catch(console.error);
