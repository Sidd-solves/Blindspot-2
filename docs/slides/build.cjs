const pptxgen = require('pptxgenjs');
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.title = 'Blindspot: the AI analyst for small online stores';
const notes = [
  "Hi, this is Blindspot: an AI analyst for small online stores. It shows you what your sales data is hiding. The live demo is at blindspot-8lr1.onrender.com.",
  "The problem: small shops fly blind. Totals hide problems, a data analyst costs $70K+ a year, and dashboards show what happened but not why.",
  "Here's proof totals lie. In a real UK online shop, sales were up 5%, but its best-selling product was down 51%, 42 of its best customers quietly stopped buying (about £300K a year), and fewer new customers came back. Blindspot found all of this.",
  "Blindspot does it in seconds: upload your data, it cleans it, finds the problems, proves them with statistics, and tells you what to fix first, ranked by money.",
  "Step one: any file, any store. CSV, Excel or PDF, from Shopify, Etsy, Amazon, Square, WooCommerce, Stripe or Tableau, in any language. And it shows exactly how it read every column and every row, with line numbers.",
  "Step two: the dashboard. Every problem is ranked by the money at stake, with a 0 to 100 health score, a comparison with the same months last year, and a clear 'fix this first'.",
  "How it uses AI: AI suggests, math checks. You ask in plain English, Claude calls 34 analysis tools, and it proposes new ideas, but every idea is tested with statistics before you see it. The AI never invents a number.",
  "Step three: decide what to fix. A risk map by money and confidence, a what-if simulator for profit, and a one-page report with a 30, 90 and 180-day roadmap.",
  "How it's built: a React and TypeScript front end, a Node server on Render, my own math engine kept separate from the AI so results are fast, free and repeatable, and Claude with 34 typed tools, also available over MCP.",
  "Proof, not promises: 7 of 7 headline numbers match an independent Python check, 155 automated tests pass, test files from 5 platforms come out within 5 cents of the true totals, and a million rows take about 6 seconds.",
  "It's private, safe and responsible: read-only Shopify access, keys never stored, each visitor's data private, the AI never calculates numbers, and the data license and open-source tools are credited.",
  "Challenges: messy real data, including an 80,995-unit mistaken order; holidays that faked growth; PDFs that don't store tables; and a tiny free server. The AI even caught bugs in my own math.",
  "What I learned: AI is best when it's checked, real data beats demo data, showing your work builds trust, and you should test with the ugliest files you can find.",
  "I built this solo. I run a Shopify store, so I built the tool I needed. Here are the tools I used: React, TypeScript, Node, Claude, the Shopify API and more.",
  "It's ready today: connect Shopify live, upload any file in any language, and see every amount in 30 currencies. Try it live: scan the code or go to blindspot-8lr1.onrender.com. Thank you!",
];
for (let i = 1; i <= 15; i++) {
  const s = pres.addSlide();
  s.background = { color: '05060F' };
  s.addImage({ path: `jpg/slide-${String(i).padStart(2, '0')}.jpg`, x: 0, y: 0, w: 10, h: 5.625, altText: `Blindspot slide ${i}` });
  s.addNotes(notes[i - 1]);
}
pres.writeFile({ fileName: 'Blindspot_deck.pptx' }).then((f) => console.log('wrote', f));
