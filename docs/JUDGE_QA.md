# Judge Q&A cheat sheet

Short answers in plain words. Learn the idea, not the exact sentence.

## The idea
**1. What is Blindspot, in one sentence?**
An AI analyst for small businesses: you connect your Shopify store or drop in a spreadsheet, and it finds what's quietly costing you money, proves it with real numbers, and tells you what to fix first.

**2. What problem does it solve?**
Small shops run on gut feeling. Big companies pay data teams to find problems like lost customers, products that stopped selling, or returns piling up. Small shops can't afford that, so those problems slowly drain money until it shows up in the totals, and by then it's too late.

**3. Who is it for?**
Small online store owners, especially on Shopify. I run a Shopify store myself, which is why I built it.

**4. Why not just use a dashboard or Shopify's own reports?**
Dashboards show what happened. You still have to spot the problem yourself. Blindspot does the hunting: it checks each sizeable product and country plus your best customers, tells you which problems hold up statistically, and what each one costs.

## How it works
**5. How does it find problems?**
Four steps. First it cleans the data (duplicates, returns, fees). Then it checks the things that matter to shops, like returns and lost customers. Then it scans each product and country, comparing each one with the business as a whole. Finally it tests business ideas with statistics and says supported, not supported, or not enough evidence.

**6. How do you avoid false alarms?**
Two rules. We compare with the same period last year, so a holiday rush never looks like growth. And a drop only counts if it passes a statistical test, so random ups and downs aren't reported.

**7. What does the AI do, and what doesn't it do?**
The AI explains results in plain English, answers questions, and suggests ideas worth testing. It never makes up numbers. Every number comes from calculations, and every AI idea gets tested by the math before it's shown.

**8. Is it fast?**
A million real sales in about 6 seconds. A normal store's data takes a second or two.

## Evidence
**9. How do you know the numbers are right?**
We recalculated seven headline numbers with completely separate code, written independently. All seven match exactly.

**10. What data did you test on?**
A real UK online gift shop: over a million sales across two years, published by the UCI Machine Learning Repository, a university data archive. It's messy like real shops are, with returns, duplicates and missing customers.

**11. What did it find?**
A best-selling product down 51% while the shop grew 5%. 42 of the best customers had stopped ordering, worth about £300K a year. New customers were coming back less, 49% down to 40%. And growth was coming from old customers while new-customer revenue fell, which you'd never see in the totals.

**12. Did anything go wrong while building?**
Yes, and it's a good story. While testing, the AI itself spotted two mistakes in our math: returns were counted differently in two places, and one giant mistaken order was inflating both sales and returns. We fixed both and re-ran the fact check.

## Feasibility
**13. How much does it cost to run?**
It runs on one small server. The analysis needs no AI at all, so it's essentially free per store. AI is only used when someone chats with it, at a fraction of a cent per question.

**14. Is my data safe?**
Shopify access is read-only, so it can never change your store. Keys are used once and thrown away. Each visitor's data is private and isn't stored.

**15. What's next?**
More connectors (WooCommerce, Square, Stripe), weekly alerts by email, and comparing your store with similar stores.

## About building it
**16. How did you use AI to build it?**
I used Claude Code as a coding partner. I made the product decisions: focusing on small businesses, Shopify, the design, what to test and which problems mattered. The AI helped write and debug the code, and we disclose that openly.

**17. Where did the idea come from?**
I run a Shopify store and never knew which numbers to worry about. Big companies pay data teams to find problems in their sales; I wanted that for small shops, and I wanted every number to be provable.
