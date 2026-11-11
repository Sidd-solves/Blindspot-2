import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  parseCsv,
  generateSampleDataset,
  detectFields,
  ingest,
  IngestError,
  ROLES,
} from '@blindspot/analytics';
import { fetchShopifyDataset, ShopifyError } from '../shopify';
import { caseStudyAvailable, CASE_STUDY_CITATION } from '../case-study';
import type { RouteContext } from './context';

/** Data in: file uploads, a live Shopify pull, the demo shop and the real-data case study. */
export function uploadRoutes(
  app: Express,
  { sessions, sid, log, broadcastTo, caseStudy, uploadMaxRows }: RouteContext,
) {
  /**
   * Universal upload: one or more files (CSV text; the browser turns Excel and PDF into text first), optional
   * column fixes. Returns the reading report either way, so the person can see and fix how the file was read.
   */
  app.post('/api/dataset/files', express.json({ limit: '40mb' }), (req, res) => {
    const p = z
      .object({
        files: z
          .array(
            z.object({
              name: z
                .string()
                .max(160)
                .transform((x) => x.replace(/[^\w .()\-]/g, '').trim() || 'Uploaded file'),
              text: z.string().min(1).max(30_000_000),
            }),
          )
          .min(1)
          .max(5),
        overrides: z.partialRecord(z.enum(ROLES), z.string().max(200).nullable()).optional(),
        dateOrder: z.enum(['ymd', 'mdy', 'dmy']).optional(),
        currency: z
          .string()
          .regex(/^[A-Za-z]{3}$/)
          .optional(),
      })
      .safeParse(req.body);
    if (!p.success)
      return res
        .status(400)
        .json({ error: { code: 'INVALID_INPUT', message: 'Send up to 5 files as { name, text }.' } });
    try {
      const { dataset, report } = ingest(p.data.files, {
        overrides: p.data.overrides,
        dateOrder: p.data.dateOrder,
        currency: p.data.currency,
        maxRows: uploadMaxRows,
      });
      if (dataset.rows.length < 1)
        return res
          .status(400)
          .json({ error: { code: 'NO_ROWS', message: 'No usable rows were found.' }, report });
      sessions.setDataset(sid(req), dataset, true);
      broadcastTo(sid(req), 'state', { dataset: dataset.name, rows: dataset.rows.length });
      log(
        `files loaded: ${p.data.files.length} file(s), ${dataset.rows.length} rows, format=${report.format}`,
      );
      res.json({ ok: true, name: dataset.name, rows: dataset.rows.length, report });
    } catch (e: any) {
      if (e instanceof IngestError)
        return res
          .status(400)
          .json({ error: { code: e.code, message: e.message }, report: e.report ?? null });
      log(`ingest failed: ${e?.message}`);
      res.status(400).json({
        error: {
          code: 'READ_FAILED',
          message:
            "This file couldn't be read. Check that it's a sales export (CSV, Excel or a PDF with a table).",
        },
      });
    }
  });

  app.post(
    '/api/dataset/csv',
    express.text({ type: ['text/csv', 'text/plain'], limit: '15mb' }),
    (req, res) => {
      const name = z
        .string()
        .max(120)
        .regex(/^[\w .()-]*$/)
        .catch('Uploaded CSV')
        .parse(req.query.name);
      if (typeof req.body !== 'string' || !req.body.trim())
        return res
          .status(400)
          .json({ error: { code: 'EMPTY', message: 'Send CSV text as the request body.' } });
      const ds = parseCsv(req.body, name || 'Uploaded CSV', 150_000); // keeps the free server safe; ~150k lines per upload
      if (ds.rows.length >= 150_000) log('upload capped at 150k rows');
      if (ds.rows.length < 2)
        return res
          .status(400)
          .json({ error: { code: 'TOO_FEW_ROWS', message: 'CSV needs a header and at least 2 rows.' } });
      if (!detectFields(ds).measure)
        return res
          .status(400)
          .json({ error: { code: 'NO_MEASURE', message: 'CSV needs at least one numeric column.' } });
      sessions.setDataset(sid(req), ds, true);
      broadcastTo(sid(req), 'state', { dataset: ds.name, rows: ds.rows.length });
      log(`dataset replaced: ${ds.rows.length} rows`);
      res.json({ ok: true, name: ds.name, rows: ds.rows.length });
    },
  );

  // Credentials are used for this one request only: never stored, logged or returned.
  app.post(
    '/api/connect/shopify',
    rateLimit({ windowMs: 60_000, limit: 6 }),
    express.json({ limit: '4kb' }),
    async (req, res) => {
      const p = z
        .object({
          shop: z.string().min(3).max(120),
          accessToken: z
            .string()
            .regex(/^shp[a-z]{2}_[A-Za-z0-9]{16,}$/)
            .optional(),
          clientId: z.string().min(8).max(128).optional(),
          clientSecret: z.string().min(8).max(256).optional(),
          days: z.number().int().min(7).max(730).default(365),
          maxOrders: z.number().int().min(10).max(5000).default(2500),
        })
        .safeParse(req.body);
      if (!p.success)
        return res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Store address plus an access token (shpat_…) or Client ID + secret are required.',
          },
        });
      try {
        const { dataset, orders } = await fetchShopifyDataset(p.data);
        if (dataset.rows.length < 2)
          return res.status(400).json({
            error: {
              code: 'TOO_FEW_ORDERS',
              message: `Only ${orders} order(s) found in the last ${p.data.days} days.`,
            },
          });
        sessions.setDataset(sid(req), dataset, true);
        broadcastTo(sid(req), 'state', { dataset: dataset.name, rows: dataset.rows.length });
        log(`shopify connected: ${orders} orders, ${dataset.rows.length} line items`);
        res.json({ ok: true, name: dataset.name, orders, rows: dataset.rows.length, label: dataset.label });
      } catch (e: any) {
        const code =
          e instanceof ShopifyError
            ? e.code
            : e?.name === 'TimeoutError'
              ? 'SHOPIFY_TIMEOUT'
              : 'SHOPIFY_UNREACHABLE';
        log(`shopify connect failed: ${code}`);
        res.status(400).json({
          error: {
            code,
            message:
              e instanceof ShopifyError ? e.message : 'Could not reach Shopify. Check the store address.',
          },
        });
      }
    },
  );

  app.post('/api/dataset/sample', (req, res) => {
    sessions.setDataset(sid(req), generateSampleDataset(), false);
    broadcastTo(sid(req), 'state', { dataset: 'sample' });
    res.json({ ok: true });
  });

  app.post('/api/dataset/case-study', (req, res) => {
    if (!caseStudyAvailable())
      return res.status(404).json({
        error: { code: 'NO_CASE_STUDY', message: 'Case study data is not bundled with this server.' },
      });
    const ds = caseStudy(); // one shared copy for every visitor
    sessions.setDataset(sid(req), ds, false);
    broadcastTo(sid(req), 'state', { dataset: ds.name, rows: ds.rows.length });
    res.json({ ok: true, name: ds.name, rows: ds.rows.length, citation: CASE_STUDY_CITATION });
  });
}
