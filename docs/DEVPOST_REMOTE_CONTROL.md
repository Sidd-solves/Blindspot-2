# Remote Control AI: Devpost submission (copy-paste)

Deadline on Devpost: **Nov 5, 7:00pm CST**. The rules page said Nov 4, so aim to submit by **Nov 4** to be safe.

---

## Project name
Blindspot

## Elevator pitch (Devpost "tagline", max 200 characters)
An AI analyst for small online stores. Drop in your sales export and it finds what's quietly costing you money, proves it with real math, and tells you what to fix first.

## Description (paste into "About the project", 150–300 words)

**The problem.** Small online stores run on gut feeling. Big companies pay data teams to spot problems like lost customers, products that stopped selling, or rising returns. Small shops can't afford that, so those problems drain money quietly until it's too late.

**What Blindspot does.** You upload a sales export from Shopify, Etsy, WooCommerce, Square, Amazon, Tableau or any spreadsheet, or connect Shopify directly. In seconds Blindspot cleans the data, checks everything that matters to a shop, scans every product, customer and country for anything unusual, and ranks each problem by how much money it puts at risk. You get a health score, a "fix this first" list, a what-if simulator and a one-page report.

**How AI is used: "AI suggests, math checks."** Claude acts as the analyst you can talk to. It answers questions in plain English by calling 34 analysis tools, and it suggests new business theories worth testing. But the AI never invents a number: every theory it proposes is tested with statistics and labeled true, false or not enough evidence before you see it. That makes the AI creative and trustworthy at the same time.

**Proof it works.** We tested it on two years of real sales from a UK online shop (UCI Machine Learning Repository, over a million lines). It found a best-seller down 51% while the shop grew, and 42 top customers who had quietly stopped ordering. We re-checked seven headline numbers with separate code: all seven match.

**Built with** React, TypeScript, Node.js, Claude (Anthropic API), Claude Code, the Model Context Protocol and the Shopify Admin API. It's deployed live on Render.

---

## Built with (Devpost tags; type each one and press Enter)
react, typescript, node.js, express, claude, claude-code, anthropic, model-context-protocol, shopify, vite, tailwindcss, framer-motion, recharts, zod, render

## "Try it out" links
- Live app: https://blindspot-8lr1.onrender.com
- Code: https://github.com/Sidd-solves/BlindSpot

## Video
2–3 minutes, uploaded to YouTube as **Unlisted** (test the link in a private window before pasting).

## Team
Solo.

## If Devpost shows the optional story sections
- **Inspiration:** I run a Shopify store and never knew which numbers to worry about. Big companies have data teams to spot problems in their sales; I wanted that for small shops.
- **Challenges:** Real data is messy. Holiday rushes looked like growth until we compared with the same months last year. One mistaken giant order inflated sales and returns until we detected orders reversed within two days. The AI itself caught that returns were counted differently in two places.
- **What I learned:** An AI is most useful when it's checked. Letting it propose ideas and making code verify them gave answers I could trust.
- **What's next:** More live connectors (WooCommerce, Square, Stripe), weekly email alerts, and comparing your store with similar stores.
