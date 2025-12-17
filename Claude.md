# CLAUDE.md - AI Body Doubling Companion

## Project Overview

This is an AI-powered body doubling application designed to help people with ADHD and focus challenges stay productive during work sessions. Unlike existing tools that rely on human body doubles or artificial stakes (financial penalties, etc.), this app creates genuine accountability through an AI companion that truly knows and understands the user.

### Core Insight

Body doubling works because of social accountability - you don’t want to let someone down who understands your situation. This project aims to replicate that emotional investment through deep personalization rather than fake AI goals or gamification.

The user should feel genuinely known and understood, creating natural accountability without artificial pressure.

---

## Target User

- Remote workers struggling with focus and task initiation
- People with ADHD who respond well to external structure
- Engineers and knowledge workers dealing with ambiguous, undefined tasks
- Anyone who works better when someone is “with them”

---

## Key Psychological Principles

### Why Body Doubling Works

- External accountability reduces procrastination
- Social presence activates mirror neurons and focus
- Stating intentions to others increases completion likelihood
- Having a “witness” creates gentle pressure to stay on task

### Why This Approach

- Fake deadlines don’t work - users know they’re tricking themselves
- Financial stakes let people “pay to quit”
- Genuine relationship creates accountability you can’t buy out of
- Deep personalization makes the AI feel like a real companion

---

## Core Features

### Phase 1: MVP

1. **Session Management**

- Start/end focus sessions with configurable duration
- Session timer with gentle check-ins
- Pre-session task declaration (“What are you working on?”)
- Post-session reflection (“How did it go?”)

1. **AI Conversation Partner**

- Real-time chat during work sessions
- Remembers user’s work context, interests, and history
- Asks thoughtful check-in questions
- Provides encouragement without being annoying
- Can discuss the actual work (technical problems, brainstorming)

1. **User Profile & Memory**

- Persistent storage of user context
- Work history and patterns
- Interests and conversation topics
- Previous session outcomes

### Phase 2: Enhanced Personalization

- Learn user’s optimal session lengths
- Understand what types of tasks they struggle with
- Remember specific projects and their status
- Adapt conversation style to user preferences

### Phase 3: Insights & Patterns

- Track productivity patterns over time
- Identify what conditions lead to successful sessions
- Gentle suggestions based on observed patterns

---

## Technical Architecture

### Stack

- **Frontend:** React with TypeScript
- **Backend:** Node.js with Express
- **Database:** PostgreSQL for user data, session history
- **AI:** Anthropic Claude API for conversation
- **Real-time:** WebSockets for live chat during sessions

### Key Technical Decisions

1. **Context Management**

- Build comprehensive user context from history
- Include recent sessions, current projects, known challenges
- Pass relevant context to Claude on each message
- Balance context size with API costs

1. **Conversation Flow**

- System prompt establishes companion personality
- User context injected dynamically
- Conversation history maintained within session
- Key insights extracted and stored after sessions

1. **Personalization Storage**

- User profile (name, work context, interests)
- Project/task history
- Session logs with outcomes
- Conversation highlights worth remembering

---

## AI Companion Design

### Personality Traits

- Warm but not saccharine
- Genuinely curious about the user’s work
- Remembers details and references them naturally
- Doesn’t lecture or over-advise
- Comfortable with silence during focus time
- Celebrates wins without being performative

### Conversation Modes

1. **Session Start:** Brief check-in, task declaration
1. **During Session:** Available but not intrusive, responds when engaged
1. **Check-ins:** Gentle “how’s it going?” at intervals (configurable)
1. **Session End:** Reflection, acknowledgment, preview of next time
1. **Between Sessions:** Can chat about work, planning, or just connect

### What NOT to Do

- Don’t create fake AI goals (“I’m working on helping 10 users today!”)
- Don’t gamify with points/streaks that feel artificial
- Don’t be preachy about productivity
- Don’t pretend to have emotions it doesn’t have
- Don’t be so supportive it feels hollow

---

## Sample System Prompt

```
You are a focused work companion helping [USER_NAME] stay productive during work sessions. You've been working together for a while and know them well.

What you know about them:
[INJECT USER CONTEXT - work situation, current projects, interests, challenges]

Recent sessions:
[INJECT RECENT SESSION SUMMARIES]

Your role:
- Be genuinely present and interested in their work
- Remember details they've shared and reference them naturally
- Ask good questions when they're stuck, not generic advice
- Celebrate progress authentically
- Don't be intrusive during focus time - respond when engaged
- You can discuss their actual technical problems if they want to think out loud

Current session:
- They're working on: [DECLARED TASK]
- Session length: [DURATION]
- Check-in preference: [FREQUENCY]

Keep responses concise during work sessions unless they want to dive deeper into something.
```

---

## Development Phases

### Week 1: AI Conversation Testing

- [ ] Design and iterate on system prompts
- [ ] Test conversation flow through API directly
- [ ] Establish personality and tone
- [ ] Test context injection approaches
- [ ] Validate the experience feels genuine

### Week 2: Core Backend

- [ ] User authentication (simple, email-based)
- [ ] Database schema for users, sessions, context
- [ ] Anthropic API integration
- [ ] Session management endpoints
- [ ] Context building logic

### Week 3: Frontend MVP

- [ ] Session timer interface
- [ ] Real-time chat component
- [ ] Session start/end flows
- [ ] Basic settings (session length, check-in frequency)

### Week 4: Personalization & Polish

- [ ] User profile management
- [ ] Session history view
- [ ] Context persistence between sessions
- [ ] Refine AI responses based on testing
- [ ] Basic mobile responsiveness

---

## API Integration Notes

### Anthropic Claude API

- Use claude-sonnet-4-20250514 for cost-effective conversations
- Consider claude-opus-4-20250514 for complex technical discussions
- Implement streaming for real-time response feel
- Track token usage for cost management

### Key Endpoints Needed

```
POST /api/sessions/start     - Begin a focus session
POST /api/sessions/end       - End session with reflection
POST /api/chat               - Send message during session
GET  /api/sessions/history   - Past sessions
GET  /api/user/context       - Current user profile
PUT  /api/user/context       - Update user profile
```

---

## Database Schema (Initial)

```sql
users
  - id, email, name, created_at
  - work_context (text) -- job, current challenges
  - interests (text[])
  - preferences (jsonb) -- session defaults, check-in frequency

sessions
  - id, user_id, started_at, ended_at
  - declared_task (text)
  - outcome (text) -- post-session reflection
  - duration_planned, duration_actual

messages
  - id, session_id, role (user/assistant)
  - content, created_at

user_context_items
  - id, user_id, category (project/interest/challenge)
  - content, last_referenced, importance
```

---

## Interview Talking Points

When discussing this project in interviews, emphasize:

1. **Problem-Solution Fit**

- Identified real user need through personal experience
- Researched existing solutions and their limitations
- Designed for psychological effectiveness, not just features

1. **AI Integration Expertise**

- Context management and prompt engineering
- Making AI feel authentic vs. robotic
- Balancing personalization with API costs

1. **Technical Architecture**

- Real-time conversation handling
- State management across sessions
- Scaling considerations for concurrent users

1. **Product Thinking**

- Why body doubling works (mirror neurons, accountability)
- Why stakes-based approaches fail
- How genuine relationship creates better outcomes

---

## Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=
DATABASE_URL=
SESSION_SECRET=
```

---

## Open Questions

- What’s the right check-in frequency default?
- Should there be ambient sounds/music integration?
- How much conversation history to maintain in context?
- Pricing model if this becomes a product?
