# Witnet randomness on World Chain Sepolia

Validated against current primary sources on 2026-09-01.

## Confirmed

- World lists Witnet Randomness as supported on both World Chain and World Chain Sepolia: https://docs.world.org/world-chain/providers/oracles
- World Chain Sepolia is chain ID `4801` (`0x12c1`) and publishes the Alchemy public RPC: https://docs.world.org/world-chain/quick-start/info
- Witnet documents a paid asynchronous `randomize()` request, status values, block-bound retrieval through `fetchRandomnessAfter`, and a typical fulfillment time of several minutes: https://docs.witnet.io/smart-contracts/guides/solidity-contracts/appliances/witnetrandomness
- Witnet’s current multi-chain randomness address page does not list World Chain or World Chain Sepolia: https://docs.witnet.io/smart-contracts/witnet-randomness-oracle/contract-addresses
- Witnet's official `witnet-solidity-bridge` deployment catalog at commit `3de82c7d201abfdf06ae2e1a2c97a38ab1819ed9` pins `worldchain:sepolia` to chain ID `4801`, but records `WitRandomnessV2` as the zero address and provides no `WitRandomnessV3` deployment: https://github.com/witnet/witnet-solidity-bridge/blob/3de82c7d201abfdf06ae2e1a2c97a38ab1819ed9/migrations/addresses.json

## Implemented boundary

- The network and chain ID are pinned to World Chain Sepolia.
- A zero, malformed, non-HTTPS, wrong-chain, or no-bytecode configuration fails closed.
- The durable request identity binds chain ID, request block, and transaction hash.
- Fulfillment reads the exact configured contract, checks its reported status, obtains the seed for the stored request block, and persists a chain-qualified proof reference.
- Supabase binds provider, network, request ID, transaction hash, request block, seed, and proof reference. Replays and substitutions fail.
- Verify Draw accepts production randomness only when coordinator metadata records an externally verified Witnet proof on World Chain Sepolia.

## External boundary

No non-zero official randomness deployment, transaction, seed, or successful live integration is available to claim. Live operation remains blocked until Witnet publishes a current World Chain Sepolia randomness address through a primary/provider channel, bytecode is inspected, and a funded signer with a durable pre-broadcast transaction journal is configured and independently reviewed.
