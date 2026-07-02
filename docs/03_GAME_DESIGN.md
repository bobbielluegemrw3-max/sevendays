# 03 Game Design

## Core Loop

```text
Purchase Session
Assignment
Daily Training
20:00 Daily Race Batch
Race
Burn or Survive
Revenge Buff / MLM / Day Progression / Buyback
Repeat
```

## Horse Lifecycle

```text
Day0 Mint
Race
Survive -> Day1
Race
Survive -> Day2
...
Day6
Race
Survive -> Day7 Clear
Buyback Schedule
Buyback Completed
Memorial NFT
```

Assignment, purchase, AI Profit Taking, ownership transfer, and settlement SHALL NOT increment `current_day`. Horse `current_day` increments only after daily race survival.

If a horse is burned, `current_day` does not increment.

If `current_day` reaches Day7 after survival:

- horse.status = `DAY7_CLEARED`
- horse exits P2P circulation
- Buyback Schedule is created
- horse cannot be assigned again

## Horse Generation v1.0

Horse Generation is deterministic. Horse Type, Rarity, DNA, and Ability SHALL be generated only from the committed `mint_seed` and `horse_generation_version`.

AI, Admin, and User SHALL NOT reroll or modify Horse Generation results. The same mint_seed, horse_uuid, and horse_generation_version SHALL always generate the same horse. Horse Generation records are immutable.

Horse Type probability:

| Type | Probability |
|---|---:|
| SPRINTER | 20% |
| POWER | 20% |
| BALANCED | 20% |
| ENDURANCE | 20% |
| LUCK | 20% |

Rarity probability:

| Rarity | Probability |
|---|---:|
| COMMON | 50% |
| UNCOMMON | 25% |
| RARE | 15% |
| EPIC | 8% |
| LEGENDARY | 2% |

Horse Type and Rarity are independent deterministic draws. No rarity implies a specific type.

Abilities:

- speed
- power
- stamina
- recovery
- luck

Each ability is generated deterministically:

```text
SHA-256(mint_seed + horse_uuid + ability_name + horse_generation_version)
```

Ability distribution uses a deterministic normal distribution, then clamps to the allowed range:

```text
mean = 75.00
standard_deviation = 10.00
min = 50.00
max = 100.00
```

This creates mostly average horses, rare excellent horses, and rare weak horses.

Base ability score:

```text
base_ability_score =
  speed    * 0.25
+ power    * 0.25
+ stamina  * 0.20
+ recovery * 0.15
+ luck     * 0.15
```

DNA:

```text
dna_hash = SHA-256(mint_seed + horse_uuid + user_uuid + horse_generation_version)
dna_modifier = deterministic value from dna_hash, range -2.00 to +2.00
```

Day0 Mint uses Commit-Reveal for `mint_seed`:

```text
mint_seed -> mint_seed_hash -> Horse Generation -> reveal
```

Stored generation fields:

- mint_seed_hash
- horse_generation_version
- horse_type
- rarity
- ability_json
- dna_hash
- dna_modifier

## Race Engine

Race Engine is deterministic, versioned, replayable, auditable, and immutable.

Inputs include:

- race seed
- race engine version
- immutable participant snapshot
- horse type
- rarity
- DNA hash
- ability snapshot
- training snapshot
- revenge buff snapshot
- weather
- track
- liquidity policy version
- horse generation version

Race score uses layered calculation:

```text
Ability Layer
Environment Layer
Buff Layer
Random Layer
```

Formula:

```text
final_score =
  ability_score
+ dna_modifier
+ training_modifier
+ weather_modifier
+ track_modifier
+ condition_modifier
+ fatigue_modifier
+ revenge_buff_modifier
+ random_modifier
```

Race Engine v1.0 SHALL calculate `final_score` using this additive modifier formula:

```text
final_score =
  base_ability_score
+ horse_type_modifier
+ rarity_modifier
+ dna_modifier
+ training_modifier
+ weather_modifier
+ track_modifier
+ condition_modifier
+ fatigue_modifier
+ revenge_buff_modifier
+ random_modifier
```

Modifier ranges v1.0:

| Modifier | Range / Value |
|---|---:|
| base_ability_score | 50.00 to 100.00 |
| horse_type_modifier | -3.00 to +3.00 |
| rarity COMMON | +0 |
| rarity UNCOMMON | +1 |
| rarity RARE | +2 |
| rarity EPIC | +3 |
| rarity LEGENDARY | +4 |
| dna_modifier | -2.00 to +2.00 |
| training_modifier | 0.00 to +5.00 |
| weather_modifier | -2.00 to +2.00 |
| track_modifier | -2.00 to +2.00 |
| condition_modifier | -3.00 to +3.00 |
| fatigue_modifier | -5.00 to 0.00 |
| revenge_buff none | 0 |
| revenge_buff N | +4 |
| revenge_buff R | +7 |
| revenge_buff SR | +10 |
| random_modifier | -3.00 to +3.00 |

`random_modifier` is generated deterministically:

```text
deterministic_random(race_seed, horse_uuid, race_engine_version)
```

If LUCK Type receives effective LUCK training, `random_modifier` range changes from -3.00/+3.00 to -2.00/+4.00 for that race only. This remains deterministic and replayable.

The same snapshot, race_seed, and race_engine_version SHALL always produce the same final_score, ranking, and Burn result. AI, Admin, or manual processes SHALL NOT modify Race Engine inputs after snapshot creation.

## Daily Training v1.0

Daily Training is a one-race strategic modifier. It does not permanently increase horse abilities.

Training types:

- SPEED_TRAINING
- POWER_TRAINING
- RECOVERY_TRAINING

Core rules:

- one horse has at most one training per effective_race_date
- training is valid only before Race Participant Snapshot
- training after snapshot applies to a future race
- training affects only one race
- training does not permanently increase ability

Modifier rules:

```text
SPEED_TRAINING:
  if horse_type = SPRINTER: training_modifier = +5.00
  else: training_modifier = +3.00

POWER_TRAINING:
  if horse_type = POWER: training_modifier = +5.00
  else: training_modifier = +3.00

RECOVERY_TRAINING:
  training_modifier = +4.00
  fatigue_modifier bonus = +1.00
  total effective max = +5.00

BALANCED:
  any training = +4.00

ENDURANCE:
  RECOVERY_TRAINING = +5.00
  other training = +3.00

LUCK:
  LUCK training changes random_modifier range from -3.00/+3.00 to -2.00/+4.00

No Training:
  training_modifier = 0
```

Race Replay uses `race_participant_snapshots.training_snapshot_json`. It must not read current mutable `training_sessions`.

Forbidden:

- training after snapshot affecting same Race
- multiple trainings for same horse/race
- permanent ability increase
- manual training edit after snapshot
- admin training edit after snapshot
- AI training edit

## Race Seed

v1.0 uses Server Commit-Reveal.

1. Server generates cryptographically secure `race_seed`.
2. Server stores `seed_hash = SHA-256(race_seed)` before race execution.
3. Race cannot start unless seed hash is committed.
4. Race completes.
5. `race_seed` is revealed.
6. Replay verifies `SHA-256(race_seed) == seed_hash`.

Each race has exactly one independent seed. Replay is per `race_id`.

## Participant Snapshot

At the start of the daily race batch, the system creates an immutable participant snapshot for each race. Race Engine SHALL use only this snapshot.

Snapshot includes:

- race_id
- horse_id
- owner_user_id_at_snapshot
- horse_status_at_snapshot
- current_day_at_snapshot
- horse_type
- rarity
- dna_hash
- ability_snapshot
- training_snapshot
- revenge_buff_snapshot
- weather
- track
- race_engine_version
- liquidity_policy_version
- price_table_version
- created_at
- snapshot_hash
- base_ability_score
- horse_type_modifier
- rarity_modifier
- dna_modifier
- training_modifier
- weather_modifier
- track_modifier
- condition_modifier
- fatigue_modifier
- revenge_buff_modifier
- random_modifier
- final_score
- race_seed_hash

After snapshot creation, participants, ownership, training, and revenge buff state do not affect that race.

## Ranking and Tie-Breaker

Ranking order:

```text
1. final_score DESC
2. deterministic_tiebreak_score DESC
3. horse_uuid ASC
```

Tie-break score:

```text
normalize(SHA-256(race_seed + horse_uuid + race_engine_version))
```

## Burn

Burn targets are selected from the bottom `Burn Target Count` horses after deterministic ranking is finalized.

```text
Burn Target Count = floor(Eligible Horses * Burn Target Rate)
```

The system must never burn additional horses because of tied scores.

## Revenge Buff

Revenge Buff is a Burn Recovery Mechanism. It is not financial compensation.

Rules:

- generated when Burn is finalized
- belongs to `owner_user_id_at_snapshot`
- maximum one active buff per user
- cannot be sold, transferred, gifted, inventoried, or manually used
- automatically applies to next successful Assignment
- applies to P2P Assignment and Day0 Mint fallback
- failed/refunded Assignment does not consume it
- if user already has active buff, the buff is refreshed, not duplicated
- no expiration in v1.0

Buff Table v1.0:

| Rarity | Probability | Final Score Bonus |
|---|---:|---:|
| N | 30% | +4 |
| R | 50% | +7 |
| SR | 20% | +10 |

Expected Buff Modifier is +6.7 final_score.

Buff rarity roll:

```text
SHA-256(
  race_seed
  + horse_uuid
  + owner_user_id_at_snapshot
  + burn_event_id
  + buff_policy_version
)
```

SR is a strong advantage, not guaranteed survival.

## Memorial NFT

Memorial NFT is created only after all seven Buyback payments are successfully posted. Memorialized horses never return to P2P circulation.
