/**
 * Parity check between Goldsky (current production indexer) and the local
 * Envio indexer. Confirms Envio's records of every Deposit/Withdraw event
 * within the block range Goldsky has indexed are byte-identical, then prints
 * how far ahead Envio is.
 *
 * Usage: pnpm tsx scripts/parity-check.ts
 */

const GOLDSKY_URL =
  "https://api.goldsky.com/api/public/project_cm651vt5aie7401z4ew271x8c/subgraphs/xcfi-vault/1.0.0/gn";
const ENVIO_URL = process.env.ENVIO_URL ?? "http://localhost:8080/v1/graphql";
const ENVIO_ADMIN_SECRET = process.env.ENVIO_ADMIN_SECRET ?? "testing";

type Totals = { deposited: bigint; withdrawn: bigint };

async function gql<T>(
  url: string,
  query: string,
  variables: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) throw new Error(`GraphQL ${url}: ${JSON.stringify(json.errors)}`);
  if (!json.data) throw new Error(`GraphQL ${url}: empty data`);
  return json.data;
}

async function getGoldskyHead(): Promise<number> {
  const data = await gql<{ _meta: { block: { number: number } } }>(
    GOLDSKY_URL,
    "{ _meta { block { number } } }",
    {},
  );
  return data._meta.block.number;
}

async function getEnvioHead(): Promise<number> {
  const data = await gql<{
    XToken_Deposit_aggregate: { aggregate: { max: { blockNumber: string | null } } };
    XToken_Withdraw_aggregate: { aggregate: { max: { blockNumber: string | null } } };
  }>(
    ENVIO_URL,
    `{
      XToken_Deposit_aggregate { aggregate { max { blockNumber } } }
      XToken_Withdraw_aggregate { aggregate { max { blockNumber } } }
    }`,
    {},
    { "x-hasura-admin-secret": ENVIO_ADMIN_SECRET },
  );
  const d = Number(data.XToken_Deposit_aggregate.aggregate.max.blockNumber ?? 0);
  const w = Number(data.XToken_Withdraw_aggregate.aggregate.max.blockNumber ?? 0);
  return Math.max(d, w);
}

async function fetchAllOwnersFromGoldsky(): Promise<string[]> {
  const owners = new Set<string>();
  for (const entity of ["deposits", "withdraws"] as const) {
    const pageSize = 1000;
    let lastBlock = 0;
    while (true) {
      const data = await gql<Record<string, { owner: string; block_number: string }[]>>(
        GOLDSKY_URL,
        `query($lastBlock: BigInt!) {
          ${entity}(
            where: { block_number_gte: $lastBlock }
            orderBy: block_number
            orderDirection: asc
            first: ${pageSize}
          ) { owner block_number }
        }`,
        { lastBlock: lastBlock.toString() },
      );
      const rows = data[entity] ?? [];
      if (rows.length === 0) break;
      for (const r of rows) owners.add(r.owner.toLowerCase());
      const last = Number(rows[rows.length - 1].block_number);
      if (rows.length < pageSize) break;
      lastBlock = last + 1;
    }
  }
  return [...owners];
}

async function paginateGoldsky(
  entity: "deposits" | "withdraws",
  owner: string,
): Promise<bigint> {
  const pageSize = 1000;
  let lastBlock = 0;
  let total = 0n;
  while (true) {
    const data = await gql<Record<string, { assets: string; block_number: string }[]>>(
      GOLDSKY_URL,
      `query($user: String!, $lastBlock: BigInt!) {
        ${entity}(
          where: { owner: $user, block_number_gte: $lastBlock }
          orderBy: block_number
          orderDirection: asc
          first: ${pageSize}
        ) { assets block_number }
      }`,
      { user: owner.toLowerCase(), lastBlock: lastBlock.toString() },
    );
    const rows = data[entity] ?? [];
    if (rows.length === 0) break;
    for (const r of rows) total += BigInt(r.assets);
    if (rows.length < pageSize) break;
    lastBlock = Number(rows[rows.length - 1].block_number) + 1;
  }
  return total;
}

async function fetchGoldskyTotals(owner: string): Promise<Totals> {
  const [deposited, withdrawn] = await Promise.all([
    paginateGoldsky("deposits", owner),
    paginateGoldsky("withdraws", owner),
  ]);
  return { deposited, withdrawn };
}

async function fetchEnvioTotals(owner: string, headBound: number): Promise<Totals> {
  const data = await gql<{
    XToken_Deposit_aggregate: { aggregate: { sum: { assets: string | null } } };
    XToken_Withdraw_aggregate: { aggregate: { sum: { assets: string | null } } };
  }>(
    ENVIO_URL,
    `query($user: String!, $head: numeric!) {
      XToken_Deposit_aggregate(
        where: { owner: { _eq: $user }, blockNumber: { _lte: $head } }
      ) { aggregate { sum { assets } } }
      XToken_Withdraw_aggregate(
        where: { owner: { _eq: $user }, blockNumber: { _lte: $head } }
      ) { aggregate { sum { assets } } }
    }`,
    { user: owner.toLowerCase(), head: headBound.toString() },
    { "x-hasura-admin-secret": ENVIO_ADMIN_SECRET },
  );
  return {
    deposited: BigInt(data.XToken_Deposit_aggregate.aggregate.sum.assets ?? "0"),
    withdrawn: BigInt(data.XToken_Withdraw_aggregate.aggregate.sum.assets ?? "0"),
  };
}

async function main() {
  const [goldskyHead, envioHead, owners] = await Promise.all([
    getGoldskyHead(),
    getEnvioHead(),
    fetchAllOwnersFromGoldsky(),
  ]);

  console.log(`Goldsky head block: ${goldskyHead}`);
  console.log(`Envio head block:   ${envioHead}`);
  console.log(
    `Comparing ${owners.length} unique owner addresses at blockNumber <= ${goldskyHead}`,
  );

  let mismatches = 0;
  for (const owner of owners) {
    const [g, e] = await Promise.all([
      fetchGoldskyTotals(owner),
      fetchEnvioTotals(owner, goldskyHead),
    ]);
    if (g.deposited !== e.deposited || g.withdrawn !== e.withdrawn) {
      mismatches++;
      console.log(
        `MISMATCH ${owner}\n  goldsky: deposited=${g.deposited} withdrawn=${g.withdrawn}\n  envio  : deposited=${e.deposited} withdrawn=${e.withdrawn}`,
      );
    }
  }

  if (mismatches === 0) {
    console.log(
      `\nPASS: ${owners.length}/${owners.length} owners match. ` +
        `Envio is ${envioHead - goldskyHead} blocks ahead of Goldsky.`,
    );
    process.exit(0);
  } else {
    console.error(`FAIL: ${mismatches}/${owners.length} owners differ.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
