# CAP Token Contract V1

## Contract Architecture
The CAP token is an ERC-20 compliant utility and identity token for the WorldCAP ecosystem on World Chain. It is designed to be simple, strictly capped, and auditable.

The core implementation (`CAPToken.sol`) inherits from established OpenZeppelin primitives:
- `ERC20`: Standard ERC-20 implementation.
- `ERC20Capped`: Ensures the total supply can never exceed a strictly enforced maximum cap.
- `ERC20Burnable`: Allows token holders to burn their own tokens.
- `AccessControl`: Provides a robust, role-based permission system for minting, pausing, and administration.
- `Pausable`: Provides an emergency pause mechanism to halt transfers if absolutely necessary.

A complementary vesting primitive (`CAPVesting.sol`) is provided, utilizing OpenZeppelin's `VestingWallet` to support future time-locked distributions (team, treasury, ecosystem).

**Upgradeability:** The token contract is explicitly **not upgradeable** (no proxy pattern). This simplifies the trust model, removes the risk of malicious upgrades, and is suitable for an immutable utility token. The vesting contract is also non-upgradeable.

## Trust Boundaries
- **Immutable Constraints:** The maximum supply is set permanently at deployment and cannot be altered by any role. The `ERC20Capped` logic guarantees this mathematically.
- **Roles:**
  - `DEFAULT_ADMIN_ROLE`: Can grant and revoke roles. Must be securely held (e.g., via a multi-sig or timelock contract) because it can effectively reassign all powers.
  - `MINTER_ROLE`: Authorized to mint new tokens up to the maximum supply cap. Can be safely revoked or reassigned if the minting authority (e.g., a distribution contract) needs to be upgraded or disabled.
  - `PAUSER_ROLE`: Authorized to pause and unpause all token transfers. This role should be tightly controlled and eventually revoked once the system stabilizes, ensuring long-term censorship resistance.
- **No Escaping the Cap:** The minting boundary guarantees that no authority, not even the admin, can mint beyond the configured `cap`.

## Roles
1. **Admin (`DEFAULT_ADMIN_ROLE`)**: Manages the assignment of `MINTER_ROLE` and `PAUSER_ROLE`. Cannot mint or pause directly unless explicitly granted those roles.
2. **Minter (`MINTER_ROLE`)**: Specifically authorized to execute the `mint` function.
3. **Pauser (`PAUSER_ROLE`)**: Specifically authorized to execute the `pause` and `unpause` functions.

## Cap Behavior
- Defined once during deployment.
- Hardcoded restriction within the `_update` function inherited from `ERC20Capped`.
- Any attempt to mint tokens that would cause `totalSupply` to exceed `cap` will revert immediately with `ERC20ExceededCap`.

## Burn Behavior
- Token holders can voluntarily burn their own tokens via `burn(amount)`.
- Approved spenders can burn tokens from an owner's account via `burnFrom(account, amount)`.
- Burning reduces both the specific account balance and the `totalSupply`.
- Because the cap is static, burning permanently reduces the potential maximum circulating supply. No "minting back" burned tokens is allowed unless it fits within the static cap.

## Pause Behavior
- In the event of a critical vulnerability, the `PAUSER_ROLE` can invoke `pause()`.
- While paused, all token transfers, minting, and burning are halted.
- The `PAUSER_ROLE` can invoke `unpause()` to resume operations.
- The Admin should be prepared to revoke the `PAUSER_ROLE` entirely to establish a truly trustless state once the token is considered mature and risk-free. No admin can confiscate or seize balances.

## Deployment Parameters Still Unresolved
The following values are currently undefined and must be supplied during the production deployment:
- **`MAX_SUPPLY`**: The immutable total maximum supply (in wei).
- **`admin` address**: The initial holder of `DEFAULT_ADMIN_ROLE`.
- **`minter` address**: The initial holder of `MINTER_ROLE`.
- **`pauser` address**: The initial holder of `PAUSER_ROLE`.
- **Vesting Schedules**: The specific start times, durations, and beneficiaries for team, treasury, or ecosystem vesting wallets.

## Exact Production Decisions Still Required
Before deploying to mainnet, the following economic and governance decisions must be frozen:
- The exact total supply cap.
- The allocation percentages (Team %, Treasury %, Human Claim %, Liquidity %, etc.).
- Vesting durations and cliff periods for respective allocations.
- The exact multi-sig or DAO governance contracts that will hold the Admin, Minter, and Pauser roles.
- Whether the `PAUSER_ROLE` will be permanently discarded after an initial safe period.

## Simulated Beta CAP vs Real On-Chain CAP
Currently, WorldCAP uses a simulated database-only CAP token (`cap_accounts` in Supabase) for beta testing and the Human Claim vertical.
- **Do NOT connect** the current database balances to this real ERC-20 contract yet.
- The beta simulation remains entirely separate.
- A future, deliberate migration or integration step will map the simulated claims to actual on-chain mints using the `MINTER_ROLE`. The foundation provided here allows that future authority to mint safely without exceeding the final agreed-upon supply.
