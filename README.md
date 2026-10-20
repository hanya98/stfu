# STFU

**Stack your prep. Ship your progress.** A Next.js App Router application for a focused DSA preparation workspace. Brand copy and metadata are centralized in `src/lib/brand.ts`.

Onboarding preferences, the imported roadmap catalogue, and problem progress are stored in versioned browser `localStorage` records. No authentication, Supabase, calendar connection, or external data integration is configured.

The roadmap was imported from the user-provided plain-text sheet at `src/data/source/striver-sheet.txt`. The text contains 104 section/count headings and 495 ordered problem entries, including 480 Basic/Core/Pro tags and 15 contest records. It contains no problem URLs or problem-level/topic-level time estimates. The 267/495 aggregate in the source counters is retained as sheet metadata; individual problem completion cannot be reconstructed from the text and starts as unsolved personal progress. The import is not independently verified as the complete official A2Z catalogue.

The roadmap view supports the source text outline and mapped CSV imports with preview and explicit, non-destructive merging. It does not accept XLSX files because the supplied source is plain text. Imported CSV data can carry a stable source ID, external URL, duration in minutes, difficulty, and order. Missing URLs and estimates remain unavailable; users may add per-problem links and estimates from problem details. Personal status, notes, attempts, time spent, and custom estimates remain local to this browser.

## Windows setup

Install Node.js 20.9 or newer and Git. In PowerShell, run:

```powershell
cd C:\Users\hanya\planlybystrivers
npm install
npm run dev
```

Open http://localhost:3000. Stop the development server with `Ctrl+C`.

## Commands

```powershell
npm run dev       # Start local development server
npm run lint      # Run ESLint
npm run typecheck # Check TypeScript types
npm test          # Run onboarding, roadmap import/progress, persistence, and planner tests
npm run build     # Create production build
npm start         # Serve production build (after npm run build)
```

## Configuration

Copy `.env.example` to `.env.local` only when adding a future integration. The app needs no environment variables and contains no credentials. Do not commit `.env.local` or secrets. Preferences and in-progress answers are stored on this device only, and are not account-scoped or synced across devices. Earlier prototype preferences under `planly-onboarding` are migrated into the versioned record on first read.

## Production deployment

STFU uses Next.js App Router and runs on the Node.js runtime. Vercel is the recommended host because it detects Next.js builds and deploys directly from a connected Git repository. The build uses Next.js's supported Webpack builder for consistent production builds. Vercel's default Next.js output configuration is correct; no custom output directory or `vercel.json` is needed.

There are currently **no production environment variables** and no external services to configure. The included `.env.example` is informational only. Do not add credentials for integrations that are not implemented.

Important data limitation: onboarding answers, imported catalogue changes, problem progress, planner items, and sprint targets are saved in browser `localStorage`. They remain specific to that browser profile/device. A public deployment makes the app reachable, but does not create accounts, cloud backups, or cross-device synchronization. Do not enter sensitive information. Existing local data stays in the browser and is not migrated by deployment.

### Deploy with GitHub and Vercel

1. Review `git status` and create a local commit from the project directory:

   ```powershell
   git add .
   git commit -m "Prepare STFU for deployment"
   git branch -M main
   ```

2. Sign in to GitHub, create an empty repository, then connect and push it (replace the username and repository name):

   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/planlybystrivers.git
   git push -u origin main
   ```

   If `origin` already exists, inspect it with `git remote -v` and update it with `git remote set-url origin ...` instead of adding a second remote.

3. Sign in to Vercel, choose **Add New → Project**, and import the GitHub repository. Keep the project root as `.` and let Vercel detect Next.js. Use `npm install` for installation and `npm run build` for the build. Do not set an output directory or environment variables.

4. Deploy from Vercel and open the generated HTTPS URL. Verify the landing page, `/dashboard`, `/onboarding`, `/roadmap`, `/planner`, `/revision`, `/calendar`, `/analytics`, and `/settings`; visit a random path to check the branded 404 page. Mark a problem, refresh, and confirm progress persists in that same browser.

5. To use a custom domain, add it in the Vercel project's **Settings → Domains** and follow the DNS records Vercel provides. HTTPS is provisioned by Vercel after DNS verification.

Common issues: if Vercel cannot find `package.json`, set the Root Directory to the repository root. If a build fails, inspect the Vercel build log and reproduce it locally with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. A different browser or device will have separate local data by design.

## Structure

- `src/app`: landing, dashboard, onboarding, and feature routes
- `src/components`: shared shell and UI primitives
- `src/app/globals.css`: dark charcoal and emerald design tokens

The UI uses Tailwind CSS v4 in the global stylesheet and shadcn/ui-compatible styling conventions; shared primitives are intentionally small and local at this stage.
