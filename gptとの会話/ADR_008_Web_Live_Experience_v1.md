# ADR-008: Web Live Experience for The Daily Derby

Status: APPROVED FOR CLAUDE CODE

## Purpose

Define how the 20:00 Daily Derby experience behaves on the Web version.

The experience must feel like a live event without requiring users to
manually refresh the browser.

------------------------------------------------------------------------

# Philosophy

The browser is not a limitation.

If the user is currently browsing the website, the UI should
automatically transition into Live Mode at 20:00.

No manual refresh is required.

------------------------------------------------------------------------

# User Scenarios

## Scenario 1 - User is already on the website

Flow:

Countdown

↓

20:00 detected

↓

Automatically enter Live Mode

↓

Daily Derby animation

↓

Personal Result

↓

Completed

This transition is automatic.

------------------------------------------------------------------------

## Scenario 2 - User is browsing another page

A global countdown should appear in the navigation.

Example:

Next Daily Derby

03:21

At 20:00

The banner changes to:

THE DAILY DERBY IS LIVE

Clicking it opens the Live page.

------------------------------------------------------------------------

## Scenario 3 - User opens the website after 20:00

The frontend queries current batch status.

Possible states:

WAITING

COUNTDOWN

LIVE

PERSONAL_RESULT

COMPLETED

FAILED_SAFE_MODE

The correct screen is shown automatically.

------------------------------------------------------------------------

## Browser Behaviour

No page refresh required.

Use:

-   client-side countdown timer
-   periodic polling
-   server batch status endpoint

Future versions may replace polling with WebSocket or Server-Sent
Events.

------------------------------------------------------------------------

## Daily Derby States

WAITING

↓

COUNTDOWN

↓

LIVE

↓

PROCESSING

↓

PERSONAL_RESULT

↓

COMPLETED

If failure occurs:

FAILED_SAFE_MODE

------------------------------------------------------------------------

## UI Requirements

Always show:

-   Next Daily Derby countdown
-   Current batch state
-   Live button during processing

The countdown should be visible throughout the application.

------------------------------------------------------------------------

## Future PWA

Out of scope for v1.0.

Planned for v1.1:

-   Push Notifications
-   Home Screen Install
-   Daily Derby reminder
-   Settlement completed notification

------------------------------------------------------------------------

## Claude Code Notes

Implement automatic transition without browser refresh.

Detect current server batch state.

If user enters mid-event, synchronize to the correct step.

Do not replay completed animations unnecessarily.

Animation should always reflect actual backend status.

------------------------------------------------------------------------

## Constitution Rule

The Daily Derby SHALL automatically transition to Live Mode for users
currently on the website.

The frontend SHALL synchronize with backend batch status without
requiring manual refresh.

The Web implementation SHALL support WAITING, COUNTDOWN, LIVE,
PERSONAL_RESULT, COMPLETED and FAILED_SAFE_MODE states.

PWA notifications are optional future enhancements and are not required
for v1.0.
