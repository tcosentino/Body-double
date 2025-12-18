# Notion Integration Design Document

## Overview

Body Double transforms from a focus session companion into a **personal assistant** that uses Notion as its workspace. The assistant reads from and writes to Notion just like a human assistant would - managing tasks, taking notes, setting reminders, and keeping the user informed about what needs attention.

## Core Philosophy

**Notion is the assistant's notebook.** Just as a human personal assistant would use a planner or notebook to track everything for their employer, our AI assistant uses the user's Notion workspace. This means:

1. **Source of Truth**: Notion holds all persistent data (tasks, projects, notes, reminders)
2. **Bidirectional Sync**: User and assistant both read/write to Notion
3. **Self-Reminders**: Assistant uses Notion calendar to remind itself of future follow-ups
4. **Transparency**: User can always see exactly what the assistant "knows" by looking at Notion

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Body Double Assistant                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Claude    │  │  Proactive  │  │   Webhook Listener      │  │
│  │   Agent     │  │   Checker   │  │   (Notion Changes)      │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│                   ┌──────▼──────┐                                │
│                   │   Notion    │                                │
│                   │   Service   │                                │
│                   └──────┬──────┘                                │
└──────────────────────────┼──────────────────────────────────────┘
                           │ API
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    User's Notion Workspace                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │    Tasks     │  │   Projects   │  │   Assistant Notes    │   │
│  │   Database   │  │   Database   │  │      Database        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Calendar   │  │    Notes     │  │   Custom Databases   │   │
│  │   Database   │  │    Pages     │  │   (Movie list, etc)  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## OAuth Integration

### Flow

1. User clicks "Connect Notion" in Body Double
2. Redirect to Notion OAuth authorization page
3. User grants access to their workspace
4. Notion redirects back with authorization code
5. Exchange code for access token
6. Store encrypted token in database
7. Optionally: User selects which databases to use for tasks, calendar, etc.

### Scopes Required

Notion's OAuth provides access to pages/databases the user explicitly shares during authorization. We request:

- Read/write access to shared pages and databases
- Ability to create new pages and databases
- Search across shared content

### Token Storage

```sql
CREATE TABLE notion_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  access_token TEXT NOT NULL,           -- Encrypted
  workspace_id TEXT NOT NULL,
  workspace_name TEXT,
  workspace_icon TEXT,
  bot_id TEXT NOT NULL,
  connected_at TEXT DEFAULT (datetime('now')),
  last_synced_at TEXT,

  -- User-configured database mappings
  tasks_database_id TEXT,               -- Main tasks database
  calendar_database_id TEXT,            -- Calendar/reminders database
  notes_database_id TEXT,               -- General notes
  assistant_db_id TEXT,                 -- Assistant's private workspace

  UNIQUE(user_id)
);

CREATE INDEX idx_notion_connections_user_id ON notion_connections(user_id);
```

## Notion Database Structures

### 1. Tasks Database

The assistant reads/writes tasks here. Expected properties:

| Property       | Type      | Purpose                          |
| -------------- | --------- | -------------------------------- |
| Name           | Title     | Task title                       |
| Status         | Select    | Todo, In Progress, Done, Blocked |
| Priority       | Select    | High, Medium, Low                |
| Due Date       | Date      | When task is due                 |
| Project        | Relation  | Link to Projects database        |
| Notes          | Rich Text | Additional details               |
| Created By     | Select    | "User" or "Assistant"            |
| Estimated Time | Number    | Minutes expected                 |

### 2. Calendar/Reminders Database

Used for time-based items AND assistant self-reminders:

| Property     | Type      | Purpose                                    |
| ------------ | --------- | ------------------------------------------ |
| Name         | Title     | Event/reminder title                       |
| Date         | Date      | When (supports datetime)                   |
| Type         | Select    | Event, Reminder, Follow-up, Assistant-Note |
| Related Task | Relation  | Optional link to task                      |
| Context      | Rich Text | Details for the reminder                   |
| For          | Select    | "User" or "Assistant"                      |

**Assistant Self-Reminders**: When the assistant needs to follow up on something in the future, it creates a calendar entry with `For: Assistant`. Example:

- User: "Remind me to check on the proposal in 2 weeks"
- Assistant creates: `{ Name: "Follow up on proposal", Date: "2024-02-01", Type: "Follow-up", For: "Assistant", Context: "User asked to be reminded about the Henderson proposal status" }`

### 3. Notes Database

For capturing information, meeting notes, research, etc:

| Property        | Type         | Purpose                   |
| --------------- | ------------ | ------------------------- |
| Name            | Title        | Note title                |
| Tags            | Multi-select | Categorization            |
| Created         | Date         | When created              |
| Related Project | Relation     | Optional project link     |
| Source          | Select       | User, Assistant, Web, etc |

### 4. Assistant Workspace Database (Private)

The assistant's own "scratchpad" for tracking:

| Property  | Type      | Purpose                            |
| --------- | --------- | ---------------------------------- |
| Name      | Title     | Entry title                        |
| Type      | Select    | Insight, Pattern, Preference, TODO |
| Content   | Rich Text | Details                            |
| Last Used | Date      | When last referenced               |

This is where the assistant stores things like:

- "User prefers morning for deep work"
- "User gets overwhelmed by lists > 5 items"
- "User's Q4 goal is launching the mobile app"

## Proactive Checking System

### Scheduled Jobs

The assistant periodically checks Notion for actionable items:

```typescript
interface ProactiveCheck {
  // Run every N minutes
  frequency: number;

  // What to check
  checks: [
    "overdue_tasks", // Tasks past due date
    "due_today", // Tasks due today
    "upcoming_reminders", // Calendar items in next 2 hours
    "assistant_followups", // Assistant's own reminders
    "stale_in_progress", // Tasks stuck in progress > 3 days
    "weekly_review_due", // Sunday evening prompt
  ];
}
```

### Check Results → User Notifications

When checks find actionable items, the assistant can:

1. **In-App Notification**: Show in the Body Double UI
2. **Conversation Starter**: Next time user opens app, lead with what needs attention
3. **Email Digest** (future): Daily/weekly email summary

Example proactive message:

> "Good morning! Quick heads up: the Henderson proposal is due tomorrow and still shows 'In Progress'. You also have a dentist appointment at 2pm. Want to tackle the proposal this morning?"

## Webhook Integration (Future Enhancement)

For real-time awareness of Notion changes:

### Notion Webhook Events (when available)

- Page created/updated/deleted
- Database item created/updated/deleted
- Comment added

### Our Response

When user updates Notion directly:

1. Receive webhook event
2. Update our cached understanding
3. Potentially acknowledge: "I see you completed the budget review - nice work!"

### Polling Fallback

Until webhooks are available/reliable, poll for changes:

- Check task database every 5 minutes
- Check calendar every 15 minutes
- Full sync daily

## Assistant Capabilities

### 1. Task Management

```
User: "Add a task to review the Q4 budget by Thursday"
Assistant: "Done! I've added 'Review Q4 budget' to your tasks with a Thursday
           deadline. I set it as high priority since it's time-sensitive.
           Want me to block time for it tomorrow morning?"
```

**Capabilities:**

- Create tasks with title, due date, priority, notes
- Update task status (mark complete, change priority)
- Query tasks (what's due today? what's overdue?)
- Link tasks to projects
- Suggest task breakdowns for complex items

### 2. Calendar & Reminders

```
User: "Remind me to follow up with Sarah about the partnership in 2 weeks"
Assistant: "Got it! I've set a reminder for January 28th to follow up with
           Sarah about the partnership. I'll bring it up then."
```

**Behind the scenes:**

- Creates calendar entry with `Type: Follow-up`, `For: Assistant`
- When that date arrives, proactive check surfaces it
- Assistant leads conversation with the reminder

### 3. Note Taking & Information Capture

```
User: "Can you find a good carbonara recipe and save it for me?"
Assistant: "Found a great authentic carbonara recipe! I've saved it to your
           Notes in Notion with the 'recipes' tag. Key points: use guanciale
           not bacon, no cream (just eggs and pecorino), and add pasta water
           for the sauce. Want me to add the ingredients to a shopping list?"
```

**Capabilities:**

- Create new pages with rich content
- Organize with tags and relations
- Capture meeting notes from conversation
- Save research/information for later

### 4. Dynamic Database Creation

```
User: "I want to start tracking movies I want to watch"
Assistant: "Great idea! I've created a 'Movie Watchlist' database in your
           Notion with columns for title, genre, where to watch, priority,
           and your rating once you've seen it. Want to add some movies now?"
```

**Capabilities:**

- Create new databases with sensible schemas
- Suggest properties based on content type
- Link to existing databases where appropriate

### 5. Information Retrieval

```
User: "What did we decide about the API redesign?"
Assistant: "Looking through your notes... In the November 15th project meeting,
           you decided to go with REST over GraphQL for simplicity, with a
           review planned for Q2 if usage patterns change. The main concerns
           were team familiarity and timeline. Want me to pull up the full notes?"
```

**Capabilities:**

- Search across all connected databases
- Reference past conversations and notes
- Connect dots between related information

## Data Flow Examples

### Example 1: Morning Briefing

```
1. User opens Body Double at 8am
2. Proactive checker has already run, found:
   - 3 tasks due today
   - 1 overdue task from yesterday
   - 2 meetings on calendar
   - 1 assistant follow-up reminder
3. Assistant greets with briefing:
   "Good morning! Here's your day:
    - You have that overdue budget review from yesterday
    - 3 tasks due today: API documentation, team standup prep, client email
    - Meetings at 10am (team sync) and 2pm (client call)
    - Oh, and you asked me to remind you to book flights for the conference

    The budget review seems most urgent - want to tackle that first?"
```

### Example 2: End of Day Review

```
1. User: "How did today go?"
2. Assistant queries Notion for:
   - Tasks completed today
   - Tasks still open
   - Any new items created
3. Response:
   "You had a productive day! Completed 4 tasks including that budget review.
    Still open: the API docs and client email (both due today).

    I noticed the API docs task has been in progress for 3 days - is something
    blocking you? Want to break it down into smaller pieces?"
```

### Example 3: Assistant Self-Reminder Flow

```
Day 1:
User: "I need to check if the vendor responded by next Friday"
Assistant: "I'll remind you next Friday to check on the vendor response."
→ Creates calendar entry: {
    Name: "Check vendor response",
    Date: "next Friday",
    Type: "Follow-up",
    For: "Assistant",
    Context: "User waiting on vendor response, needs to check status"
  }

Day 8 (Next Friday):
→ Proactive check runs at 8am
→ Finds assistant follow-up for today
→ When user opens app:
Assistant: "Hey! It's been a week - did you hear back from the vendor about
           that proposal? You wanted to check on it today."
```

## Security Considerations

### Token Storage

- Notion access tokens are encrypted at rest
- Tokens are never exposed to frontend
- All Notion API calls happen server-side

### Data Access

- Only access databases/pages user explicitly shared
- Clear indication in UI of what's connected
- Easy disconnect/revoke access

### Privacy

- Assistant workspace notes stay in user's Notion (not our DB)
- We don't store copies of Notion content long-term
- Conversation memory stays in our DB, but references Notion by ID

## Setup Flow

### First-Time Connection

1. **Connect Notion**
   - Click "Connect Notion" button
   - Authorize in Notion popup
   - Return to Body Double

2. **Configure Databases**
   - Assistant scans workspace for existing databases
   - Suggests mappings: "I found a 'Tasks' database - use this for task management?"
   - User confirms or selects different databases
   - Option to create new databases if none exist

3. **Initial Sync**
   - Pull recent tasks, calendar items
   - Build initial context about user's current work
   - Ready to assist

### Ongoing Maintenance

- Periodic sync to stay current
- Webhook updates (when available)
- User can reconfigure database mappings anytime
- Clear "Disconnect Notion" option

## API Endpoints

### Notion Connection

```
POST /api/notion/connect
  → Redirects to Notion OAuth

GET /api/notion/callback
  → Handles OAuth callback, stores token

GET /api/notion/status
  → Returns connection status and configured databases

POST /api/notion/configure
  → Set database mappings (tasks_db, calendar_db, etc.)

DELETE /api/notion/disconnect
  → Revoke access, delete stored token
```

### Notion Operations (Internal)

```typescript
// Service methods used by assistant
interface NotionService {
  // Tasks
  getTasks(filters?: TaskFilters): Promise<Task[]>;
  createTask(task: CreateTaskInput): Promise<Task>;
  updateTask(id: string, updates: TaskUpdates): Promise<Task>;

  // Calendar
  getUpcomingEvents(days: number): Promise<CalendarItem[]>;
  createReminder(reminder: CreateReminderInput): Promise<CalendarItem>;
  getAssistantReminders(): Promise<CalendarItem[]>;

  // Notes
  createPage(page: CreatePageInput): Promise<Page>;
  searchPages(query: string): Promise<Page[]>;

  // Databases
  createDatabase(schema: DatabaseSchema): Promise<Database>;
  queryDatabase(id: string, query: DatabaseQuery): Promise<any[]>;

  // General
  search(query: string): Promise<SearchResults>;
}
```

## Future Enhancements

### Phase 2

- Email integration (Gmail/Outlook)
- Calendar sync (Google Calendar ↔ Notion)
- Mobile push notifications

### Phase 3

- Voice interface
- Browser extension for quick capture
- Integrations with other tools (Slack, Linear, etc.)

### Phase 4

- Team workspaces
- Shared assistant contexts
- Delegation to other team members

## Migration Notes

### From Current System

The existing memory system (`user_context_items` table) continues to work for users without Notion connected. For Notion users:

- Memories can be synced to Assistant Workspace database
- Or kept separate (faster access, no API calls)
- Gradual migration path - no breaking changes

### Database Compatibility

Current SQLite schema extended with `notion_connections` table. No changes to existing tables required.
