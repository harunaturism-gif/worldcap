# ADR: World App Only

**Date**: 2026-08-31
**Status**: Accepted

## Context
Previous iterations of WorldCAP explored multiple interaction modes, including standalone web compatibility, alternative authentication paths, and separate web portals for non-World App users.

## Decision
WorldCAP is exclusively a **World App Mini App** operating on **World Chain**.

1. **World App-only**: Production distribution is exclusively through World App.
2. **World Chain-only**: World Chain is the production chain.
3. **WLD-native**: The economy is WLD-native.
4. **MiniKit**: MiniKit and the World App wallet remain the production interaction layer.
5. **No standalone consumer payment rail**: No separate consumer payment rail is planned. A standard browser must never synthesize a transaction or silently switch to a fake rail.
6. **Public verification**: Public verification artifacts (such as Draw Explorer and Verify Draw) may remain browser-readable without becoming a separate product or fallback product strategy.

## Consequences
- We will no longer maintain or test standalone web application flows for consumer interaction.
- Development focus is narrowed to MiniKit integration.
- Stale documentation regarding standalone web strategies has been removed.
