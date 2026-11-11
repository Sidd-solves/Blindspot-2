import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import {
  BookOpen,
  Download,
  FileText,
  Flag,
  Printer,
  RefreshCw,
  Rocket,
  Target,
  TrendingUp,
} from 'lucide-react';
import { tool, usd, pct, SEV, evidenceText } from '../api';
import { useStore } from '../store';
import { Card, CardHead, Chip, CountUp, Loading, Markdown, stagger } from '../components/ui';

const download = (name: string, text: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};
const PHASE_STYLE = [
  { c: 'var(--rose)', icon: Flag },
  { c: 'var(--amber)', icon: Target },
  { c: 'var(--emerald)', icon: Rocket },
];
const TOPIC_STYLE: Record<string, { c: string; label: string }> = {
  issue: { c: 'var(--rose)', label: 'Problem found' },
  watch: { c: 'var(--amber)', label: 'Worth watching' },
  partial: { c: 'var(--sky)', label: 'Partly checked' },
  clear: { c: 'var(--emerald)', label: 'No problem' },
  'not-enough': { c: 'var(--amber)', label: 'Not enough data' },
  'not-in-data': { c: 'var(--faint)', label: 'Not in your data' },
};

export default function Reports() {
  const { version, dataset, dash } = useStore();
  const [rep, setRep] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [showMd, setShowMd] = useState(false);
  const gen = async () => {
    setBusy(true);
    const r = await tool('generate-executive-summary');
    setRep(r.data);
    setBusy(false);
  };
  useEffect(() => {
    gen();
  }, [version]);
  const docs = async () => {
    const r = await tool('generate-documentation');
    if (r.ok) download(r.data.filename, r.data.content);
  };
  if (!rep)
    return (
      <Loading
        steps={['Ranking findings…', 'Pricing recommendations…', 'Modelling scenario…', 'Writing summary…']}
      />
    );
  const kpis = dash?.kpis ?? [];
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={gen} disabled={busy}>
          <RefreshCw size={13} className={busy ? 'spin' : ''} />
          Regenerate
        </button>
        <button
          className="btn"
          onClick={() =>
            download(`blindspot-executive-summary-${new Date().toISOString().slice(0, 10)}.md`, rep.markdown)
          }
        >
          <Download size={13} />
          Markdown
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={13} />
          PDF
        </button>
        <button className="btn" onClick={docs}>
          <BookOpen size={13} />
          Documentation
        </button>
        <button className="btn" onClick={() => setShowMd(!showMd)}>
          <FileText size={13} />
          {showMd ? 'Report view' : 'Raw Markdown'}
        </button>
        <span className="ml-auto text-[11px] text-[var(--faint)]">{dataset?.label}</span>
      </div>
      <div className="no-print text-[12px] text-[var(--muted)]">
        A one-page summary of your business you can send to a partner, investor or boss: what's wrong, what it
        costs, and what to do, in order. Download it as Markdown or save it as a PDF.
      </div>

      {showMd ? (
        <Card hover={false} className="p-5">
          <Markdown text={rep.markdown} />
        </Card>
      ) : (
        <Card c="var(--sky)" hover={false} className="print-full p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="label">Executive summary · {new Date().toLocaleDateString()}</div>
              <h2 className="mt-1 text-[20px] font-extrabold tracking-tight">{dataset?.name}</h2>
              <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                {dataset?.rows.toLocaleString()} rows analyzed · figures computed deterministically ·
                scenarios hypothetical
              </div>
            </div>
            <div className="flex gap-2">
              {kpis.slice(0, 3).map((k, i) => (
                <div
                  key={k.label}
                  className="tint rounded-lg px-3 py-2"
                  style={{ '--c': ['var(--violet)', 'var(--emerald)', 'var(--cyan)'][i] } as CSSProperties}
                >
                  <div className="label">{k.label}</div>
                  <CountUp
                    value={k.value}
                    format={(n) =>
                      k.format === 'pct'
                        ? pct(n)
                        : k.format === 'int'
                          ? Math.round(n).toLocaleString()
                          : usd(n, true)
                    }
                    className="text-[16px] font-semibold"
                  />
                </div>
              ))}
            </div>
          </div>

          <h3
            className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[.1em]"
            style={{ color: 'var(--rose)' }}
          >
            Top 3 findings
          </h3>
          <div className="grid gap-2 md:grid-cols-3">
            {rep.topFindings.map((f: any, i: number) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className="tint rounded-xl p-3"
                style={{ '--c': SEV[f.severity].c } as CSSProperties}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="mono grid h-6 w-6 place-items-center rounded-lg text-[12px] font-bold text-white"
                    style={{ background: SEV[f.severity].c }}
                  >
                    {i + 1}
                  </span>
                  <Chip c={SEV[f.severity].c}>{SEV[f.severity].label}</Chip>
                  <span className="ml-auto text-[11px] font-semibold text-[var(--muted)]">
                    {evidenceText(f)}
                  </span>
                </div>
                <div className="mt-2 text-[12.5px] font-extrabold leading-snug">{f.title}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{f.explanation}</div>
                {f.impactUsd && (
                  <div className="mono mt-2 text-[13px] font-semibold" style={{ color: SEV[f.severity].c }}>
                    {usd(f.impactUsd)}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <h3
            className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[.1em]"
            style={{ color: 'var(--emerald)' }}
          >
            Priority recommendations
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wider text-[var(--faint)]">
                  <th className="pb-1.5 font-bold">Action</th>
                  <th className="pb-1.5 font-bold">Effort</th>
                  <th className="pb-1.5 text-right font-bold">Benefit</th>
                  <th className="hidden pb-1.5 pl-3 font-bold md:table-cell">Risk</th>
                </tr>
              </thead>
              <tbody>
                {rep.recommendations.map((r: any, i: number) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="border-t"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <td className="min-w-[150px] py-2 pr-3 font-bold">{r.intervention}</td>
                    <td>
                      <Chip
                        c={
                          r.effort === 'low'
                            ? 'var(--cyan)'
                            : r.effort === 'medium'
                              ? 'var(--amber)'
                              : 'var(--rose)'
                        }
                      >
                        {r.effort}
                      </Chip>
                    </td>
                    <td
                      className="mono min-w-[110px] py-1.5 pl-2 text-right font-semibold md:min-w-[190px]"
                      style={{ color: 'var(--emerald)' }}
                    >
                      {r.expectedBenefitUsd ? (
                        <>
                          {usd(r.expectedBenefitUsd)}
                          <span className="ml-1 text-[11px] font-bold uppercase text-[var(--faint)]">
                            {r.benefitKind}
                          </span>
                          {r.recoveryPct != null && (
                            <div className="font-sans text-[11.5px] font-medium leading-snug text-[var(--muted)]">
                              assumes {r.recoveryPct}% recovered
                              {r.benefitPeriod ? ` · ${r.benefitPeriod}` : ''}
                              {(r.parts?.filter((x: any) => x.benefit !== null).length ?? 0) > 1 && (
                                <>
                                  {' '}
                                  · largest of {r.parts.filter((x: any) => x.benefit !== null).length}{' '}
                                  estimates, not added
                                </>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] font-bold text-[var(--faint)]">not estimated</span>
                      )}
                    </td>
                    <td className="hidden pl-3 text-[11px] text-[var(--muted)] md:table-cell">{r.risks}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3
            className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[.1em]"
            style={{ color: 'var(--blue)' }}
          >
            Every topic checked
          </h3>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {(rep.topics ?? []).map((t: any, i: number) => (
              <motion.div
                key={t.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
                className="rounded-lg p-2"
                style={{ background: 'var(--line)', borderLeft: `3px solid ${TOPIC_STYLE[t.status].c}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-extrabold">{t.label}</span>
                  <Chip c={TOPIC_STYLE[t.status].c}>{TOPIC_STYLE[t.status].label}</Chip>
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--muted)]">{t.note}</div>
              </motion.div>
            ))}
          </div>

          <h3
            className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[.1em]"
            style={{ color: 'var(--violet)' }}
          >
            Your roadmap
          </h3>
          <div className="relative grid gap-3 md:grid-cols-3">
            <motion.div
              className="absolute left-0 right-0 top-[15px] hidden h-[3px] origin-left rounded-full md:block"
              style={{ background: 'linear-gradient(90deg, var(--rose), var(--amber), var(--emerald))' }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.2, delay: 0.3 }}
            />
            {(rep.roadmap ?? []).map((p: any, i: number) => {
              const st = PHASE_STYLE[i];
              return (
                <motion.div
                  key={p.when}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.2 }}
                  className="relative"
                >
                  <span
                    className="relative z-10 grid h-8 w-8 place-items-center rounded-full"
                    style={{ background: st.c, boxShadow: `0 0 0 4px var(--panel-solid), 0 0 16px ${st.c}` }}
                  >
                    <st.icon size={14} color="white" />
                  </span>
                  <div
                    className="mt-2 text-[11.5px] font-bold uppercase tracking-wider"
                    style={{ color: st.c }}
                  >
                    {p.when}
                  </div>
                  <div className="text-[13px] font-extrabold">{p.title}</div>
                  {p.items.length ? (
                    <ul className="mt-1 space-y-1">
                      {p.items.map((it: string) => (
                        <li key={it} className="text-[11.5px] leading-snug text-[var(--muted)]">
                          • {it}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-[11.5px] text-[var(--faint)]">
                      Nothing urgent in this phase.
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <h3
            className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[.1em]"
            style={{ color: 'var(--amber)' }}
          >
            What fixing it could be worth (estimate)
          </h3>
          <div
            className="tint grid gap-3 rounded-xl p-3 md:grid-cols-[auto_1fr]"
            style={{ '--c': 'var(--amber)' } as CSSProperties}
          >
            <div>
              <div className="label flex items-center gap-1">
                <TrendingUp size={11} />
                Illustrative scenario
              </div>
              <div className="mono text-[20px] font-semibold" style={{ color: 'var(--emerald)' }}>
                +{usd(rep.scenario.delta.profit)}
              </div>
              <div className="text-[11.5px] text-[var(--muted)]">churn −5%, opex −8%</div>
            </div>
            <div className="space-y-0.5">
              {rep.scenario.formulas.map((f: string) => (
                <div key={f} className="mono text-[11.5px] text-[var(--muted)]">
                  {f}
                </div>
              ))}
              <div className="pt-1 text-[11.5px] text-[var(--faint)]">{rep.scenario.disclaimer}</div>
            </div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
