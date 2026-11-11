import { z } from 'zod';
import { profileData } from '@blindspot/analytics';
import { defineTool, ToolError, type ToolContext } from '../core';

async function viaBridge<T>(
  ctx: ToolContext,
  method: 'applyFilter' | 'setParameter',
  payload: unknown,
): Promise<T> {
  if (!ctx.bridge?.isConnected())
    throw new ToolError('TABLEAU_NOT_CONNECTED', 'No Tableau extension is connected to the bridge.');
  try {
    return await ctx.bridge.request<T>(method, payload, 20_000);
  } catch (e: any) {
    throw new ToolError(e?.code ?? 'BRIDGE_ERROR', e?.message ?? 'Bridge request failed');
  }
}

export const applyFilter = defineTool({
  name: 'apply-filter',
  category: 'Interaction',
  description:
    'Apply a categorical filter. Target "tableau" calls worksheet.applyFilterAsync through the extension; target "session" filters Blindspot\'s own dataset so every analysis updates. Default: tableau when connected, else session.',
  input: z.object({
    field: z.string().min(1).max(200),
    values: z.array(z.string().max(200)).max(200),
    mode: z.enum(['replace', 'add', 'remove', 'clear']).default('replace'),
    worksheet: z.string().max(200).optional(),
    target: z.enum(['auto', 'tableau', 'session']).default('auto'),
  }),
  output: z.object({
    target: z.enum(['tableau', 'session']),
    field: z.string(),
    values: z.array(z.string()),
    rowsAfter: z.number().nullable(),
    activeFilters: z.record(z.string(), z.array(z.string())),
  }),
  async handler(ctx, i) {
    const target = i.target === 'auto' ? (ctx.bridge?.isConnected() ? 'tableau' : 'session') : i.target;
    if (target === 'tableau') {
      if (!i.worksheet) throw new ToolError('INVALID_INPUT', 'worksheet is required when filtering Tableau.');
      await viaBridge(ctx, 'applyFilter', i);
      return { target, field: i.field, values: i.values, rowsAfter: null, activeFilters: {} };
    }
    const col = profileData(ctx.state.dataset).columns.find((c) => c.name === i.field);
    if (!col) throw new ToolError('UNKNOWN_FIELD', `Field "${i.field}" is not in the dataset.`);
    const known = new Set(ctx.state.dataset.rows.map((r) => String(r[i.field] ?? '')));
    const bad = i.values.filter((v) => !known.has(v));
    if (bad.length && i.mode !== 'remove')
      throw new ToolError('UNKNOWN_VALUE', `Not present in ${i.field}: ${bad.slice(0, 5).join(', ')}`);
    const cur = ctx.state.filters.get(i.field) ?? [];
    const next =
      i.mode === 'clear'
        ? []
        : i.mode === 'replace'
          ? i.values
          : i.mode === 'add'
            ? [...new Set([...cur, ...i.values])]
            : cur.filter((v) => !i.values.includes(v));
    if (next.length) ctx.state.filters.set(i.field, next);
    else ctx.state.filters.delete(i.field);
    return {
      target,
      field: i.field,
      values: next,
      rowsAfter: ctx.state.view().rows.length,
      activeFilters: Object.fromEntries(ctx.state.filters),
    };
  },
});

export const setParameter = defineTool({
  name: 'set-parameter',
  category: 'Interaction',
  description: 'Change a Tableau parameter value via parameter.changeValueAsync in the connected extension.',
  input: z.object({
    parameter: z.string().min(1).max(200),
    value: z.union([z.string().max(500), z.number(), z.boolean()]),
  }),
  output: z.object({ parameter: z.string(), value: z.unknown(), applied: z.boolean() }),
  async handler(ctx, i) {
    const res = await viaBridge<{ value?: unknown }>(ctx, 'setParameter', i);
    return { parameter: i.parameter, value: res?.value ?? i.value, applied: true };
  },
});

/** Tableau REST "Query View Image" (sign in with a PAT, then GET /views/{id}/image). */
async function restViewImage(ctx: ToolContext, viewId: string) {
  const r = ctx.rest;
  if (!r?.serverUrl || !r.patName || !r.patSecret)
    throw new ToolError(
      'TABLEAU_REST_NOT_CONFIGURED',
      'Set TABLEAU_SERVER_URL, TABLEAU_SITE, TABLEAU_PAT_NAME and TABLEAU_PAT_SECRET on the server to capture view images.',
    );
  const base = `${r.serverUrl.replace(/\/$/, '')}/api/3.22`;
  const signin = await fetch(`${base}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      credentials: {
        personalAccessTokenName: r.patName,
        personalAccessTokenSecret: r.patSecret,
        site: { contentUrl: r.site ?? '' },
      },
    }),
  });
  if (!signin.ok)
    throw new ToolError('TABLEAU_AUTH_FAILED', `Tableau sign-in failed (HTTP ${signin.status}).`);
  const cred = (await signin.json()).credentials;
  const img = await fetch(
    `${base}/sites/${cred.site.id}/views/${encodeURIComponent(viewId)}/image?resolution=high`,
    { headers: { 'X-Tableau-Auth': cred.token } },
  );
  if (!img.ok) throw new ToolError('TABLEAU_IMAGE_FAILED', `View image request failed (HTTP ${img.status}).`);
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new ToolError('IMAGE_TOO_LARGE', 'View image exceeds 5MB.');
  return {
    base64: buf.toString('base64'),
    mediaType: img.headers.get('content-type') ?? 'image/png',
    bytes: buf.length,
  };
}

export const getDashboardScreenshot = defineTool({
  name: 'get-dashboard-screenshot',
  category: 'Interaction',
  description:
    'Capture a real dashboard image. The Extensions API cannot screenshot, so this uses the documented Tableau REST "Query View Image" endpoint (or an image the user uploads). Never substitutes an unrelated image.',
  input: z.object({
    viewId: z
      .string()
      .regex(/^[\w-]{8,64}$/)
      .optional(),
    uploadedBase64: z.string().max(7_000_000).optional(),
    mediaType: z.enum(['image/png', 'image/jpeg']).default('image/png'),
  }),
  output: z.object({
    source: z.enum(['tableau-rest', 'upload']),
    bytes: z.number(),
    mediaType: z.string(),
    capturedAt: z.string(),
  }),
  async handler(ctx, i) {
    let img: { base64: string; mediaType: string; bytes: number }, source: 'tableau-rest' | 'upload';
    if (i.uploadedBase64) {
      const head = Buffer.from(i.uploadedBase64.slice(0, 16), 'base64');
      const isPng = head[0] === 0x89 && head[1] === 0x50,
        isJpg = head[0] === 0xff && head[1] === 0xd8;
      if (!isPng && !isJpg) throw new ToolError('INVALID_IMAGE', 'Upload must be a PNG or JPEG image.');
      img = {
        base64: i.uploadedBase64,
        mediaType: isPng ? 'image/png' : 'image/jpeg',
        bytes: Math.floor(i.uploadedBase64.length * 0.75),
      };
      source = 'upload';
    } else if (i.viewId) {
      img = await restViewImage(ctx, i.viewId);
      source = 'tableau-rest';
    } else throw new ToolError('INVALID_INPUT', 'Provide a Tableau viewId or upload an image.');
    const capturedAt = new Date().toISOString();
    ctx.state.lastImage = { base64: img.base64, mediaType: img.mediaType, at: capturedAt };
    return { source, bytes: img.bytes, mediaType: img.mediaType, capturedAt };
  },
});
export const INTERACTION_TOOLS = [applyFilter, setParameter, getDashboardScreenshot];
