# The interview phase — batch scheduling

_Ose's spec, 10 September 2026, recorded verbatim in intent. The phase begins
the moment a submission reaches the client._

> **The core UX promise:** choose who you want to interview, approve your
> availability once, and Tailr coordinates the rest.

The framing that makes the rest follow: **this is one batch scheduling
workflow, not ten to twenty separate ones.**

## The workflow

`Agent shortlist → Client review → Interview cohort → Availability once → Candidate self-booking → Interview tracking`

1. **Client reviews the recommended candidates.** One decision each:
   interview, hold, decline. A persistent action bar carries the count and
   the act ("6 candidates selected · Invite to interview"). Nobody is
   scheduled individually at this point.
2. **Tailr creates an interview round** by asking for the RULES, never
   appointments: interview type, duration, interviewer, location (Meet,
   Teams, Zoom, phone), date range, minimum notice, buffer between
   interviews, maximum interviews per day, rescheduling policy. Saveable as
   a reusable **interview template**.
3. **The hiring manager gives availability once.** Three routes: connect a
   calendar (recommended), add blocks by hand, or delegate to another
   interviewer. With a calendar, Tailr reads free/busy only and proposes
   windows; the manager approves or edits them rather than clicking dozens
   of slots.
4. **Tailr validates capacity before invitations go out**: candidates being
   invited, valid slots, spare buffer, timezone problems, days over the
   manager's limit. Twelve candidates against seven slots must not proceed
   without a clear warning.
5. **Candidates self-schedule** from a branded link showing only times still
   open, in their own timezone. On booking: the slot disappears for
   everyone else, the calendar event is created, video details are
   generated, both sides are confirmed, status becomes *Interview booked*.
6. **One scheduling dashboard for the client**, the whole cohort in a table:
   candidate, scheduling status, interview, action.

**Statuses:** Selected → Invitation sent → Booked → Confirmed → Interview
complete → Feedback due.
**Exceptions:** No response · No suitable time · Cancelled · Rescheduling.

**Invitation waves.** For ten to twenty recommended candidates: invite the
strongest five, hold the next five in reserve, release wave two after 48–72
hours or when capacity opens. It stops twenty people racing for eight slots
and stops Tailr inviting someone it cannot actually seat. If the client
genuinely wants all twenty, Tailr should recommend more interviewers with
round-robin assignment, dedicated interview blocks, and a higher
slot-to-candidate ratio.

**Prior art Ose cited:** Greenhouse self-scheduling (candidates pick from
open times on connected interviewer calendars, including groups); Ashby
scheduling defaults (reusable buffers, reminders, rescheduling rules);
Calendly round-robin (bookings distributed across an available pool).

## MVP scope, as specified

In: bulk selection · one interviewer per interview · Google/Microsoft
calendar connection · free/busy scanning · manual availability fallback ·
duration, buffers, notice period and daily caps · capacity warning ·
candidate self-booking · confirmation, reminder and rescheduling · cohort
scheduling dashboard.

Deferred: panel interviews · calendar intersection across several
interviewers · round-robin pools · automatic interviewer replacement.

## What already exists (10 Sep 2026)

Much of the MVP list shipped on 5 September. Honest state:

| Spec item | State |
|---|---|
| Client selects candidates in bulk | **Partly.** `/hiring/roles/:id/interviews` step 1 offers interview / not-for-this-role. Needs *hold* as a third decision and the persistent action bar with the count. |
| One interviewer per interview | **Built.** Rounds carry interviewers. |
| Google/Microsoft calendar connection | **Built.** OAuth, sealed tokens, `public.calendar_connections`. |
| Free/busy scanning | **Built.** Google freeBusy; Graph calendarView selected to start/end/showAs. No event content is ever read. |
| Manual availability fallback | **Built.** Propose windows across a chosen date range with no calendar. |
| Duration, buffers, notice, daily caps | **Partly.** `proposeWindows` takes duration, buffer, working hours and a per-day cap as arguments; none of them is stored, none is a rule the product enforces, and minimum notice does not exist. |
| Capacity warning | **Not built.** |
| Candidate self-booking | **Different.** The booking doorway exists, but it confirms a slot *the recruiter chose*. The spec has candidates pick from the open pool. |
| Confirmation | **Built.** Confirm/decline plus an .ics attachment. |
| Reminder, rescheduling | **Not built.** |
| Cohort scheduling dashboard | **Not built.** |
| Invitation waves | **Not built.** |
| Video call link generation | **Not built.** |
| Delegate availability to another interviewer | **Not built.** |

## Both conflicts settled (11 Sep 2026, Ose)

1. **Candidates self-book.** "Candidates self-book, and the recruiter should
   just have visibility of what's been booked." The recruiter no longer
   seats anyone; they watch the board fill. §5.4/§5.5 is amended by this.
2. **"Interview cohort"** is the term for the subset the client chooses.
   "Recommended candidates" is dropped — `role_recommendations` already
   means a role recommended *to a person*, and the shortlist stays the
   shortlist.

_The original statement of both, kept because the reasoning still explains
the shape of what was built:_

## Two conflicts to settle before they are built

**1. Who books — this reverses a settled decision.** The client-actor model
agreed on 13–14 August (schema §5.4/§5.5) says: *the recruiter owns the
process; the hiring manager offers availability from their diary, the
recruiter books rounds, the hiring manager decides.* Candidate
self-booking moves the booking act from the recruiter to the candidate. It
is a better fit for batch scheduling and it removes recruiter work, but it
is a deliberate reversal, not an addition, and the recruiter's control over
who is seated when is what goes.

**Note the mechanism already supports it.** Double-booking is prevented by a
partial unique index on `interview_rounds.slot_id`, not by the recruiter
being the only actor — so "the slot disappears for everyone else" is already
true at the database level whoever claims it.

**2. "Recommended candidates" collides with an existing noun.** Consumer-side,
`role_recommendations` means *a role recommended to a person* — the quiet
matching direction. Using "recommended candidates" for *people recommended
to a client* points the same word in the opposite direction. The repo has a
scar here: "shortlist" is reserved because it is both a decision value and
the client-facing deliverable, and reusing it cost a rename plan.
Alternatives that do not collide: **proposed candidates**, **submitted
candidates** (matches the existing submission), or keeping the deliverable
"shortlist" and naming only the chosen subset the **interview cohort**.

"Interview cohort" itself is clean and does not collide with anything.

## Build order

Foundation first, because everything downstream reads it:

1. **Interview rules** as a stored object per round, plus the reusable
   template. Feeds proposal, capacity and self-booking alike.
2. **Capacity validation** against those rules, surfaced before invitations
   go out.
3. **Hold**, the persistent action bar, and the cohort vocabulary.
4. **The cohort dashboard** for the client.
5. **Self-booking from the open pool** — after conflict 1 is settled.
6. **Reminders, rescheduling, video links, waves.**
