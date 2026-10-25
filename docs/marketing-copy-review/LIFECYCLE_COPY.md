# Lifecycle, Email, Onboarding, and Submission Copy

> **10 September update:** the welcome email no longer claims a “growing community” or promises that nothing gets lost. Remaining email delivery, authorization, deduplication and live-render QA stay open.

## Welcome email (`supabase/functions/send-welcome-email/index.ts`)

Subject: Welcome to Your Own World ✍️

Primary headings:

- Welcome
- Your world is ready.

Current proposition: the recipient has joined a growing community of writers, worldbuilders, and storytellers; YOW provides one place for writing and worldbuilding. The email presents the active project formats and suggests building locations, factions, characters, lore, and a manuscript.

[REVIEW] “Growing community” implies social proof; keep only if supportable. Ensure the email does not promise player/community/collaboration features. There are multiple welcome invocation paths; deduplicate technically before copy QA.

## Password-reset email (`supabase/functions/send-reset-email/index.ts`)

Subject: Reset your Your Own World password

Current body: states a reset was requested for the submitted email, provides a reset CTA, and says the message can be ignored if not requested.

Copy fixes to consider:

- “Reset your Your Own World password” is grammatically awkward; use “Reset your YOW password” or “Reset your Your Own World account password.”
- Avoid echoing the email address into HTML unless escaped.
- State link expiry if the actual Supabase link expiry is known and tested.

## Re-engagement variants (`supabase/functions/send-reengagement-email/index.ts`)

Current subjects/headings/body themes:

1. Subject: Not sure where to start?  
   Heading: Two easy ways in. Zero Pressure.  
   Blank project or sample world; claims a working writing space in under a minute.

2. Subject: We’ve got your world, you’ve got the ideas  
   Heading: You’ve already started your world.  
   Encourages one more small item and says YOW improves as connected content accumulates.

3. Subject: Projects don’t need to be polished  
   Heading: A project can start with just a title and an idea.  
   Encourages a small start or sample-world exploration.

4. Subject: Add the next scene, even as a rough note  
   Heading: Capture what happens next while it is still close.  
   Encourages a rough scene rather than polished drafting.

5. Subject: Feeling blocked? We’ve got you  
   Heading: The fastest way to understand it is to open the sample world.  
   Explains the populated sample and a path to a personal project.

6. Subject: Make the next step visible  
   Heading: Even a fragment keeps a world alive.  
   Encourages scene, character, location, lore, or outline fragments.

Every email links to YOW and includes “Stop reminder emails.”

[SECURITY/COPY] The audience/stage is chosen by `api/send-reengagement-emails.js`. Copy approval is not sufficient until the cron fails closed, delivery is idempotent, opt-out is signed, and link scanners cannot unsubscribe users.

## Paid-interest email (`api/register-paid-interest.js`)

Admin subject: `[YOW Interest] <plan label>`

The route sends plan/user details to the owner and, for an authenticated user, currently grants Beta Tester entitlement. The customer-facing modal should distinguish clearly among:

- expressing interest;
- joining a beta;
- reserving Founder availability;
- entering a waitlist;
- purchasing a plan.

These are currently too easy to conflate. Interest must not be represented as a reservation or purchase unless the server creates that durable record.

## Feedback/help (`src/components/help/HelpContact.jsx`, `api/submit-feedback.js`)

Surfaces include help questions, feedback, and feature requests with follow-up email. Review consent/expectation wording for:

- whether a reply is guaranteed;
- what account/project context is sent;
- whether manuscript content is ever included;
- response times;
- retention/deletion of feedback records and email copies.

## Unsubscribe page (`api/reengagement-unsubscribe.js`)

Success: Done. You will not receive any more reminder emails. Your account and everything in it are unaffected.

Errors explain that the link is incomplete or the request could not be processed.

[REVIEW] This promise is appropriately narrow, but the raw UUID GET link is unsafe. Once signed action tokens exist, preserve a confirmation page that is resistant to automatic link scanners.

## Onboarding (`WelcomeWizard.jsx`, `OnboardingTour.jsx`, `tourDefinitions.js`)

Review these as marketing copy because they establish the first product promise after signup:

- “Tour with a sample” versus “Start my own project”
- first-project title, type, and target language
- AI setup invitation and “Maybe later” behavior
- sample-world completeness and editability
- section-tour explanations for Library, Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline
- cross-device “seen” behavior

Every tour statement should name what exists now, avoid “players can see/discover” language, and avoid implying all AI context is automatic.

## Beta/legal lifecycle sources

- `BetaBanner.jsx`: beta state and paid-interest CTA
- `LegalModal.jsx`: privacy, terms, ethics, beta, cookie/storage, retention, AI and ownership statements
- `public/beta-disclaimer/index.html`: standalone beta disclosure
- `CloudExpiryWarningModal.jsx`: expiry, renewal, Local/Free fallback, export-all
- Account deletion in `AccountSettings.jsx`: deletion scope and finality

These sources must be reviewed together. A banner cannot cure a specific false paid promise elsewhere.


## Launch email to existing Beta testers (draft, 25 Oct 2026 — owner to edit and approve; nothing is sent)

Send from support@yourownworld.co.uk, on launch day, after the Beta notice date has been stamped (so the end date below is true). Dates assume the notice starts 1 Nov 2026 09:00 UTC; change both if the stamp time changes.

**Subject:** YOW is launching: what happens to your Beta access

Hi {{first_name or "there"}},

Thank you for testing Your Own World. Your feedback shaped what it is today, and I wanted you to hear this from me first: YOW is launching, and the Beta is closing.

**What this means for you**
- You keep full web access to YOW, with every feature, until **1 December 2026**. Nothing changes for you today.
- Desktop app downloads are not part of the Beta notice period; they come with Lifetime.
- On 1 December your account moves to the Free plan unless you upgrade. Free keeps one project editable. Your other projects are not deleted: you can still open them, read them and export them.

**Plans**
- **Free**: one editable project, no card needed.
- **Monthly, £10**: complete browser access with Cloud sync. Cancel any time.
- **Lifetime, £75 once**: permanent desktop and offline access, with a year of YOW Cloud included.
- **Founding Lifetime, £50 once** (first 100 customers only): everything in Lifetime, two years of Cloud included, and permanent Founder status.
- Cloud after the included period is an optional £6 a year.

Every purchase has a 14-day cooling-off period: email support@yourownworld.co.uk within 14 days of buying for a full refund. After 14 days there are no refunds.

**Before 1 December**
1. Download a backup of your projects (Account Settings, then export) so you have a copy you control.
2. If you want to keep editing everything, pick a plan at www.yourownworld.co.uk/pricing/.

If anything looks wrong, or you have a question, just reply to this email. I read every one.

Thank you again,
Morgan
Your Own World
