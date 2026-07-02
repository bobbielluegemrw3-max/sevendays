# Seven Days Derby

# Game Design Document (GDD)

**Version:** 0.1.0 (Draft)

------------------------------------------------------------------------

# Document Policy

This document is the single source of truth (SSOT) for the Seven Days
Derby project.

Rules:

-   Every design decision is versioned.
-   Confirmed specifications are never overwritten; they are revised
    through version history.
-   Business ideas, game rules, economy, and implementation are
    separated into different documents.
-   This document contains only confirmed game specifications.

------------------------------------------------------------------------

# Chapter 0 - Trust Architecture

## TA-001 Immutable Price

-   Horse prices are fixed.
-   Prices cannot be changed by the operator.
-   Prices are determined only by the horse's current Day.

     Day        Price
  ------ ------------
    Day0      100 USD
    Day1      110 USD
    Day2      121 USD
    Day3   133.10 USD
    Day4   146.41 USD
    Day5   161.05 USD
    Day6   177.16 USD
    Day7   194.87 USD

------------------------------------------------------------------------

## TA-002 Immutable Horse Creation

-   Only the Central Stable (system) can create new horses.
-   Only Day0 horses may be created.
-   Day1-Day7 horses can never be issued directly.

------------------------------------------------------------------------

## TA-003 Immutable Race

-   Operators cannot change race results.
-   Operators cannot change win rates.
-   Operators cannot modify rankings.

------------------------------------------------------------------------

## TA-004 Immutable Horse

-   Operators cannot modify horse DNA.
-   Horse DNA is generated only once at birth.
-   Horse ability grows only through Training Engine.

------------------------------------------------------------------------

## TA-005 Immutable Burn

-   Operators cannot manually delete horses.
-   Horses disappear only by:
    1.  Race defeat (burn)
    2.  Hall of Fame reward completion

------------------------------------------------------------------------

# Chapter 1 - Core Game Loop

1.  Player acquires an Entry NFT.
2.  Entry NFT is consumed.
3.  Player purchases one horse.
4.  AI randomly matches an available horse.
5.  P2P inventory is always prioritized.
6.  If inventory is insufficient, AI issues a new Day0 horse.
7.  One training per day.
8.  One world race per day.
9.  Bottom 10% are burned.
10. Winners advance one Day.
11. Day7 horse may be sold once.
12. Final owner enters Hall of Fame challenge.
13. Successful Hall horse receives 200 USD over 7 days.
14. Reward finishes.
15. Horse retires.
16. Hall NFT remains permanently.

------------------------------------------------------------------------

# Chapter 2 - Horse System

Confirmed:

-   Horses have unique names.
-   Horses have immutable DNA.
-   Horses have birth date/time.
-   Horses have no Level.
-   Horses grow through training.
-   Numeric abilities are hidden.
-   Players see gauges and AI comments.
-   Horses have temporary condition changes.
-   Horses have sex.
-   Horses have bloodline type.

------------------------------------------------------------------------

# Chapter 3 - Market Rules

-   Player cannot choose a specific horse.
-   Purchase uses AI random matching.
-   Matching probability follows actual market inventory.
-   Sell queue is FIFO.
-   Sell request: once per day.
-   Sell queue carries over to the next day.
-   AI never buys player horses.

------------------------------------------------------------------------

# Chapter 4 - Race Rules

-   One global race each day.
-   Every active horse participates.
-   Daily rankings reset.
-   Historical rankings are permanently stored.

------------------------------------------------------------------------

# Confirmed Core Engines

-   Market Engine
-   Race Engine
-   Training Engine
-   Burn Engine
-   Reward Engine
-   News Engine

------------------------------------------------------------------------

# Change Log

## v0.1.0

Initial master specification created from confirmed design decisions.
