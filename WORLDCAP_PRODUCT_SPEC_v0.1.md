# WorldCAP — MVP Product Specification
Version: 0.1
Date: 2026-08-31
Status: Living source of truth

## Product thesis

WorldCAP is exclusively a World App Mini App built around persistent digital prize titles.

Production distribution is World App-only. World Chain is the only production chain, WLD is the only user-facing currency, and MiniKit / the World App wallet are the production interaction layer. There is no standalone consumer WorldCAP product, alternate wallet rail, browser payment fallback, or alternate-chain strategy. Privacy-safe public verification artifacts may remain browser-readable without becoming a separate product.

Core roles:
- WLD = user-facing currency.
- World ID = proof that the account belongs to a real human.
- World Chain = settlement, contracts and public auditability.
- Social = engagement, winners, discovery and distribution.
- TITLE = the primary utility and collectible product object.

Core brand principle:

> Do not ask users to trust WorldCAP. Let them verify WorldCAP.

Fairness must be part of the interface, not buried in documentation.

## Core loop

World ID → Home → Choose Title Tier → Buy in WLD → My Titles → Scratch → Prize Result → Title remains draw-eligible → Social activity → Draw → Payout → Archive/Collection → Renewal for same month next year.

Future extension:
Buy → Scratch → Collect → Gift → Draw → Renew.

## Title economy

Users may own multiple titles. World ID proves humanity but does not impose one-title-per-human.

Every title should have:
- immutable ID and readable serial
- campaign
- tier
- original buyer
- current owner
- purchase reference
- issuance timestamp
- scratch state/result
- draw eligibility
- lifecycle state
- renewal state
- provenance/history capability

Never model the whole title with a single `used` flag.

## Title tiers

### Accessible
- extremely low entry price, potentially a small fraction of 1 WLD
- mass-access product
- smaller prize economics
- still attractive, animated and collectible
- must never feel like the "poor title"

### Purple
- mid-tier
- premium purple identity
- richer scratch presentation
- configurable prize/draw access

### Gold
- premium tier
- higher configurable price
- premium animation/status
- may later access premium/tier-specific draws

Architecture must also support future Limited/Special editions without redesign.

Prices and prize tables are campaign-configurable. Do not hardcode final economics.

## Visual identity

A title should be immediately recognizable in Home, purchase, My Titles, scratch, archive and feed.

Use one shared title/scratch engine with tier-specific skin/config. Avoid heavy mobile-unfriendly effects.

## Title lifecycle

Suggested independent states:

Lifecycle:
ACTIVE → DRAW_PERIOD_COMPLETE → ARCHIVED → ELIGIBLE_FOR_RENEWAL

Scratch:
UNSCRATCHED → REVEALED

Draw:
ELIGIBLE → DRAW_COMPLETED

Renewal:
NOT_ELIGIBLE → ELIGIBLE → REDEEMED → EXPIRED

A scratched title can remain ACTIVE and DRAW-ELIGIBLE.

Historical titles remain in the user's collection.

## Renewal / rollover utility

Core rule:

January 2027 Title → after campaign → remains owned → can provide renewal credit/value toward January 2028.

Same month, following year:
JAN 2027 → JAN 2028
AUG 2027 → AUG 2028

Possible internal names:
- Renewal Credit
- Rollover Credit

Archived UI should make the retained utility explicit.

Example:
Gold Title — January 2027
Draws completed
Eligible for January 2028
Renewal credit: X WLD-equivalent

MVP/testnet may simulate renewal settlement, but model/state must exist.

## Transferability

Do not implement a marketplace now, but ownership must not assume buyer == current owner forever.

Keep:
- original_buyer_id
- current_owner_id
- immutable provenance

Future ownership events:
ISSUED, GIFTED, TRANSFERRED, MARKET_SALE, RENEWED.

Only ISSUED needs to operate now.

Gifting to another verified human is likely a better first transfer feature than a marketplace.

## Treasury model

Initial allocation of gross title sales:
- 60% Monthly Prize Allocation
- 10% Annual Jackpot
- 20% Platform / Operations
- 10% Commercial / Growth

Example for 1,000,000 WLD volume:
- 600,000 WLD monthly prizes
- 100,000 WLD annual jackpot
- 200,000 WLD platform treasury
- 100,000 WLD growth treasury

The 20% platform share is company gross revenue, not automatic founder personal income.

## Treasury separation

Prize Vaults:
- economically committed to participants
- administrator cannot repurpose them
- only prize rules/contracts may release funds

Platform Treasury:
- operations
- development
- audits
- legal/compliance
- reserves
- suppliers
- distributable profit

Growth Treasury:
- partnerships
- affiliates
- campaigns
- acquisition/marketing

Core rule:

> Once allocated to prizes, WLD can only leave the Prize Vault according to predefined prize rules.

## Automatic routing

Target production purchase flow:

10 WLD purchase
→ Allocation Router
→ 6 WLD Monthly Prize Vault
→ 1 WLD Annual Jackpot Vault
→ 2 WLD Platform Treasury
→ 1 WLD Growth Treasury

Goal: minimal manual intervention.

## Prize funding

Core principle:

> No prize should be promised unless sufficient WLD is already reserved to pay it.

Do not require huge founder capital by promising unfunded jackpots.

A Founders Season can start with prize pools at zero and grow visibly with sales.

Prize-pool growth itself becomes product content.

## Scratch card

Scratch is a CORE PRODUCT FEATURE.

Requirements:
- actual scratch/reveal gesture
- satisfying animation
- result hidden before reveal
- result persists
- refresh cannot reroll
- cannot scratch twice
- scratching does not consume draw eligibility
- significant result may create social activity
- title remains owned after scratch

Animation is only the reveal. Long-term, WorldCAP must not be able to change the underlying result after commitment/generation.

## Scratch economics

Inside the 60% monthly prize allocation, future campaign config may split:
- scratch budget
- periodic draws
- monthly final draw
- reserve/rollover

Exact percentages remain open.

Total scratch liability + draw liability must never exceed funded prize allocation.

Prize odds/tables belong in campaign configuration, not scattered frontend code.

## Randomness abstraction

Use a shared `RandomnessProvider`.

Examples:
- LocalRandomnessProvider
- FutureVerifiableRandomnessProvider

MVP:
- local/server simulation acceptable
- result persisted
- no reroll
- no client-authoritative prize manipulation

Production:
- public/verifiable randomness
- independently reproducible result
- no admin discretion

## Draw fairness / isonomy

Draws select eligible TITLES, not people.

If 160,000 titles are eligible:
- each title = 1 / 160,000
- user with 10 titles = 10 / 160,000

Published rules define eligibility before closure.

Do not secretly weight premium titles inside a supposedly equal draw.

Prefer explicit tier-specific draws.

Example:
Accessible:
- Global Monthly Draw
- Annual Jackpot

Purple:
- Global Monthly Draw
- Annual Jackpot
- Purple Exclusive Draw

Gold:
- Global Monthly Draw
- Annual Jackpot
- Gold Exclusive Draw

## Draw lifecycle

Target production process:

1. draw closes at predetermined time/block
2. eligible title set freezes
3. verifiable randomness is requested
4. randomness is returned publicly
5. published deterministic function maps randomness to winning title/index
6. winner is determined
7. prize pays automatically
8. result/payout are recorded on-chain
9. anyone can verify later

There must be no admin "choose winner" function.

## Randomness security

Production winner selection must not rely on:
- Math.random()
- client state
- founder-generated seeds
- simple timestamps
- naive blockhash-only logic

Use an independent/public/verifiable randomness provider compatible with World Chain.

## Odds transparency

Where mathematically meaningful, show current odds.

Example:
Eligible titles: 90,000
Your titles: 5
Current chance: 5 / 90,000

At closure:
FINAL ODDS: 5 / 143,821

## Automatic prize payouts

Long-term target:

Result → contract validates entitlement → Prize Vault pays winner wallet → marks paid → emits event → updates feed/history.

No founder approval for ordinary payouts.

Scratch, monthly draws and annual jackpot should eventually settle automatically.

## Founder/Admin Dashboard

Future private dashboard should show:
- Gross Title Volume
- titles by tier
- Monthly Prize Vault
- Annual Jackpot
- Platform Treasury
- Growth Treasury
- liabilities
- payouts
- campaigns
- draw status
- treasury movement
- reserves

Prize balances must be visibly locked.

Admin actions belong to Platform/Growth Treasury, not prize appropriation.

## Treasury security

Production treasury should preferably use multisig rather than one founder key.

Potential:
- 2-of-3 treasury multisig
- separate recovery/security key
- limited operational wallet

## Wallet

WorldCAP should feel WLD-native.

Wallet UI can show:
- connected World wallet
- WLD balance
- verified purchases
- app transaction history
- prize payouts
- simulated/pending prize values during MVP
- future swap integration

Do not create a custom WorldCAP token for MVP.

Simulated prizes must never look like spendable real WLD.

## WLD volatility

User-facing values may be in WLD, but business accounting should also record fiat-equivalent value at transaction time where useful.

Final pricing policy remains open:
- fixed WLD
- or WLD equivalent of target economic value

## Social layer

Useful events:
- human bought titles
- scratch win
- significant winner
- jackpot milestone
- monthly winner
- campaign launch
- collection/status event

Potential profile data:
- verified-human badge
- collection
- wins
- badges
- streaks
- followers

Never expose exact wallet balances/private financial information by default.

## Engagement philosophy

High-frequency engagement can include:
- daily rewards
- streaks
- free interactions
- social feed
- jackpot progress
- title collection
- scratch reveal
- quests
- referrals
- winner stories

Do not make the only loop:
pay → lose → pay again.

Preferred loop:
enter → social/progress → free engagement → monitor titles → scratch → draw → share → collect → renew → return.

## Fairness as product identity

Core messages:

TRANSPARENT
See where every WLD goes.

PROVABLY FAIR
Rules and results can be independently verified.

FULLY FUNDED
Prize obligations are backed by reserved prize funds.

Avoid absolute claim:
"This system can never be corrupted."

Prefer:
"WorldCAP is designed so neither the company nor an administrator can choose or alter a winner after a draw closes."

And:
"Every draw result can be independently reproduced from public data."

## In-app Fairness presentation

Home should expose a clear CTA:

"How do we guarantee a fair draw?"

Popup/onboarding should explain:
1. title enters a closed eligible set
2. after closure, entries cannot be secretly modified
3. randomness comes from a public/verifiable source
4. winner mapping algorithm is open/published
5. admins cannot choose winners
6. prize funds are segregated
7. payout/result can be verified on-chain

Advanced actions:
- View code
- View contract
- View past draws
- Verify result
- View randomness proof

## Verify Draw / Draw Explorer

Future app/site screen:

August Draw #8
Eligible Titles: 183,421
Randomness Source: [provider]
Random Seed: 0x...
Winning Index: 72,911
Winning Title: PURPLE-AUG-072911
Prize: 8,500 WLD
Payment: Paid

Button:
VERIFY DRAW

App independently recomputes result and shows confirmation.

## Scratch transparency

Before reveal:
"WorldCAP cannot manually change your result."

After reveal:
"Verify this result."

Long-term, scratch outcome should be generated/committed independently of the visual scratch gesture.

## Open source

Core fairness logic should be public where feasible:
- draw selection algorithm
- randomness consumption
- prize vault rules
- allocation rules
- payout contracts
- verification tools

Normal users should understand fairness from the app; GitHub/contracts are the technical verification layer.

## Future public website

Potential sections:
- Live Prize Vaults
- Current Jackpot
- Draw Explorer
- Open-source contracts
- Randomness proofs
- Treasury allocation
- Audits
- Protocol rules
- Historical payouts
- Campaigns
- Fairness documentation

## Preferred MVP navigation

Home
Titles
Play
Social
Wallet

Home:
- campaign hero
- title tiers
- jackpot
- prize pool
- fairness CTA

Titles:
- active titles
- tier
- eligibility
- scratch state
- archive/collection
- renewal

Play:
- scratch
- draws
- results

Social:
- activity
- winners
- milestones

Wallet:
- WLD activity
- purchases
- payouts
- history
- real vs simulated distinction

## Domain separation

Identity:
users, World ID, sessions

Finance:
wallets, purchases, ledger, liabilities, treasuries, claims

Game:
campaigns, title tiers, titles, ownership, scratch, draws, renewal

Social:
profiles, posts, follows, reactions, activity

## Suggested data model

users
world_identities
wallets

campaigns
title_tiers
titles
title_ownership
title_ownership_events

purchase_intents
purchases
ledger_entries

prize_vaults
prize_liabilities
prize_claims

scratch_configs
scratch_games
scratch_results

draws
draw_entries
draw_results

title_renewal_rules
title_renewals

posts
follows
reactions

## Real WLD purchase integrity

Client:
1. request unique purchase intent
2. invoke MiniKit/World payment
3. submit payment identifier

Backend:
4. validate authenticated session
5. independently verify payment
6. verify recipient
7. verify amount/asset
8. verify reference
9. verify final/successful state
10. prevent payment reuse
11. atomically issue titles + ownership + ledger

Never trust client-reported payment success alone.

## Atomicity/idempotency

One verified payment must produce exactly one logical purchase.

verified payment
+ purchase
+ exact title issuance
+ ownership
+ ledger allocation
= one atomic operation

Protect against callbacks, refreshes, retries, replay and concurrency.

## Accounting

Use integer token/base units / BigInt-safe logic.

Never use floating-point arithmetic for WLD accounting.

This is mandatory because Accessible Titles may cost only fractions of 1 WLD.

## Regulatory architecture

Architect for jurisdiction-aware behavior.

Potentially global:
- identity
- profile
- social
- collection
- informational wallet UI

Feature-gated:
- real-money title purchase
- monetary scratch
- monetary draws
- payout

Use geofencing/feature flags and market-specific compliance where needed.

World Chain does not remove local legal obligations.

## MVP non-goals

Do not implement yet:
- mainnet
- custom token
- staking
- DAO
- NFT marketplace
- speculative title pricing
- complex secondary market
- real renewal settlement
- production jackpot before audits
- gambling/regulatory bypasses
- large admin system

## Constitutional product principles

1. Prize Segregation — once allocated to prizes, admins cannot repurpose funds.
2. Automatic Payouts — ordinary prizes should not depend on founder approval.
3. Verifiable Fairness — published rules + public randomness + deterministic selection.
4. No Winner Selection — admins cannot choose or change winners.
5. Fully Funded Promises — do not promise prizes that are not backed.
6. Title Permanence — titles keep history and can retain utility after the campaign.
7. Human Identity, Not One-Entry Limit — World ID proves humanity; users may own multiple titles.
8. Transparent Economics — users can understand where WLD goes.
9. Mobile-First Delight — titles and scratch should feel beautiful and playful.
10. Open Verification — core fairness mechanisms should be independently inspectable.

## Internal product statement

> WorldCAP is a World-native title economy where verified humans buy collectible prize titles in WLD, reveal instant outcomes, participate in transparent draws, retain renewal utility, and can independently verify that prize funds, randomness, winners and payouts follow published rules.

## Roadmap

Phase 1 — Local MVP
- World ID
- titles
- scratch
- wallet
- social
- simulated WLD economy

Phase 2 — Testnet-ready economic vertical
- verified WLD payment
- persistent Supabase source of truth
- atomic title issuance
- ledger
- title tiers
- renewal
- scratch persistence
- real/simulated separation

Phase 3 — Trust infrastructure
- audited Allocation Router
- Prize Vaults
- verifiable randomness
- frozen draw snapshots
- automated testnet draw resolution
- automated testnet payouts

Phase 4 — Transparency product
- in-app Fairness explainer
- Draw Explorer
- Verify Draw
- public vaults
- open-source verification
- historical payout explorer

Phase 5 — Production/legal
- audits
- launch-market legal strategy
- geofencing/compliance
- treasury multisig
- observability
- incident procedures
- mainnet only after gates pass

Future:
- gifting
- transferability
- marketplace if justified
- special titles
- partnerships
- public site

## Open decisions

Keep configurable until tested:
- final product/brand name
- final tier names
- prices
- 60% prize sub-allocation
- scratch prize tables/odds
- annual jackpot eligibility
- renewal credit value
- renewal value by tier
- final randomness provider
- vault architecture
- tier-exclusive draw rules
- gifting timing
- transfer policy
- first legal launch markets
- fixed-WLD vs fiat-indexed pricing
