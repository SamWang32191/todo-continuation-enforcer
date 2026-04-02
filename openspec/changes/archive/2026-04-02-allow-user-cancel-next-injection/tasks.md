## 1. Core cancellation state and flow

- [x] 1.1 Extend `SessionState` and related state-store helpers with a one-shot user-canceled flag for the current pending continuation cycle
- [x] 1.2 Add a handler-level `cancelNextContinuation(sessionID)` API that sets the cancel flag, stops an active countdown when present, and returns a clear result for callers
- [x] 1.3 Update the idle handling flow to pass the cancel state into both `shouldContinueOnIdle()` checks and consume/clear the one-shot cancel flag after the current cycle unwinds

## 2. User-triggered plugin entrypoint and feedback

- [x] 2.1 Add a plugin-exposed cancel tool entrypoint that invokes `cancelNextContinuation(sessionID)` for the current session or an explicitly provided session ID
- [x] 2.2 Return user-readable outcomes for cancel requests, including successful cancellation and no pending continuation to cancel
- [x] 2.3 Update countdown/toast feedback so users are informed when a pending continuation has been canceled

## 3. Verification and regression coverage

- [x] 3.1 Add or update tests for canceling during countdown so the pending continuation is not injected
- [x] 3.2 Add or update tests for canceling near the final recheck/injection boundary to cover race-sensitive behavior
- [x] 3.3 Add or update tests that verify cancellation only applies to the current pending cycle and does not block future idle cycles
