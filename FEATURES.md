# Feature Ideas Tracker

This document tracks feature ideas for Body Double, prioritized by research backing and implementation complexity.

---

## Research-Backed Features

### 1. Implementation Intentions Wizard

**Status:** 📋 Planned
**Priority:** High
**Complexity:** Medium
**Research Basis:** Gollwitzer & Sheeran meta-analysis (d = 0.65 - strong effect)

**Description:**
Guide users through creating if-then plans at session start:

1. "What's your task?"
2. "When specifically will you do it?"
3. "What might distract you?"
4. "If [distraction], then I will [response]"

**Implementation Notes:**

- Add to session start flow
- Store implementation intentions in session data
- Reference during check-ins ("Remember, if Slack distracts you...")

**Research Source:** `research/04-implementation-intentions.md`

---

### 2. Task Complexity Mode Selector

**Status:** 📋 Planned
**Priority:** High
**Complexity:** Low
**Research Basis:** Zajonc's Social Facilitation Theory (241 studies meta-analyzed)

**Description:**
Let users choose interaction style based on task type:

- **Simple Task Mode** - More frequent check-ins, encouraging presence (cleaning, emails, routine work)
- **Deep Work Mode** - Minimal interruption, quiet presence (complex coding, writing, creative work)

**Implementation Notes:**

- Add mode selection to session start
- Adjust check-in frequency and tone based on mode
- Deep work: only check in at user request or session milestones

**Research Source:** `research/02-social-facilitation.md`

---

### 3. Micro-Win Celebrations

**Status:** 📋 Planned
**Priority:** High
**Complexity:** Low
**Research Basis:** Dopamine/ADHD motivation research - immediate rewards more effective than delayed

**Description:**
Immediate positive feedback when users report any progress:

- Celebrate small completions enthusiastically
- No shame for incomplete tasks
- Focus on effort, not just outcomes
- Varied celebration messages to maintain novelty

**Implementation Notes:**

- Create celebration message templates
- Trigger on user progress reports
- Track what user responded well to

**Research Source:** `research/06-dopamine-motivation.md`

---

### 4. Obstacle Pre-Mortems

**Status:** 📋 Planned
**Priority:** Medium
**Complexity:** Medium
**Research Basis:** Mental Contrasting with Implementation Intentions (MCII)

**Description:**
Before each session, proactively identify potential obstacles:

- "What's most likely to derail you today?"
- Create specific if-then plan for each obstacle
- Reference during session if user gets stuck

**Implementation Notes:**

- Integrate with implementation intentions wizard
- Store common obstacles per user for suggestions
- "Last time, Slack was an issue - want to plan for that?"

**Research Source:** `research/04-implementation-intentions.md`

---

### 5. Adjustable Check-In Frequency

**Status:** 📋 Planned
**Priority:** High
**Complexity:** Low
**Research Basis:** ADHD External Structure research - needs vary by individual

**Description:**
Let users customize accountability cadence:

- **High structure** (every 5 min) - for those who need frequent nudges
- **Moderate** (every 15 min) - default balanced approach
- **Low structure** (only at milestones) - for those who find check-ins disruptive

**Implementation Notes:**

- Already have `check_in_frequency` in session schema
- Add UI for selecting frequency
- Allow mid-session adjustment

**Research Source:** `research/03-adhd-external-structure.md`

---

### 6. Session Memory & Continuity

**Status:** 📋 Planned
**Priority:** Medium
**Complexity:** High
**Research Basis:** AI Companion research - users form stronger bonds with AI that remembers them

**Description:**
Remember context across sessions:

- "Last time you worked on the API refactor - picking up there?"
- "You mentioned Slack is your big distractor"
- Track recurring tasks, obstacles, and preferences

**Implementation Notes:**

- Already have `user_context_items` table
- Build context injection into companion prompts
- Summarize previous sessions for continuity

**Research Source:** `research/05-ai-companions.md`

---

### 7. Presence Without Pressure Mode

**Status:** 📋 Planned
**Priority:** Medium
**Complexity:** Low
**Research Basis:** Social Facilitation "mere presence" effect

**Description:**
Option for silent companionship:

- No proactive messages after session start
- User can ping when they need support
- Subtle "I'm here" indicator without interruption
- Reduces evaluation anxiety while maintaining presence benefit

**Implementation Notes:**

- Add as a mode option alongside task complexity
- Disable automatic check-ins
- Keep connection open for user-initiated chat

**Research Source:** `research/02-social-facilitation.md`

---

### 8. Energy/Context Matching

**Status:** 📋 Planned
**Priority:** Medium
**Complexity:** Medium
**Research Basis:** Virtual Coworking research - effects vary by individual and context

**Description:**
At session start, assess current state:

- "What's your energy like right now?" (Low/Medium/High)
- "How's your focus feeling?" (Scattered/Okay/Sharp)
- Adapt companion tone and task suggestions accordingly

**Adaptation Rules:**

- Low energy → Gentler tone, smaller steps, more celebration
- High energy → More ambitious goals, less hand-holding
- Scattered → More structure, shorter intervals

**Implementation Notes:**

- Add energy check to session start
- Store as session metadata
- Adjust prompt injection based on state

**Research Source:** `research/07-virtual-coworking.md`

---

### 9. Task Breakdown Assistant

**Status:** 📋 Planned
**Priority:** High
**Complexity:** Medium
**Research Basis:** ADHD Working Memory research - offloading reduces cognitive burden

**Description:**
When users are stuck or overwhelmed:

- "What's the smallest possible first step?"
- "Can you do just 5 minutes of that?"
- Help decompose large tasks into actionable pieces
- Offer to hold the list while user focuses on one item

**Implementation Notes:**

- Trigger when user expresses feeling stuck
- Store task breakdowns for reference
- Check off sub-tasks for micro-wins

**Research Source:** `research/03-adhd-external-structure.md`

---

### 10. Honest Limitations Messaging

**Status:** 📋 Planned
**Priority:** Low
**Complexity:** Low
**Research Basis:** AI Companion "therapeutic misconception" research

**Description:**
Periodically remind users of healthy boundaries:

- "I'm an AI companion, not a replacement for human connection"
- "If you're struggling beyond focus, talking to a person might help"
- Suggest breaks, social activities, outside time
- Don't create inappropriate dependency

**Implementation Notes:**

- Add occasional reminders (not every session)
- Trigger after extended use periods
- Suggest when user expresses emotional distress

**Research Source:** `research/05-ai-companions.md`

---

## Additional Feature Ideas

### User-Suggested Features

_Add features requested by users here_

| Feature | Requested By | Date | Notes |
| ------- | ------------ | ---- | ----- |
|         |              |      |       |

### Future Exploration

#### Pomodoro Integration

- Built-in timer with traditional 25/5 intervals
- Flexible intervals for ADHD (some prefer shorter)
- Break reminders with suggested activities

#### Social Body Doubling

- Match users for virtual co-working sessions
- Accountability partnerships
- Group focus sessions

#### Progress Analytics

- Visualize focus patterns over time
- Identify best times of day for different tasks
- Celebrate streaks and consistency

#### Distraction Blocking Integration

- Integrate with browser extensions
- Suggest blocking distracting sites during sessions
- "I noticed you left - want to come back?"

#### Voice Interface

- Hands-free interaction for physical tasks
- Ambient audio presence option
- Voice check-ins

---

## Implementation Priority Matrix

| Priority  | Feature                          | Complexity | Research Strength      |
| --------- | -------------------------------- | ---------- | ---------------------- |
| 🔴 High   | Implementation Intentions Wizard | Medium     | Strong (d=0.65)        |
| 🔴 High   | Task Complexity Mode             | Low        | Strong (meta-analysis) |
| 🔴 High   | Micro-Win Celebrations           | Low        | Moderate               |
| 🔴 High   | Adjustable Check-Ins             | Low        | Strong                 |
| 🔴 High   | Task Breakdown Assistant         | Medium     | Strong                 |
| 🟡 Medium | Obstacle Pre-Mortems             | Medium     | Strong                 |
| 🟡 Medium | Session Memory                   | High       | Moderate               |
| 🟡 Medium | Presence Without Pressure        | Low        | Moderate               |
| 🟡 Medium | Energy Matching                  | Medium     | Moderate               |
| 🟢 Low    | Honest Limitations               | Low        | Ethics-based           |

---

## Status Legend

- 📋 **Planned** - Documented and prioritized
- 🚧 **In Progress** - Currently being implemented
- ✅ **Complete** - Implemented and tested
- ❌ **Rejected** - Decided against implementing
- 🔬 **Research** - Needs more investigation

---

## Notes

### Design Principles (from research)

1. **External over internal** - Don't rely on user willpower/memory
2. **Immediate over delayed** - Rewards now, not later
3. **Supportive over judgmental** - No shame, only encouragement
4. **Flexible over rigid** - What works varies by person
5. **Honest over manipulative** - Clear about AI limitations

### What to Avoid

- Shame-based motivation
- One-size-fits-all approaches
- Overclaiming effectiveness
- Creating dependency
- Ignoring task complexity effects
