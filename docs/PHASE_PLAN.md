# Blindspot: Phase Plan to a finished submission

**End result:** a complete DataNova 2026 entry (slides + live demo link + video), submitted **Nov 8** (2 days before the Nov 10 deadline), then reused for LaunchPad Hacks (Nov 20) and SafeSpace Hacks (Nov 22).

**Positioning:** Blindspot, an AI business analyst for small businesses. Connect Shopify or upload a spreadsheet. It finds what's costing you money, proves it, prices it, and tells you what to do.


## DataNova scoring → where we earn it
| Criterion | Weight | How Blindspot scores |
|---|---|---|
| Technical implementation | 25% | 30 tools, MCP server, Shopify API, live AI analyst, 183 tests, live deploy |
| Innovation & originality | 20% | "Second opinion" for small businesses; prices problems and simulates fixes |
| Problem relevance | 15% | Small businesses can't afford analysts; problems hide in their sales data |
| Data & analytical rigor | 15% | Significance-tested trends, Pareto/HHI, a validated churn model, no invented numbers |
| Impact & feasibility | 15% | Works on real Shopify data today; ~$7–25/month to run |
| Presentation | 10% | Slides, video, clear demo |

---

## Phase 0: Register (today, 20 min) · YOU
- [ ] DataNova: register on **Unstop** (from datanovathon.com) **and** click "Join hackathon" on Devpost
- [ ] LaunchPad Hacks and SafeSpace Hacks: "Join hackathon" on Devpost
- [ ] Track for DataNova: **DN-OP-01 Open Innovation**
- **Done when:** confirmation emails received

## Phase 1: Understand the product (Oct 31, 15 min) · YOU + ME
- [ ] Walkthrough of every page: what it shows, why judges care, what to say
- **Done when:** you can explain each page in one sentence

## Phase 2: Make it winning-grade (Oct 31 – Nov 3) · ME (you supply keys)

**Status (Oct 31):** done, plus more than planned: real-data case study with 4 analysis layers, AI tested live, fact check 7/7, showcase site, per-visitor sessions, 0 vulnerabilities, phone layout. Still open: real Shopify keys test (optional).
- [ ] **Churn prediction model:** predict which customers won't come back, with measured accuracy on held-out data (scores technical + rigor)
- [ ] **Your real Shopify data:** you create the Dev Dashboard app and connect it yourself; I check the insights make sense
- [ ] **Privacy mode:** mask customer names so real data can be shown safely in slides and video
- [ ] **Claude API key:** you create it and paste it into `.env` yourself (never in chat); I verify AI answers work
- [ ] Polish: phone layout, empty states, wording for store owners, remove leftover Tableau language
- [ ] Re-run the full test suite and a browser check of every page
- **Done when:** all tests pass and every page is verified with screenshots

## Phase 3: Live demo link · DONE (https://blindspot-8lr1.onrender.com)
- [ ] New GitHub repo (I push the code; you create the repo)
- [ ] Deploy on **Render** (one Node service; Vercel can't hold the server open). The public demo uses the **demo shop only**, never your real store data
- [ ] Set production secrets: BRIDGE_TOKEN, ADMIN_TOKEN, ANTHROPIC_API_KEY
- **Done when:** the live link works in a private browser window

## Phase 4: Slides (Nov 5–6) · ME builds, YOU edit
10 slides, mapped to the scoring table:
1. Title + one-line pitch
2. The problem (small businesses fly blind)
3. Who it's for (store owners, including me)
4. The solution
5. How it works (architecture, kept simple)
6. Live insights from a real store (privacy mode on)
7. Analytical rigor (significance tests, validated churn model)
8. Impact (simulator: what fixing the top problems is worth)
9. Feasibility: cost, rollout timeline, what's next
10. Validation: tests, results, honest limitations
- **Done when:** slides exported and uploaded as a shareable link

## Phase 5: Video (Nov 7, ~30 min) · YOU
- [ ] Canva screen-record of the live demo, 3–5 minutes. Script and click list come from me
- [ ] Upload to YouTube as **Unlisted**, then test the link in a private window

## Phase 6: Submit DataNova (Nov 8) · YOU, with copy-paste text from ME
- [ ] Devpost project: overview, problem, solution, tech stack, demo link, results/validation, impact, team, slides link, video link
- **Done when:** project published and confirmation received

## Phase 7: Buffer (Nov 9–10)
- Fix anything broken. Nothing new gets added.

## Extra: Remote Control AI (due Nov 4, 5pm PST)
- [ ] Join on Devpost; one-line pitch, 150–300 word description (lead with "AI suggests, math checks"), 2–3 min video, repo, tech stack, live demo link

## Extra: Next Byte Hacks V5 (due Nov 7, 4pm CST)
- [ ] Join on Devpost (students 18+, solo OK)
- [ ] 1–3 min demo video (cut from the main recording)
- [ ] 2–3 screenshots, public repo link, Devpost page (team, tools, challenges, learnings, future)

## Phase 8: Reuse (Nov 11–22)
- [ ] **LaunchPad Hacks (Nov 20):** same product; show work done Oct 16–Nov 20; Devpost page + demo
- [ ] **SafeSpace Hacks (Nov 22):** reframe as "keeping a small business financially safe" (risk alerts, loss detection); name the user, the risk and the improvement
- [ ] Use DataNova feedback to improve both

## Ground rules
- No invented numbers. Synthetic data is always labeled. Real customer data is never public.
- You paste every key and password yourself, never in chat.
- Every claim in the slides must be something the app actually does.
