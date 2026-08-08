# AGENTS.md — Working agreement for AI agents on cvtailor-saas (Tailr)

Multiple AI agents work on this repo — **Claude Code, Cursor, and ChatGPT**. These rules
keep them from colliding and protect the codebase. Every agent must read this before editing.

---

## 0. Golden rules (read these even if you read nothing else)

1. **`staging` is the active branch.** `main` = production. They diverge; port `staging → main`
   deliberately, never a blind merge.
2. **Never commit with the whole app staged as deleted.** This repo periodically ends up with
   ~180 files shown as `D` (staged delete) in `git status` while the files still exist on disk.
   Committing that wipes the app and destroys history. **If you see it, STOP and run `git reset`**
   (safe — it only unstages; touches no files).
3. **One source of truth for what's in flight:** `docs/PROJECT.md` + the Notion "Tailr — Product
   Board". Update both when you start and finish work.

---

## 1. Before you start any task

- `git fetch` and check `git status`.
- If ~180 files show as staged deletions → `git reset`, then re-check (see Golden Rule 2).
- Read the **"In progress"** section of `docs/PROJECT.md` so you don't touch files another agent owns.
- Don't start editing files that already show uncommitted changes from another agent unless you're
  continuing that exact task.

## 2. Git hygiene

- **Big updates get a feature branch.** Never have two agents editing `staging` at the same time.
- **Commit small, push often** so the other agents rebase instead of colliding.
- **Never `git add . && git commit` blindly** — review `git status` first. `Marketing/` (marketing
  assets, untracked, not gitignored) must not get swept into code commits unintentionally.
- **`index.lock` / "another git process is running":** check `ps aux | grep '[g]it'`. If the only
  live processes are read-only `git status`/`git diff` pollers (the IDE's source-control panel) and
  the lock is old, it's stale — `rm -f .git/index.lock`. If a real `commit`/`rebase`/`merge` is
  running, **wait**; don't remove an active lock.
- End commit messages with a `Co-Authored-By:` line identifying your agent.

## 3. Staging-first + database

- Test on **staging** (isolated Supabase project + branch-scoped Vercel env). Verify before porting
  to production.
- Any DB change is a **migration file**, applied to staging first. Keep `schema.sql` in sync.
- **Do not merge career-memory / career-path work to `main` until the user has fully tested it**
  (standing instruction).

## 4. Secrets & PII (hard stop)

- Never commit secrets, API keys, or `.env*` values.
- Never paste real user PII into prompts, commits, or logs.

## 5. Tracking (do this every time)

- A big update = **a card on the Notion board AND a row in `docs/PROJECT.md`, created before code.**
- Move it to **Shipped** with the PR link when it merges. Keep the two mirrors in sync.

## 6. Division of labor (suggested, not rigid)

- **Cursor / ChatGPT** — fast in-IDE edits, single-file iterations, quick fixes.
- **Claude Code** — planning big updates, multi-file/agentic changes, migrations, end-to-end
  verification, and marketing assets.
- Whoever picks up a big update owns its branch + its tracking card until it ships.

## 7. Definition of done

Code compiles/builds, verified on staging, tracking card + `PROJECT.md` updated, PR opened. Don't
report something as done that hasn't been run.
