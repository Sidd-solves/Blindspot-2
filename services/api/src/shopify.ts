import { shopifyOrdersToDataset, type ShopifyOrderNode, type Dataset } from '@blindspot/analytics';

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2026-07';
const SHOP_RE = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;

/** Fields verified against the Admin GraphQL schema (Order, LineItem, InventoryItem.unitCost). */
const ORDERS_QUERY = `query BlindspotOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    edges { node {
      name createdAt cancelledAt test displayFinancialStatus
      customer { id displayName }
      shippingAddress { provinceCode countryCodeV2 }
      lineItems(first: 50) { edges { node {
        title quantity vendor
        originalTotalSet { shopMoney { amount } }
        discountedTotalSet { shopMoney { amount } }
        product { productType }
        variant { inventoryItem { unitCost { amount } } }
      } } }
    } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export class ShopifyError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeShop(input: string) {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const shop = s.endsWith('.myshopify.com') ? s : `${s}.myshopify.com`;
  if (!SHOP_RE.test(shop))
    throw new ShopifyError(
      'INVALID_SHOP',
      "Use your store's myshopify.com address, e.g. my-store.myshopify.com.",
    );
  return shop;
}

/** Dev Dashboard apps: exchange client ID + secret for a 24h token (client credentials grant). */
async function tokenFromClientCredentials(shop: string, clientId: string, clientSecret: string) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404)
    throw new ShopifyError(
      'SHOP_NOT_FOUND',
      'No Shopify store at that address. Check the spelling of your myshopify.com address.',
    );
  if (!res.ok)
    throw new ShopifyError(
      'SHOPIFY_AUTH_FAILED',
      `Shopify rejected the app credentials (HTTP ${res.status}). Check the Client ID/secret and that the app is installed on this store.`,
    );
  return (await res.json()).access_token as string;
}

export interface ShopifyConnectInput {
  shop: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  days: number;
  maxOrders: number;
}

export async function fetchShopifyDataset(
  i: ShopifyConnectInput,
): Promise<{ dataset: Dataset; orders: number }> {
  const shop = normalizeShop(i.shop);
  const token =
    i.accessToken ||
    (i.clientId && i.clientSecret
      ? await tokenFromClientCredentials(shop, i.clientId, i.clientSecret)
      : null);
  if (!token)
    throw new ShopifyError(
      'MISSING_CREDENTIALS',
      'Provide an Admin API access token, or a Client ID and secret.',
    );
  const since = new Date(Date.now() - i.days * 86400000).toISOString().slice(0, 10);
  const orders: ShopifyOrderNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40 && orders.length < i.maxOrders; page++) {
    let body: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({
          query: ORDERS_QUERY,
          variables: { first: 100, after, query: `created_at:>=${since}` },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 401 || res.status === 403)
        throw new ShopifyError(
          'SHOPIFY_FORBIDDEN',
          'The token lacks access. Grant read_orders, read_products and read_inventory.',
        );
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (res.status === 404)
        throw new ShopifyError(
          'SHOP_NOT_FOUND',
          'No Shopify store at that address. Check the spelling of your myshopify.com address.',
        );
      if (!res.ok) throw new ShopifyError('SHOPIFY_HTTP', `Shopify returned HTTP ${res.status}.`);
      body = await res.json();
      if (body.errors?.some((e: any) => e.extensions?.code === 'THROTTLED')) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        body = null;
        continue;
      }
      break;
    }
    if (!body)
      throw new ShopifyError(
        'SHOPIFY_THROTTLED',
        'Shopify kept rate-limiting the request. Try again in a minute.',
      );
    if (body.errors?.length) {
      const msg = String(body.errors[0].message ?? 'GraphQL error');
      throw new ShopifyError(
        /access denied|unitCost/i.test(msg) ? 'SHOPIFY_SCOPE' : 'SHOPIFY_GRAPHQL',
        /access denied/i.test(msg)
          ? 'Missing permission. Grant read_orders, read_products and read_inventory to the app.'
          : msg.slice(0, 300),
      );
    }
    const conn = body.data.orders;
    orders.push(...conn.edges.map((e: any) => e.node));
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return {
    dataset: shopifyOrdersToDataset(orders.slice(0, i.maxOrders), shop.replace('.myshopify.com', '')),
    orders: Math.min(orders.length, i.maxOrders),
  };
}
