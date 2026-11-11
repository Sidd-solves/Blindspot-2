import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties } from 'react';
import { Copy, Eye, ImageUp, Palette, Plus, ScanEye, Star, Wand2, X, Check } from 'lucide-react';
import { simulateCvd, hexToRgb, rgbToHex } from '@blindspot/analytics';
import { tool } from '../api';
import { Card, CardHead, Chip, CountUp, Empty, Loading, Meter, Ring, Tabs, stagger } from '../components/ui';

const FLAWED = {
  charts: [
    {
      id: 'Revenue by Region',
      type: 'bar',
      title: 'Revenue by Region',
      yAxisStartsAtZero: false,
      hasAxisLabels: true,
      colors: ['#e41a1c', '#4daf4a'],
    },
    { id: 'Category mix', type: 'pie', slices: 9 },
    { id: 'Profit vs Sales', type: 'line', title: 'Profit vs Sales', dualAxis: true, hasAxisLabels: false },
    {
      id: 'Sub-category detail',
      type: 'bar',
      title: 'Sub-category',
      series: 12,
      colors: ['#ffff99', '#ffffcc'],
    },
  ],
  kpiCount: 0,
  minFontPx: 9,
  hasFilters: false,
};
const AREA: Record<string, string> = {
  'chart-integrity': 'var(--rose)',
  hierarchy: 'var(--violet)',
  accessibility: 'var(--cyan)',
  labels: 'var(--amber)',
  color: 'var(--fuchsia)',
};
const SEVC: Record<string, string> = { high: 'var(--rose)', medium: 'var(--amber)', low: 'var(--sky)' };

function DesignAudit() {
  const [target, setTarget] = useState<'flawed' | 'blindspot'>('flawed');
  const [res, setRes] = useState<any>(null),
    [crit, setCrit] = useState<any>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      setBusy(true);
      setRes(null);
      let spec: any = FLAWED;
      if (target === 'blindspot') {
        const d = await tool('build-dashboard', { title: 'Blindspot Overview' });
        spec = {
          charts: d.data.charts.map((c: any) => ({
            id: c.id,
            type: c.type,
            title: c.title,
            yAxisStartsAtZero: true,
            hasAxisLabels: true,
          })),
          kpiCount: d.data.kpis.length,
          minFontPx: 11,
          hasFilters: true,
        };
        await tool('clear-canvas');
      }
      const [a, c] = await Promise.all([
        tool('audit-dashboard-quality', { spec }),
        tool('analyze-iron-viz-style', { spec }),
      ]);
      setRes(a.data);
      setCrit(c.data);
      setBusy(false);
    })();
  }, [target]);
  const grade = res?.grade ?? '-';
  const gc =
    grade === 'A'
      ? 'var(--emerald)'
      : grade === 'B'
        ? 'var(--cyan)'
        : grade === 'C'
          ? 'var(--amber)'
          : 'var(--rose)';
  return (
    <Card c="var(--amber)" hover={false} className="lg:col-span-7">
      <CardHead
        icon={<ScanEye size={13} />}
        title="Dashboard quality audit"
        c="var(--amber)"
        right={
          <span className="text-[11px] text-[var(--faint)]">
            Rule-based checks of chart settings, not a usability test
          </span>
        }
      />
      <div className="px-2">
        <Tabs
          layoutId="audit-target"
          value={target}
          onChange={setTarget}
          tabs={[
            { id: 'flawed', label: 'Sample flawed dashboard', c: 'var(--rose)' },
            { id: 'blindspot', label: 'This dashboard’s chart specs', c: 'var(--emerald)' },
          ]}
        />
      </div>
      {busy || !res ? (
        <Loading
          className="p-4"
          steps={[
            'Reading chart specs…',
            'Checking axis integrity…',
            'Simulating colorblind vision…',
            'Validating data…',
          ]}
        />
      ) : (
        <div className="grid gap-3 p-3.5 md:grid-cols-[150px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <Ring value={res.designScore / 100} size={118} stroke={10} c={gc}>
              <div>
                <div className="text-[34px] font-extrabold leading-none" style={{ color: gc }}>
                  {grade}
                </div>
                <CountUp
                  value={res.designScore}
                  className="text-[11px] text-[var(--muted)]"
                  format={(n) => `${Math.round(n)}/100`}
                />
              </div>
            </Ring>
            {crit && (
              <div className="w-full space-y-1.5">
                {Object.entries(crit.scores).map(([k, v]: any) => (
                  <div key={k} className="text-[11.5px]">
                    <div className="flex justify-between">
                      <span className="font-bold capitalize text-[var(--muted)]">
                        {k.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <span className="mono">{v}/5</span>
                    </div>
                    <Meter value={v / 5} c="var(--fuchsia)" h={4} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            {res.designIssues.length === 0 && (
              <Empty icon={<Star size={18} />} title="No design issues found" />
            )}
            {res.designIssues.map((i: any, n: number) => (
              <motion.div
                key={n}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: n * 0.04 }}
                className="row-hover grid grid-cols-[3px_1fr] gap-2.5 rounded-lg px-2 py-1.5"
              >
                <span className="rounded-full" style={{ background: SEVC[i.severity] }} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip c={AREA[i.area] ?? 'var(--violet)'}>{i.area}</Chip>
                    <span className="truncate text-[11px] font-bold text-[var(--faint)]">{i.target}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] font-bold">{i.message}</div>
                  <div className="text-[11px] text-[var(--emerald)]">→ {i.fix}</div>
                </div>
              </motion.div>
            ))}
            {res.dataIssues.length > 0 && (
              <div className="pt-2">
                <div className="label mb-1">Statistical validation</div>
                {res.dataIssues.map((d: any) => (
                  <div key={d.title} className="flex items-center gap-2 py-0.5 text-[11.5px]">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: SEVC[d.severity] ?? 'var(--rose)' }}
                    />
                    {d.title}
                  </div>
                ))}
              </div>
            )}
            {crit && <div className="pt-1 text-[11px] text-[var(--faint)]">{crit.disclaimer}</div>}
          </div>
        </div>
      )}
    </Card>
  );
}

function ColorLab() {
  const [colors, setColors] = useState(['#7c3aed', '#e11d48', '#059669', '#d97706']);
  const [bg, setBg] = useState('#ffffff');
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    tool('analyze-color-harmony', { colors, background: bg }).then((r) => setRes(r.data));
  }, [colors, bg]);
  const sim = (hex: string, k: 'protanopia' | 'deuteranopia' | 'tritanopia') =>
    rgbToHex(simulateCvd(hexToRgb(hex), k));
  const rows = [
    { k: 'normal', label: 'Normal' },
    { k: 'protanopia', label: 'Protanopia' },
    { k: 'deuteranopia', label: 'Deuteranopia' },
    { k: 'tritanopia', label: 'Tritanopia' },
  ] as const;
  return (
    <Card c="var(--fuchsia)" hover={false} className="lg:col-span-5">
      <CardHead
        icon={<Eye size={13} />}
        title="Color accessibility"
        c="var(--fuchsia)"
        right={
          res && (
            <Chip c={res.passes ? 'var(--emerald)' : 'var(--rose)'}>
              {res.passes ? 'Passes' : `${res.issues.length} issue${res.issues.length === 1 ? '' : 's'}`}
            </Chip>
          )
        }
      />
      <div className="space-y-3 px-3.5 pb-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {colors.map((c, i) => (
            <motion.label
              key={i}
              layout
              whileHover={{ y: -2 }}
              className="group relative h-9 w-9 cursor-pointer rounded-lg"
              style={{ background: c, boxShadow: `0 4px 14px -6px ${c}` }}
            >
              <input
                type="color"
                value={c}
                onChange={(e) => setColors(colors.map((x, j) => (j === i ? e.target.value : x)))}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={`Color ${i + 1}`}
              />
              {colors.length > 2 && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setColors(colors.filter((_, j) => j !== i));
                  }}
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full bg-black/70 group-hover:grid"
                >
                  <X size={10} color="white" />
                </button>
              )}
            </motion.label>
          ))}
          {colors.length < 10 && (
            <button
              className="btn !h-9 !w-9 !justify-center !p-0"
              onClick={() => setColors([...colors, '#0891b2'])}
              aria-label="Add color"
            >
              <Plus size={14} />
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 text-[11px] text-[var(--muted)]">
            on
            <Tabs
              layoutId="bg"
              value={bg}
              onChange={setBg}
              tabs={[
                { id: '#ffffff', label: 'Light' },
                { id: '#0f172a', label: 'Dark' },
              ]}
            />
          </div>
        </div>
        <div className="space-y-1 rounded-lg p-2" style={{ background: bg }}>
          {rows.map((r) => (
            <div key={r.k} className="flex items-center gap-2">
              <span
                className="w-20 text-[11.5px] font-bold"
                style={{ color: bg === '#ffffff' ? '#475569' : '#cbd5e1' }}
              >
                {r.label}
              </span>
              <div className="flex flex-1 gap-1">
                {colors.map((c, i) => (
                  <motion.span
                    key={i}
                    layout
                    className="h-5 flex-1 rounded"
                    style={{ background: r.k === 'normal' ? c : sim(c, r.k) }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {res?.contrast.map((c: any) => (
            <div key={c.color} className="flex items-center gap-2 text-[11px]">
              <span className="h-3 w-3 rounded" style={{ background: c.color }} />
              <span className="mono w-16">{c.color}</span>
              <div className="flex-1">
                <Meter
                  value={Math.min(1, c.ratio / 7)}
                  c={c.ratio >= 3 ? 'var(--emerald)' : 'var(--rose)'}
                  h={4}
                />
              </div>
              <span
                className="mono w-12 text-right"
                style={{ color: c.ratio >= 3 ? 'var(--emerald)' : 'var(--rose)' }}
              >
                {c.ratio}:1
              </span>
            </div>
          ))}
          {res?.issues.map((i: any, n: number) => (
            <div key={n} className="text-[11px]" style={{ color: SEVC[i.severity] }}>
              • {i.message}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PaletteGen() {
  const [kind, setKind] = useState<'categorical' | 'sequential' | 'diverging'>('categorical');
  const [count, setCount] = useState(6);
  const [res, setRes] = useState<any>(null),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    tool('generate-tableau-palette', { kind, count }).then((r) => setRes(r.data));
  }, [kind, count]);
  return (
    <Card c="var(--violet)" hover={false} className="lg:col-span-5">
      <CardHead
        icon={<Palette size={13} />}
        title="Tableau palette generator"
        c="var(--violet)"
        right={
          <button
            className="btn !h-7 text-[11px]"
            onClick={() => {
              navigator.clipboard?.writeText(res?.tableauPreferencesXml ?? '');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={12} style={{ color: 'var(--emerald)' }} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy .tps XML'}
          </button>
        }
      />
      <div className="px-2">
        <Tabs
          layoutId="pal"
          value={kind}
          onChange={setKind}
          tabs={[
            { id: 'categorical', label: 'Categorical' },
            { id: 'sequential', label: 'Sequential' },
            { id: 'diverging', label: 'Diverging' },
          ]}
        />
      </div>
      <div className="space-y-2.5 p-3.5">
        <div
          style={{ '--c': 'var(--violet)', '--p': `${((count - 2) / 10) * 100}%` } as CSSProperties}
          className="flex items-center gap-3"
        >
          <span className="text-[11px] font-bold text-[var(--muted)]">Colors</span>
          <input
            type="range"
            min={2}
            max={12}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            aria-label="Color count"
          />
          <span className="mono w-5">{count}</span>
        </div>
        <div className="flex h-12 overflow-hidden rounded-lg">
          <AnimatePresence initial={false}>
            {res?.colors.map((c: string, i: number) => (
              <motion.div
                key={c + i}
                layout
                initial={{ flex: 0 }}
                animate={{ flex: 1 }}
                exit={{ flex: 0 }}
                transition={{ delay: i * 0.03 }}
                className="group relative grid place-items-end"
                style={{ background: c }}
              >
                <span className="mono mb-1 text-[11px] font-semibold text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100">
                  {c}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {res?.note && <div className="text-[11px] text-[var(--amber)]">{res.note}</div>}
        {res && (
          <div className="text-[11px] text-[var(--muted)]">
            {res.check.passes
              ? 'Passes contrast and red-green separation checks.'
              : `${res.check.issues.length} check(s) flagged; see the color panel.`}
          </div>
        )}
      </div>
    </Card>
  );
}

function Vision() {
  const [drag, setDrag] = useState(false),
    [busy, setBusy] = useState(false),
    [res, setRes] = useState<any>(null),
    [err, setErr] = useState('');
  const [preview, setPreview] = useState('');
  const handle = async (file?: File) => {
    if (!file) return;
    if (!/image\/(png|jpeg)/.test(file.type) || file.size > 5e6) return setErr('PNG or JPEG under 5MB.');
    setErr('');
    setBusy(true);
    setRes(null);
    const b64 = await new Promise<string>((r) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result).split(',')[1]);
      fr.readAsDataURL(file);
    });
    setPreview(URL.createObjectURL(file));
    const up = await tool('get-dashboard-screenshot', { uploadedBase64: b64, mediaType: file.type });
    if (!up.ok) {
      setErr(up.error!.message);
      setBusy(false);
      return;
    }
    const a = await tool('analyze-design', { useVision: true, spec: { charts: [] } });
    setRes(a.data);
    setBusy(false);
  };
  return (
    <Card c="var(--cyan)" hover={false} className="lg:col-span-7">
      <CardHead icon={<Wand2 size={13} />} title="Vision review" c="var(--cyan)" />
      <div className="grid gap-3 px-3.5 pb-3.5 md:grid-cols-2">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handle(e.dataTransfer.files[0]);
          }}
          className={`relative grid min-h-[150px] cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed text-center transition-colors ${busy ? 'scan' : ''}`}
          style={{
            borderColor: drag ? 'var(--cyan)' : 'var(--line-strong)',
            background: drag ? 'color-mix(in srgb, var(--cyan) 8%, transparent)' : 'transparent',
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => handle(e.target.files?.[0])}
          />
          {preview ? (
            <img
              src={preview}
              alt="Uploaded dashboard"
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
          ) : null}
          <div className="relative">
            <motion.div
              animate={{ y: drag ? -4 : [0, -3, 0] }}
              transition={{ duration: 2, repeat: drag ? 0 : Infinity }}
            >
              <ImageUp size={22} className="mx-auto" style={{ color: 'var(--cyan)' }} />
            </motion.div>
            <div className="mt-1 text-[12px] font-bold">Drop a dashboard screenshot</div>
            <div className="text-[11.5px] text-[var(--faint)]">PNG/JPEG · or Tableau REST capture</div>
          </div>
        </label>
        <div className="min-w-0 text-[12px]">
          {busy && (
            <Loading steps={['Validating image bytes…', 'Storing capture…', 'Running vision review…']} />
          )}
          {err && <div className="text-[var(--rose)]">{err}</div>}
          {!busy && !res && !err && (
            <div className="text-[var(--muted)]">
              Vision runs only on a real image you provide or capture from Tableau. It never substitutes
              another image.
            </div>
          )}
          {res &&
            (res.vision.ran ? (
              <div className="whitespace-pre-wrap text-[var(--muted)]">{res.vision.review}</div>
            ) : (
              <div className="tint rounded-lg p-2.5" style={{ '--c': 'var(--amber)' } as CSSProperties}>
                <div className="font-bold">Image received. Vision not run.</div>
                <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{res.vision.reason}</div>
              </div>
            ))}
        </div>
      </div>
    </Card>
  );
}

export default function Audit() {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-3 lg:grid-cols-12"
    >
      <DesignAudit />
      <ColorLab />
      <Vision />
      <PaletteGen />
    </motion.div>
  );
}
