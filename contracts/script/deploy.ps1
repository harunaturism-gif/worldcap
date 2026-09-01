param([string]$Authority)
$ErrorActionPreference = 'Stop'
if (-not $Authority -or $Authority -notmatch '^0x[0-9a-fA-F]{40}$') { throw 'Pass a valid anchor authority address with -Authority.' }
if (-not $env:WORLD_CHAIN_SEPOLIA_RPC_URL) { throw 'WORLD_CHAIN_SEPOLIA_RPC_URL is required.' }
if (-not $env:DEPLOYER_PRIVATE_KEY) { throw 'DEPLOYER_PRIVATE_KEY is required and must never be committed.' }
$chainId = cast chain-id --rpc-url $env:WORLD_CHAIN_SEPOLIA_RPC_URL
if ($chainId -ne '4801') { throw "Refusing deployment: expected World Chain Sepolia chain ID 4801, received $chainId." }
forge create src/DrawCommitmentRegistry.sol:DrawCommitmentRegistry --root . --rpc-url $env:WORLD_CHAIN_SEPOLIA_RPC_URL --private-key $env:DEPLOYER_PRIVATE_KEY --constructor-args $Authority
