<!-- PROTOTYPE - NOT FOR PRODUCTION -->
<!-- Question: Can a raid mitigation timeline predict survival and show active coverage? -->
<!-- Date: 2026-05-25 -->

## Prototype Report: Mitigation Planner

### Hypothesis

Raid groups can judge survivability faster if mechanic damage, damage type, mitigation windows, and remaining HP predictions are shown in one editable shared timeline.

### Approach

Built a standalone Node prototype with no external dependencies. The server owns one in-memory planner document, serves a browser UI, accepts WebSocket edits, recalculates survival, and broadcasts the same state/results to every connected client.

### Result

The prototype supports eight party members, editable mechanics, editable mitigation skills, timeline bars, mechanic markers, active mitigation pills, effective damage, lowest remaining HP, and pass/fail survival status. Editing a mechanic damage value updates the survival table, and a second connection receives the same updated state.

### Metrics

- Automated model tests: 4 passing.
- Collaboration check: existing browser connection plus 2 Node WebSocket clients reached 3 simultaneous connections.
- Browser verification: page rendered at `http://localhost:5188` with no console warnings or errors.
- Iteration count: 2 UI verification passes; one input-event issue fixed.

### Recommendation: PROCEED

The core interaction works. The next production step should replace the last-write-wins in-memory document with a durable collaboration backend and expand the combat model for shields, heals, invulnerability, vulnerabilities, per-player targeting, and a real FFXIV mitigation preset library.

### If Proceeding

- Add persistent rooms/plans so separate parties can work independently.
- Add conflict handling or CRDT-style field updates for simultaneous editing.
- Add skill presets by job with cooldown, duration, mitigation type, and target rules.
- Add shields, healing, HP snapshots, vulnerability stacks, and tank-specific calculations.
- Add export/import for timeline sharing.

### Lessons Learned

The most important UI surface is the timeline plus survival table together: users need to see both "this skill covers this mechanic" and "this still kills someone" without changing screens.
