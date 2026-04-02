## ADDED Requirements

### Requirement: User can cancel a pending continuation
The system SHALL expose a user-triggerable cancel action for a session that has a pending continuation countdown.

#### Scenario: Cancel active countdown
- **WHEN** a continuation countdown is active for a session and the user triggers the cancel action for that session
- **THEN** the active countdown SHALL stop immediately
- **THEN** the pending continuation for that countdown cycle SHALL be marked as canceled

#### Scenario: No pending continuation to cancel
- **WHEN** the user triggers the cancel action for a session that does not have a pending continuation countdown
- **THEN** the system SHALL NOT inject any new continuation prompt as part of that cancel action
- **THEN** the system SHALL report that there was no pending continuation to cancel

### Requirement: Canceled continuation is not injected
The system SHALL NOT inject the pending continuation prompt for a countdown cycle that has been canceled by the user.

#### Scenario: Cancel during countdown
- **WHEN** the user cancels a continuation while its countdown is still running
- **THEN** the system SHALL NOT call the continuation prompt injection path for that countdown cycle

#### Scenario: Cancel before final injection step
- **WHEN** the user cancels a continuation after the countdown has started and before the pending prompt injection has been executed
- **THEN** the system SHALL treat that countdown cycle as stopped
- **THEN** the system SHALL skip the pending continuation prompt injection for that cycle

### Requirement: Cancellation only applies to the current pending cycle
The system SHALL apply a user-triggered cancellation only to the currently pending continuation cycle and SHALL continue evaluating future idle cycles normally.

#### Scenario: Future idle cycle can continue again
- **WHEN** a user has canceled one pending continuation cycle and the same session later becomes idle again with incomplete todos still remaining
- **THEN** the system SHALL evaluate continuation eligibility for the new idle cycle independently of the earlier canceled cycle

#### Scenario: Cancellation state does not persist indefinitely
- **WHEN** the canceled continuation cycle has finished unwinding and a later idle event is processed for the same session
- **THEN** the earlier cancel action SHALL NOT permanently disable future continuation scheduling for that session
