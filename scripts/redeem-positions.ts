/**
 * Redeem all redeemable positions
 */

import 'dotenv/config';
import { PolymarketSDK, OnchainService } from '../src/index.js';

const POSITIONS_TO_REDEEM = [
  {
    name: 'XRP Down Dec 28 (WON - Down)',
    conditionId: '0x66a38ae47e6a6123c72c36834deafba08d31e5236e4e559c13a68c6e64003662',
  },
  {
    name: 'Bitcoin Up Dec 28 (WON - Up)',
    conditionId: '0xa392726dfa1dfb32c5a52d53b1d368ab2991ae1fc00c78659fbd93c7b01c711f',
  },
  {
    name: 'XRP Up Dec 28 (WON - Up)',
    conditionId: '0x4abd021c8aee7b5b2806e3a7fe9ee063dc47791900c9acbffabcfd62fe931abf',
  },
  {
    name: 'Al Taawoun (LOST - No)',
    conditionId: '0x52f4fa56fd85a9fc4eae008bc676e9587be84dc85318d02db8674b7f75ca7f96',
  },
];

async function main() {
  console.log('='.repeat(60));
  console.log('Redeeming Positions');
  console.log('='.repeat(60));

  const privateKey = process.env.PRIVATE_KEY || process.env.POLY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY not found');
    process.exit(1);
  }

  const sdk = await PolymarketSDK.create({ privateKey });
  const onchain = new OnchainService({ privateKey });

  console.log(`Wallet: ${onchain.getAddress()}`);

  // Check initial balance
  const initialBalance = await onchain.getUsdcBalance();
  console.log(`\nInitial USDC.e: $${parseFloat(initialBalance).toFixed(4)}`);

  console.log('\n[1] Checking and redeeming positions...\n');

  for (const pos of POSITIONS_TO_REDEEM) {
    console.log(`--- ${pos.name} ---`);

    try {
      // Get market info to find token IDs
      const market = await sdk.markets.getMarket(pos.conditionId);
      if (!market) {
        console.log('  Market not found');
        continue;
      }

      const yesToken = market.tokens?.find(t => t.outcome === 'Yes' || t.outcome === 'Up');
      const noToken = market.tokens?.find(t => t.outcome === 'No' || t.outcome === 'Down');

      if (!yesToken?.tokenId || !noToken?.tokenId) {
        console.log('  Token IDs not found');
        continue;
      }

      // Check our balance
      const balance = await onchain.getPositionBalanceByTokenIds(
        pos.conditionId,
        { yesTokenId: yesToken.tokenId, noTokenId: noToken.tokenId }
      );

      const yesBalance = parseFloat(balance.yesBalance);
      const noBalance = parseFloat(balance.noBalance);

      console.log(`  Balance: YES=${yesBalance.toFixed(4)}, NO=${noBalance.toFixed(4)}`);
      console.log(`  Winner: ${yesToken.winner ? 'YES' : noToken.winner ? 'NO' : 'Not resolved'}`);

      if (yesBalance > 0 || noBalance > 0) {
        console.log(`  Redeeming...`);
        try {
          const result = await onchain.redeemByTokenIds(
            pos.conditionId,
            { yesTokenId: yesToken.tokenId, noTokenId: noToken.tokenId }
          );
          console.log(`  ✅ TX: ${result.transactionHash}`);
        } catch (e: any) {
          console.log(`  ❌ Failed: ${e.message}`);
        }
      } else {
        console.log(`  No tokens to redeem`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
    console.log();
  }

  // Check final balance
  console.log('[2] Final balance...');
  const finalBalance = await onchain.getUsdcBalance();
  console.log(`USDC.e: $${parseFloat(finalBalance).toFixed(4)}`);

  const gained = parseFloat(finalBalance) - parseFloat(initialBalance);
  if (gained > 0) {
    console.log(`\n🎉 Gained: $${gained.toFixed(4)}`);
  }

  sdk.stop();
  console.log('\nDone!');
}

main().catch(console.error);
