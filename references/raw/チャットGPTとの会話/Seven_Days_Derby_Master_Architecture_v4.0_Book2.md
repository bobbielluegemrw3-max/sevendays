# Seven Days Derby Master Architecture v4.0

## Book 2 - Game Design Master Edition

> Status: Master Draft

# Chapter 1 - Game Design Philosophy

## Purpose

Seven Days Derby is a daily strategic asset management game.

Core Loop:

``` text
Purchase
↓
Assignment
↓
Daily Training
↓
20:00 Race
↓
Burn or Survive
↓
Repeat
```

# Chapter 2 - Horse Design

## Horse Status

``` text
ACTIVE
RACING
BURNED
DAY7_CLEARED
BUYBACK_SCHEDULED
BUYBACK_COMPLETED
MEMORIALIZED
```

## Horse Identity

-   Horse ID
-   DNA
-   Bloodline
-   Horse Type
-   Rarity
-   Generation
-   Birthday

## Horse Types

``` text
SPRINTER
POWER
BALANCED
ENDURANCE
LUCK
```

## Rarity

``` text
COMMON
UNCOMMON
RARE
EPIC
LEGENDARY
```

Distribution:

-   COMMON 50%
-   UNCOMMON 25%
-   RARE 15%
-   EPIC 8%
-   LEGENDARY 2%

# Chapter 3 - DNA

DNA is generated once at mint and never changes.

Components:

-   Horse Type
-   Bloodline
-   Weather Aptitude
-   Track Aptitude
-   Temperament
-   Potential

Hidden Traits (examples):

-   Rain Master
-   Late Charger
-   Strong Finish
-   Lucky Runner

# Chapter 4 - Ability

Core abilities:

``` text
Speed
Power
Stamina
Recovery
Luck
```

Initial Range:

``` text
40 ~ 60
```

DNA modifies the initial values.

# Chapter 5 - Daily Training

Training choices:

``` text
Speed
Power
Recovery
```

Only one training per horse per day.

Training affects today's race only and does not permanently alter DNA.
