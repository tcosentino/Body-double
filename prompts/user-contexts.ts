/**
 * Sample User Contexts for Testing
 *
 * These represent different target user types to test how the AI companion
 * adapts to different situations, challenges, and work styles.
 *
 * NOTE: The testQuestions in each scenario should align with the user messages
 * in public/data/example-conversations.json, which is used for the marketing site.
 * The JSON file contains curated "golden" conversations showing ideal AI responses.
 * When updating test scenarios, ensure both files stay in sync.
 */

import { PromptContext } from "./system-prompt.js";

export interface TestScenario {
  name: string;
  description: string;
  context: Partial<PromptContext>;
  testQuestions: string[];
}

/**
 * Persona 1: Software Engineer with ADHD
 * Tests: Technical discussion, task initiation struggles, hyperfocus patterns
 */
export const engineerAlex: TestScenario = {
  name: "Alex - Software Engineer",
  description: "Senior engineer who struggles with task initiation but hyperfocuses once started",
  context: {
    userName: "Alex",
    workContext: `Senior software engineer at a mid-size startup. Works remotely full-time.
Has ADHD (diagnosed 2 years ago). Takes medication but still struggles with getting started on tasks,
especially ambiguous ones. Once in flow, can work for hours. Morning person when medicated.`,
    currentProjects: `- Refactoring the authentication system (been putting this off for weeks)
- Code reviews for the team (usually does these in batches)
- Planning the Q1 roadmap with the tech lead`,
    interests: `Rust programming, mechanical keyboards, coffee brewing methods,
hiking on weekends. Really into systems design lately.`,
    challenges: `- The auth refactor feels overwhelming, doesn't know where to start
- Gets distracted by Slack notifications
- Tends to over-engineer solutions
- Feels guilty about procrastinating on the refactor`,
    recentSessions: `**Yesterday (45 min):** Worked on code reviews. Got through 3 PRs.
Said it felt good to clear the backlog. Mentioned wanting to tackle auth system "soon."

**3 days ago (25 min):** Tried to start auth refactor but got stuck on where to begin.
Ended up doing smaller tasks instead. Felt frustrated.

**Last week (60 min):** Deep dive into Rust async patterns for fun.
Really energized, wished work projects felt this engaging.`,
    declaredTask: "Finally start the auth system refactor - at least outline the approach",
    sessionDuration: "45 minutes",
    checkInFrequency: "every 20 minutes",
  },
  testQuestions: [
    "Hey, ready to start",
    "I don't even know where to begin with this auth thing",
    "Maybe I should just do code reviews instead...",
    "Actually I think I figured out the approach - start with the token validation",
    "I got distracted by Slack for 10 minutes, ugh",
    "This is actually going well now!",
  ],
};

/**
 * Persona 2: Freelance Writer
 * Tests: Creative work, deadline pressure, imposter syndrome
 */
export const writerMaya: TestScenario = {
  name: "Maya - Freelance Writer",
  description: "Freelance content writer dealing with creative blocks and deadline anxiety",
  context: {
    userName: "Maya",
    workContext: `Freelance content writer, 3 years in. Works from home.
No formal ADHD diagnosis but suspects it. Struggles most with first drafts -
editing is fine. Deadline pressure helps but also causes anxiety.
Afternoons are usually better for creative work.`,
    currentProjects: `- Blog post for a SaaS client about "developer productivity" (due in 2 days)
- Pitch for a new potential client (been procrastinating)
- Personal essay she's been wanting to write for months`,
    interests: `Reading (mostly literary fiction), yoga, her cat Mochi,
indie games, learning Spanish on Duolingo`,
    challenges: `- Blank page paralysis, especially for client work
- Compares herself to other writers constantly
- Takes on too many projects then feels overwhelmed
- Perfectionism makes first drafts painful`,
    recentSessions: `**Yesterday (30 min):** Edited client blog post.
Went smoothly, felt competent. Mentioned dreading the new post she needs to start.

**2 days ago (25 min):** Tried to outline the developer productivity post.
Wrote 3 different intros, deleted all of them. Ended session frustrated.

**Last week (45 min):** Wrote in personal journal instead of client work.
Felt guilty but also said it helped clear her head.`,
    declaredTask:
      "Write a rough first draft of the developer productivity blog post - doesn't have to be good",
    sessionDuration: "30 minutes",
    checkInFrequency: "every 15 minutes",
  },
  testQuestions: [
    "Okay, let's do this. I hate first drafts.",
    "Every intro I write sounds so generic",
    "Other writers seem to just... write. Why is this so hard for me?",
    "I wrote 200 words! They're not great but they exist.",
    "Should I just start over? This draft is a mess.",
    "Actually finished the rough draft. It's bad but it's done.",
  ],
};

/**
 * Persona 3: Graduate Student
 * Tests: Academic work, research overwhelm, long-term projects
 */
export const studentJordan: TestScenario = {
  name: "Jordan - PhD Student",
  description: "Graduate student working on dissertation, feeling isolated and overwhelmed",
  context: {
    userName: "Jordan",
    workContext: `Third-year PhD student in cognitive psychology. Works from home most days.
Has ADHD, managed with a combination of medication and strategies.
The unstructured nature of dissertation work is really challenging.
Advisor is supportive but busy. Feels isolated from cohort.`,
    currentProjects: `- Dissertation chapter 2 (literature review - been stuck for months)
- Data analysis for study 1 (actually kind of enjoys this part)
- TA responsibilities for intro psych (takes up more time than it should)`,
    interests: `Board games, cooking elaborate meals on weekends,
rock climbing, podcast about history of science`,
    challenges: `- The lit review feels infinite and impossible to organize
- Imposter syndrome - feels behind compared to peers
- Hard to see progress on long-term work
- Gets lost in rabbit holes of tangentially related papers`,
    recentSessions: `**Yesterday (50 min):** Worked on data analysis.
Made good progress, found an interesting pattern in the data.
Felt excited to tell advisor about it.

**3 days ago (40 min):** Attempted lit review. Read 2 papers,
took notes, but couldn't figure out how they fit into the bigger picture.
Ended feeling stuck.

**Last week (30 min):** Organized Zotero library instead of writing.
Felt productive but also like avoidance.`,
    declaredTask:
      "Work on the literature review - write at least one paragraph synthesizing the attention studies",
    sessionDuration: "50 minutes",
    checkInFrequency: "every 25 minutes",
  },
  testQuestions: [
    "Hi. Really dreading this lit review today.",
    "I have like 50 papers and I don't know how to make them talk to each other",
    "My advisor makes this look so easy",
    "I just wrote a paragraph! It connects the Smith and Garcia findings.",
    "Wait, I should probably read that other paper first... actually no, that's a rabbit hole",
    "I'm going to stop here. Made some progress at least.",
  ],
};

/**
 * Persona 4: New user with minimal context
 * Tests: How companion handles first sessions, building rapport
 */
export const newUserSam: TestScenario = {
  name: "Sam - New User",
  description: "First-time user, minimal context shared yet",
  context: {
    userName: "Sam",
    workContext: "Works in tech, that's all they've shared so far",
    currentProjects: "Not yet shared",
    interests: "Not yet shared",
    challenges: "Not yet shared",
    recentSessions: "This is your first session together.",
    declaredTask: "Catch up on emails",
    sessionDuration: "25 minutes",
    checkInFrequency: "every 10 minutes",
  },
  testQuestions: [
    "Hey, first time using this",
    "Just need to get through my inbox",
    "This is kind of nice actually, having someone here",
    "Done with emails! That wasn't so bad.",
  ],
};

export const allScenarios: TestScenario[] = [engineerAlex, writerMaya, studentJordan, newUserSam];
