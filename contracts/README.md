# DrawCommitmentRegistry

This is a minimal non-custodial, append-only World Chain Sepolia foundation. It stores one commitment per draw and emits `DrawAnchored`. It has no payable function, WLD custody, winner input, overwrite, withdrawal, or settlement behavior.

```powershell
forge test --root contracts
$env:WORLD_CHAIN_SEPOLIA_RPC_URL='https://...'
$env:DEPLOYER_PRIVATE_KEY='0x...'
$env:ANCHOR_AUTHORITY='0x...'
.\contracts\script\deploy.ps1
```

Run deployment only from a secure operator environment. This repository contains no private key and claims no deployed address.
