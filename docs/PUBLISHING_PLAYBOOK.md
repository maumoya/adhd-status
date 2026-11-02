# Skill Launch Loop

A playbook for publishing any Claude Code skill so people can find it, trust it and install it.
Measured on 2026-11-01/02 against `git log`, the GitHub API, the OpenSSF Scorecard API and bestpractices.dev.
Interactive version with tick boxes (private): https://claude.ai/code/artifact/a5f9ec76-594a-4e98-894c-cce4510c6ede

**Next action:** record a 10-second demo GIF (type `STATUS`, get the table) and put it at the top of the README. See "Apply to adhd-status next", item 1.

Stars cannot be guaranteed. Everything below raises the odds that the right people see the skill and trust it enough to install it. Nothing here buys stars, and nothing here should.

---

## Part 1. What we did for adhd-status

### Where it stands (measured)

| Measure | Value | Source |
|---|---|---|
| Stars / forks | 1 / 0 | `gh repo view` |
| Latest release | v1.4.0, 2026-11-02, zip + `adhd-status-v1.4.0.intoto.jsonl` (SLSA provenance) | `gh release view` |
| OpenSSF Scorecard | **7.4** / 10 (2026-11-02) | api.securityscorecards.dev |
| OpenSSF Best Practices | **passing 100%**, silver 15%, gold 4% (project 16177) | bestpractices.dev |
| GitHub topics | 20 of 20 used | `gh repo view` |
| Evals | 6 cases in `evals/`, run with `claude plugin eval .` | repo |
| Commits on main | 18 (13 direct, then PRs #1 to #5) | `git log` |

### Timeline (from `git log`, oldest first)

| Commit | What it did |
|---|---|
| 6e1c03f | Skill, README, MIT license, example reply and eval cases |
| 169a8d0 | v1.1 plugin layout (`.claude-plugin/plugin.json` + `marketplace.json`), one task per thread, smarter compact, time estimates |
| dc557a6 | Logo, header image, badges, discovery keywords |
| 2370b21 | v1.2 hub mode: `ROADMAP.md` as the summary page of every task in flight |
| 39b61c8 | v1.3 thread closes itself with a Back to parent button; agent reads the terminal |
| 2cc7186 | One-command full-kit install |
| 70663c3, f5b0c50 | Open Source badge (OSI logo) and the Open Source · MIT mark in the banner |
| 50d8245 | Open source wording, FAQ and `llms.txt` for search and AI discovery |
| 01a7e51 | Privacy shield, privacy badge, `PRIVACY.md` |
| 120c557 | OpenSSF Scorecard workflow and badge |
| 83679ce | Author byline, `SECURITY.md`, Dependabot for actions |
| 4dd8ddb | CodeQL code scanning for workflows |
| 0260a22 (#1) | v1.4 built-in completion sweep, no companion skill to install |
| 0d0133b (#2) | Signed SLSA release provenance, "Security at a glance" README section |
| 5e475f1 (#3), 20ee8a2 (#4) | Author photo in the header; header title `maumoya/adhd-status` |
| 6ea182d (#5) | `CONTRIBUTING.md` and the Best Practices badge |

Outside git: social preview image uploaded, private vulnerability reporting turned on, Best Practices form filled to 100%.

### Scorecard 5.9 → 6.5 → 7.1 → 7.2 → 7.3 → 7.4

| Check | Score | Can we raise it honestly? |
|---|---|---|
| Code-Review | 0 | No. Needs a second human approving PRs. |
| Maintained | 0 | Yes, by waiting. The repo must be 90+ days old with steady activity. |
| Fuzzing | 0 | No. There is no executable code to fuzz. |
| Contributors | 3 | Only with real contributors from other organizations. |
| CII-Best-Practices | 5 | Yes. Silver raises it, gold maxes it. |
| Pinned-Dependencies | 7 | Capped: the SLSA generator must be referenced by tag. |
| Branch-Protection | 8 | 10 needs required reviews by 2 people. |
| Everything else | 10 | Dangerous-Workflow, Security-Policy, Dependency-Update-Tool, Binary-Artifacts, Token-Permissions, License, Vulnerabilities, SAST, Signed-Releases, CI-Tests. Packaging does not apply. |

The recap note handed over by the publishing session matches git and GitHub. One addition: Contributors scores 3, which the note did not list.

---

## Part 2. The loop, for any skill

Run it in rounds. Each round: **measure** (copy the numbers into a row of the scoreboard), **fix** the lowest item you can honestly fix, **re-measure**. Stop a round when nothing on the list moves without help from other people or time.

### Scoreboard commands (measure)

```bash
gh repo view OWNER/REPO --json stargazerCount,forkCount,repositoryTopics,description
gh api repos/OWNER/REPO/traffic/views --jq '.count, .uniques'
gh api repos/OWNER/REPO/traffic/popular/referrers --jq '.[] | "\(.count) \(.referrer)"'
curl -s https://api.securityscorecards.dev/projects/github.com/OWNER/REPO | jq '.score, (.checks[] | "\(.score) \(.name)")'
curl -s https://www.bestpractices.dev/projects/ID.json | jq '.badge_level, .badge_percentage_1, .badge_percentage_2'
```

Referrers are the most useful number: they tell you which channel actually sent people.

### 1. Images

- [ ] **Header**: a wordmark or banner that says the name and the promise in one line. Ship light and dark versions with `<picture>` and `prefers-color-scheme` (taste-skill and archify do this).
- [ ] **Social preview**: 1280×640 PNG under 1 MB, uploaded in Settings → General → Social preview. Check it by pasting the repo URL into an X or Slack draft.
- [ ] **Demo GIF**: under 10 seconds, one input and one result, under about 5 MB, first frame readable as a still. Record terminal demos with `vhs` (a scripted `.tape` file you can re-record after every release) or `asciinema` + `agg`.
- [ ] Alt text on every image: it is read by screen readers and by search and AI crawlers.

### 2. Keywords and topics

- [ ] Description (350 characters max) starts with what it is and who it is for, in the words people search: "Claude Code skill", the problem, the outcome.
- [ ] H1 and the first paragraph of the README repeat those words naturally.
- [ ] 20 topics max. Mix the platform (`claude-code`, `agent-skills`, `claude-skill`), the problem and the audience. Topics help GitHub topic pages and search; the top repos show they do not drive ranking (anthropics/skills has 1 topic, prompt-master 4).

### 3. SEO and AI-engine discovery

- [ ] `llms.txt` at the repo root: one paragraph on what it is, install command, links to the README sections.
- [ ] FAQ with real questions as headings ("Does it work with Codex?", "Does it send my data anywhere?"). Answer engines quote question/answer pairs.
- [ ] A homepage URL in the repo settings. GitHub Pages is enough; 4 of the 8 top repos run their own site. Give it Open Graph tags and the same social image.
- [ ] Listed on skills.sh (anthropics/skills shows its badge) and installable with `npx skills add OWNER/REPO` (5 of the 8 top repos document this).

### 4. Security and verification

- [ ] OpenSSF Scorecard workflow + badge.
- [ ] CodeQL (for a Markdown-only skill, scan `actions` to cover the workflows).
- [ ] All actions pinned by full commit SHA, Dependabot for `github-actions`, top-level `permissions: read-all`.
- [ ] Signed release with SLSA provenance (`slsa-github-generator`), so anyone can run `slsa-verifier` on the zip.
- [ ] `SECURITY.md` + private vulnerability reporting on. `PRIVACY.md` if the skill touches user data.
- [ ] Branch protection on `main`: PRs required, no force pushes.
- [ ] OpenSSF Best Practices: passing first. **Silver** asks for things a solo maintainer can do: a governance and roles doc, a code of conduct, a documented release process, coding standards, a DCO or similar sign-off, 2FA, and tests run in CI. **Gold** needs at least two unassociated significant contributors, two-person review on most changes and a coverage target. Do not claim gold until those people exist.

### 5. Every honest badge

A badge belongs in the README only when it shows a live measurement or a checkable fact.

| Badge | Honest when |
|---|---|
| Latest release (shields.io `github/v/release`) | Always; it links to the release notes |
| CI / evals workflow status | A workflow actually runs the tests |
| OpenSSF Scorecard | The workflow is installed |
| OpenSSF Best Practices | The form is filled; shows the real level |
| SLSA level 3 | Releases come from `slsa-github-generator` |
| CodeQL | The workflow runs |
| License | Always |
| skills.sh | The skill is listed there |
| Trendshift | Trendshift lists the repo (it adds it automatically) |
| Star History chart | Once there is a curve worth showing |

Skip "downloads" counters you cannot measure, invented ratings and "featured in" claims with no link.

### 6. Evals and tests

- [ ] `evals/` with one case per promise in the README: the input, what the reply must contain, what it must not.
- [ ] Run `claude plugin eval .` before each release and paste the pass count into the release notes.
- [ ] A CI workflow that needs no API key: validate `SKILL.md` frontmatter, the plugin JSON files, Markdown links. That gives a real CI badge and the CI-Tests check.
- [ ] A "Test it" section in the README so users can run the same evals.

### 7. Where to publish

Do these in order. Each one is a single submission; never send the same pitch twice.

| Channel | Rule to know first |
|---|---|
| Anthropic plugin directory (claude-plugins-official) | Submit through the form linked in its README (`clau.de/plugin-directory-submission`). Quality and security review. superpowers installs from it. |
| skills.sh | Make `npx skills add OWNER/REPO` work, then check the listing. |
| ComposioHQ/awesome-claude-skills (78k) | Pull request; follow its format exactly, no emojis, tested skill. |
| hesreallyhim/awesome-claude-code (57k) | **Issue form only, no PRs.** One resource at a time. Repo must be 14+ days old with ongoing commits, or have 100+ stars. adhd-status qualifies from 2026-11-15. |
| travisvn/awesome-claude-skills (16k) | Pull request, but it now requires "social proof" (stars). Submit after other channels bring some. |
| BehiSecc/awesome-claude-skills (10k) | Fork and pull request. |
| Show HN | Title "Show HN: adhd-status – …", link to the repo, first comment explains why you built it. Expect little: repo links for these skills got 2 to 3 points; an essay that teaches something does far better (see Part 3). |
| Reddit r/ClaudeAI, r/ADHD_Programmers | Read each sub's self-promotion rule first. Post the GIF and the story, answer every comment. |
| X | A 10-second video, one line, the repo link in a reply. Tag nobody who did not ask. |
| dev.to | A how-I-built-it article that teaches something (the completion sweep, the eval design). |
| Product Hunt | Last, once there is a site, a GIF and some users to show up on launch day. |

### 8. Growth levers (honest)

What moves stars, in order of how much it helped the top repos:

1. **A demo people can understand without reading.** 6 of the 8 top repos open with a picture or GIF.
2. **An existing audience.** Addy Osmani, Anthropic and obra had readers before the repo. Without one, build it slowly: write about what you learn, every week.
3. **Shipping often.** last30days has 56 releases since January; archify 23 since April. Each release is a reason to post.
4. **Social proof once it exists.** "GitHub Trending #1", Trendshift, a "What people are saying" section. Only real quotes with links.
5. **Working in more agents.** superpowers documents 12+ agents; Codex, Cursor and Gemini users widen the audience.
6. **Translations** of the README (archify 5 languages, last30days 7).

What does not work or is not allowed: buying stars, star-for-star swaps, mass DMs, posting the same link in many subs. GitHub removes fake stars and awesome-lists ban repos for it.

---

## Part 3. Lessons from the top skill repos

Stars, release counts and README contents measured with the GitHub API on 2026-11-01. HN results from the Algolia HN search API.

| Repo | Stars | Created | Releases | First screen | Install paths | Badges | Topics |
|---|---|---|---|---|---|---|---|
| obra/superpowers | 310,641 | 2025-10-09 | 16 | Text only, table of contents | 12+ agents, official marketplace | 0 | 8 |
| anthropics/skills | 186,373 | 2025-09-22 | 0 | Text, skills.sh badge | `/plugin marketplace` | 1 | 1 |
| addyosmani/agent-skills | 112,563 | 2026-02-15 | 17 | Trendshift badge, hero image, ASCII lifecycle | `/plugin`, `npx skills` | 1 | 6 |
| Leonxlnx/taste-skill | 107,793 | 2026-02-19 | 7 | Light/dark wordmark, site badges | `/plugin`, `npx skills`, `install.sh` | 12 | 11 |
| tt-a1i/archify | 92,391 | 2026-04-15 | 23 | Light/dark lockup, hero image, live gallery | `npx skills`, zip, several agents | 29 | 20 |
| mvanhorn/last30days-skill | 66,260 | 2026-01-23 | 56 | Animated GIF ad, "Trending #1" badge | `/plugin`, `npx skills` | 5 | 20 |
| virgiliojr94/book-to-skill | 36,713 | 2026-05-01 | 5 | Illustrated mascot banner | `npx skills`, several agents | 22 | 13 |
| nidhinjs/prompt-master | 15,380 | 2026-03-11 | 0 | Banner image | claude.ai zip upload first | 2 | 4 |

**obra/superpowers.** Sells a method, not a tool: "a complete software development methodology". The README is a manual with a table of contents and no images. It ranks on usefulness, install support for every agent (separate plugin folders for Codex, Cursor, Gemini, Kimi and more), a listing in Anthropic's official marketplace, a Discord, and steady releases (v7.0.1).

**anthropics/skills.** Authority: it is the reference implementation, with `spec/` and `template/` folders. 96-line README, no releases. Lesson: you cannot copy authority, but you can be listed next to it (the official directory, skills.sh).

**addyosmani/agent-skills.** A known author plus a clear model: an ASCII DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP diagram maps every slash command. Has its own site, an `evals/` folder, a "How it compares" section and 17 releases in 9 months. On HN the repo link scored 2 points; the author's blog post about it scored 376, the only big HN hit among the eight. Write the article, link the repo from it.

**Leonxlnx/taste-skill.** Owns a word: "anti-slop" (also a topic). 42 images, mostly before/after example pages, so the proof is visual. Light/dark wordmark, own domain, three install paths, a "Common Questions" section and a `tests/` folder.

**tt-a1i/archify.** The most complete storefront: hero image, live demo gallery, GIFs, 29 badges, 5 README languages, `llms.txt`, `SECURITY.md`, benchmarks, a community gallery and 20 topics. 92k stars in 6.5 months with a release every ~9 days.

**mvanhorn/last30days-skill.** Launch marketing done in the open: a GIF ad as the hero, a "GitHub Trending #1 Repository Of The Day" badge, Trendshift, 7 README languages, a "What people are saying" section, a showcase of community feeds, a data-handling section and 56 releases. Its subject (Reddit, X, YouTube research) feeds its own distribution.

**virgiliojr94/book-to-skill.** One concrete transformation in the name: book in, skill out. A mascot banner, 22 badges, an FAQ, a copyright and fair-use section that answers the obvious worry, a docs site and `evals/`.

**nidhinjs/prompt-master.** Proves a minimal repo can reach 15k: banner, a problem section, two full before/after examples and concrete counts in headings ("37 credit-killing patterns"). Install is aimed at claude.ai users (upload a zip), a bigger audience than Claude Code alone.

### Patterns across the eight

- A picture in the first screen (6 of 8). The two without one have authority instead.
- Two or more install paths, with `npx skills add` in 5 of 8.
- Frequent releases among the fastest climbers.
- Concrete numbers in headings ("All 25 Skills", "37 patterns").
- Real social proof once it exists, never before.
- Badges and topics do not predict rank (superpowers: 0 badges).
- HN was not the engine: repo links scored 2 to 3 points every time. The one hit (376) was an essay that linked the repo. Growth came from authors' audiences, X, GitHub Trending and awesome-lists.

### Apply to adhd-status next (ranked)

| # | Do | Why | Effort |
|---|---|---|---|
| 1 | Demo GIF at the top of the README: type `STATUS`, get the table and the button. Script it with `vhs`. | The single trait shared by the repos without built-in authority. The skill's value is visual. | 1 hour |
| 2 | Make `npx skills add maumoya/adhd-status` work and add it as a second install path; check the skills.sh listing. | 5 of 8 top repos offer it; reaches agents other than Claude Code. | 1 hour |
| 3 | Submit to the Anthropic plugin directory form. | Official placement is the strongest trust signal open to a solo author. | 30 min |
| 4 | Awesome lists: ComposioHQ PR now; hesreallyhim issue form on or after 2026-11-15; BehiSecc PR; travisvn after some stars. | Each list is a lasting referrer, unlike a post. | 1 hour total |
| 5 | Keyless CI workflow (frontmatter, JSON, links) + its badge; eval pass count in each release's notes. | Turns "6 evals" into a visible, checkable claim. | 1 hour |
| 6 | GitHub Pages homepage with the GIF, FAQ and Open Graph tags; set it as the repo homepage. | 4 of 8 top repos have a site; gives search and AI engines a page to cite. | 2 hours |
| 7 | Concrete numbers in README headings (for example "One table, one next step, 6 tested cases") and a before/after: a messy 40-message thread vs the 4-row board. | prompt-master and taste-skill prove the value with examples, not adjectives. | 1 hour |
| 8 | Launch posts, one per channel: r/ADHD_Programmers, r/ClaudeAI, X with the GIF, dev.to article, then Show HN. | Only after 1 to 7, so every visitor lands on a finished page. | 1 day spread over a week |
| 9 | Best Practices silver: governance and code-of-conduct docs, release process, DCO. | Scorecard CII 5 → 7 and a silver badge, all honest for a solo maintainer. | 2 hours |
| 10 | Ship a small release every 1 to 2 weeks with a `CHANGELOG.md`. | Release cadence is a pattern of every fast climber, and each release is a reason to post. | ongoing |

Not on the list: anything that fakes stars, reviewers or quotes. Code-Review, Contributors and gold stay where they are until real people join.
