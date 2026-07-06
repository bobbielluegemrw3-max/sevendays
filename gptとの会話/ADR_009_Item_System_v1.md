# ADR-009: Item System v1.0

Status: APPROVED FOR CLAUDE CODE

## Overview

The Item System consists of two categories:

1.  Revenge Buff

-   Generated only when a horse is burned
-   Not purchasable
-   Not tradable
-   Not transferable
-   Automatically applied
-   Valid for exactly one race
-   One ACTIVE buff per user

Buff Values: - N = +4 final_score - R = +7 final_score - SR = +10
final_score

2.  Training Items Purchasable anytime.

Items: - Speed Feed - Power Feed - Recovery Feed - Lucky Charm

Suggested Prices: - Speed Feed: 2 USDT - Power Feed: 2 USDT - Recovery
Feed: 2 USDT - Lucky Charm: 3 USDT

Effects: - Speed Feed: +1 SPEED_TRAINING - Power Feed: +1
POWER_TRAINING - Recovery Feed: +1 RECOVERY_TRAINING - Lucky Charm:
improves deterministic random modifier slightly for one race.

Rules: - Purchase anytime. - Apply before Race Participant Snapshot. -
One Training Item per horse per race. - Items never permanently increase
ability. - Items never guarantee survival. - Items never modify Burn
Target or race_seed. - All purchases go through Ledger.

Revenue Allocation: - 60% Operating Reserve - 20% Community Growth
Pool - 20% Emergency Reserve

Recommended Tables: - item_catalog - user_items - item_usage_history

Constitution: - Revenge Buff is a Burn Recovery mechanism. - Training
Items are strategic modifiers only. - One item per horse per race. - No
Pay-to-Win.
