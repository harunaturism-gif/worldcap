# Economics, five-winner monthly draw and quarterly jackpot v1

Status: implemented for closed technical beta on `feat/economics-five-winner-quarterly-v1`.

This implementation follows `docs/adr-cap-economy-v1.md` and `docs/product-economics-v0.2.md`. It supersedes the legacy 60/10/20/10 and annual-only direction for newly created purchase intents and draws. Historical rows remain readable and retain their economic-model marker.

## Title-sale allocation

New purchases are marked `worldcap-40-38-10-10-2-v1` and allocate integer WLD base units as:

- 40% CAP Redemption Program
- 38% Monthly Prize Pool
- 10% Quarterly Jackpot
- 10% Company Treasury
- 2% Platform / Operations

The final bucket receives any indivisible integer remainder, so allocations always equal gross sale units exactly. The CAP Redemption Program bucket is segregated accounting, not a WLD refund promise and not evidence of on-chain custody.

## Monthly result

A monthly draw fails closed unless its frozen manifest contains at least five eligible Titles. The v2 algorithm derives five ordered indices with deterministic partial Fisher–Yates sampling and unbiased rejection sampling. A Title cannot win twice in the same draw.

The frozen monthly pool is split 55/25/10/6/4. Positions 1–4 use integer floor division; position 5 receives the exact remaining base units. `draw_winners` stores immutable ordinal, index, Title, private owner snapshot, payout basis points and simulated payout units. The compatibility fields on `draws` mirror winner #1 only.

Verify Draw and Verify Draw V2 recompute the complete ordered set and payout amounts. Public artifact v3 commits to draw kind and prize-pool units as well as the eligibility manifest. Owner identifiers are never published.

## Quarterly jackpot

New major-event draws use `quarterly`; `annual` remains accepted only for historical rows. Quarterly draws use the same frozen-manifest and verifiable-randomness pipeline, with explicit scope and one deterministic winner in this version.

## CAP redemption

Title CAP starts `locked`. Resolution of the relevant monthly draw moves entitlements for every Title in that frozen manifest to `available`; winning is not required. Quarterly or historical draw resolution does not unlock it.

Claiming is service-role-only and idempotent. It credits simulated CAP accounting once and moves the entitlement to `claimed`. It does not change Title ownership, collection state or `draw_eligible`, so quarterly eligibility survives redemption.

## Beta boundary

Draw prize liabilities and CAP balances remain simulated and non-spendable. No real WLD custody, payout, CAP contract transfer or mainnet operation is authorized by this implementation.
