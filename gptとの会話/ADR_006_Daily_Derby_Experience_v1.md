# Seven Days Derby

# ADR-006: The Daily Derby Experience

Status: APPROVED FOR CLAUDE CODE\
Purpose: Define the 20:00 live event UI/UX experience.

------------------------------------------------------------------------

## 1. Core Concept

The 20:00 Daily Settlement is not only a backend batch.

It is a daily global live event.

User-facing name:

``` text
THE DAILY DERBY
```

The purpose is to make users feel that the whole world is racing,
settling, matching, and moving together at the same time.

------------------------------------------------------------------------

## 2. Design Philosophy

Do not build a heavy 3D race animation in v1.0.

Instead, create a cinematic live terminal experience.

Inspiration:

-   Bloomberg Terminal
-   F1 Race Control
-   Apple-style minimal motion
-   Web3 global live market ticker

The experience should feel:

-   Premium
-   Fast
-   Global
-   Systemic
-   Exciting
-   Trustworthy

------------------------------------------------------------------------

## 3. Timing

Daily Derby starts at:

``` text
20:00
```

The system should show a countdown before the event.

Example:

``` text
Next Daily Derby

Starts In

04:59
04:58
04:57
```

At 20:00, the page transitions into Live Mode.

------------------------------------------------------------------------

## 4. Live Mode Sequence

At 20:00, the UI should darken and show:

``` text
──────────────────────────────
THE DAILY DERBY
LIVE
──────────────────────────────
```

Then show a step-by-step animated sequence.

------------------------------------------------------------------------

## 5. Sequence Steps

### Step 1: Race Engine Initialization

``` text
🏇 Initializing Race Engine...
✓ Race Engine Ready
```

### Step 2: Participant Snapshots

``` text
📸 Creating Participant Snapshots...
✓ {horse_count} Horses Locked
```

### Step 3: Race Seed Commit

``` text
🎲 Generating Race Seeds...
✓ Race Seeds Committed
```

### Step 4: Race Execution

``` text
🏇 Running Race Engine...
███████████░░░░░░░░░
```

### Step 5: Burn Resolution

``` text
🔥 Resolving Burn Events...
✓ {burn_count} Horses Burned
```

### Step 6: Revenge Buff

``` text
⚡ Revenge Buff Generated
✓ {buff_count} Buffs Created
```

### Step 7: Smart Marketplace

``` text
🤝 Running Smart Marketplace...
✓ {listed_count} Horses Listed
```

### Step 8: Buyer Matching

``` text
💰 Matching Buyers...
✓ {assignment_count} Assignments Completed
```

### Step 9: Day0 Mint Fallback

``` text
🏇 Minting New Horses...
✓ {mint_count} Day0 Horses Minted
```

### Step 10: Settlement

``` text
💰 Posting Ledger Settlement...
✓ Ledger Balanced
```

### Step 11: Completion

``` text
──────────────────────────────

TODAY'S DERBY COMPLETED

──────────────────────────────
```

------------------------------------------------------------------------

## 6. Personal Result Card

After the global live sequence, show the user's personal result.

Example: Survived and sold

``` text
Royal Thunder

✔ Survived

Day 5 → Day 6

✔ Listed

✔ Sold

New Horse Assigned

Golden Storm
```

Example: Burned

``` text
🔥 Royal Thunder was Burned.

⚡ Revenge Buff Ready.
```

Example: Day7

``` text
👑 DAY7 CLEARED

200 USDT Buyback Started.

Memorial NFT will be created after all payments are completed.
```

------------------------------------------------------------------------

## 7. Live Ticker

A global ticker should run during Live Mode.

Example:

``` text
🏇 Royal Thunder → SOLD 177.16 USDT
🔥 Black Storm → BURNED
👑 Golden Wind → DAY7 CLEARED
💰 Buyback Paid 28.57 USDT
⚡ Revenge Buff Generated
```

The ticker should use anonymized or display-safe user data.

Do not show private wallet addresses.

------------------------------------------------------------------------

## 8. Global Feed

Optional v1.0 / recommended v1.1:

``` text
🇺🇸 John — Horse Sold
🇧🇷 Carlos — Reached Day7
🇯🇵 Ken — Burned
🇩🇪 Anna — Legendary Horse Assigned
```

This creates the feeling that the entire global community is active at
the same time.

------------------------------------------------------------------------

## 9. Sound Design

Use minimal sound.

Recommended:

-   soft countdown tick
-   short confirmation sound when settlement completes
-   special gold sound for Day7 Clear
-   subtle burn sound for Burn result

Avoid casino-style sounds.

Avoid excessive effects.

------------------------------------------------------------------------

## 10. Animation Rule

Animation should be simple.

Use:

-   fade
-   glow
-   progress bars
-   ticker movement
-   terminal-style text reveal

Do not implement:

-   full 3D horse race
-   heavy video
-   gambling-style flashing effects
-   slot-machine effects

------------------------------------------------------------------------

## 11. Technical Requirements

The UI should subscribe to Daily Derby status.

Possible source:

``` text
daily_derby_status
batch_run_status
user_result_summary
global_ticker_events
```

The frontend should support these states:

``` text
WAITING
COUNTDOWN
LIVE
PROCESSING
PERSONAL_RESULT
COMPLETED
FAILED_SAFE_MODE
```

------------------------------------------------------------------------

## 12. Failure Mode UI

If Daily Batch fails:

Do not show panic messaging.

Show:

``` text
Daily Derby is under review.

Marketplace remains temporarily locked while settlement verification is completed.
```

Never show:

-   system broken
-   funds lost
-   failed payment
-   panic wording

------------------------------------------------------------------------

## 13. Copy Rules

Use short English.

Preferred phrases:

``` text
The Daily Derby is Live.
Race Engine Running.
Burn Resolution Complete.
Smart Marketplace Matching.
Ledger Balanced.
Today's Derby Completed.
```

Avoid:

``` text
gambling
casino
jackpot
guaranteed profit
risk-free
everyone wins
```

------------------------------------------------------------------------

## 14. Landing Page Copy

Recommended LP phrase:

``` text
One Race.

One World.

Every Day.

20:00.
```

------------------------------------------------------------------------

## 15. Constitution Rule

The 20:00 Daily Settlement SHALL be presented to users as The Daily
Derby.

The Daily Derby SHALL be treated as a global live event, not merely a
backend batch.

The UI SHALL show the progress of Race, Burn, Marketplace Matching,
Ledger Settlement, and Personal Result.

The Daily Derby UI SHALL avoid gambling-style presentation.

The Daily Derby SHALL emphasize global participation, deterministic race
processing, marketplace movement, and settlement completion.

------------------------------------------------------------------------

## 16. Claude Code Implementation Note

Implement this as frontend components first.

Suggested components:

``` text
components/daily-derby/
  DailyDerbyCountdown.tsx
  DailyDerbyLiveTerminal.tsx
  DailyDerbyProgressStep.tsx
  DailyDerbyTicker.tsx
  DailyDerbyPersonalResult.tsx
  DailyDerbyFailureState.tsx
```

Suggested page placement:

``` text
app/stable/page.tsx
app/daily-derby/page.tsx
```

The backend does not need to stream true real-time events in v1.0.

If necessary, the frontend may poll batch status every few seconds.

Use real backend status if available.

If unavailable during early implementation, use mocked events with clear
TODO markers.
