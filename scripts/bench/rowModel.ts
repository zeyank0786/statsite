/**
 * Estimate rows READ for a SQL statement, the way a metered database counts it.
 *
 * Turso bills rows read, not rows returned, and nothing in the client reports
 * it: `SELECT ... LIMIT 30` over an unindexed ORDER BY returns 30 rows having
 * read the whole table. So the cost is derived from what SQLite says it will
 * actually do — EXPLAIN QUERY PLAN — against real table cardinalities and real
 * index fanouts measured from the data.
 *
 * The model:
 *   · siblings in a plan are a nested loop, so node k runs once per row
 *     produced by nodes 1..k-1
 *   · SCAN of table T reads |T| rows per iteration
 *   · SEARCH of T on equality reads `fanout` rows per iteration, where fanout
 *     is the measured average group size for those columns (1 for unique keys)
 *   · uncorrelated subqueries run once; correlated ones run per outer row
 *   · a temp B-tree sort re-reads nothing, so it adds no rows
 *   · a LIMIT stops the driving loop early — but ONLY when the ordering came
 *     from an index. With a temp B-tree the whole input must be read and
 *     sorted before the limit can apply, which is precisely the difference an
 *     index on the ORDER BY column makes and the whole point of measuring.
 *
 * It is an estimate, but it is the SAME estimate before and after a change,
 * which is what makes the ratio trustworthy.
 */

import type { Client } from '@libsql/client';

interface PlanNode {
  id: number;
  parent: number;
  detail: string;
  children: PlanNode[];
}

export interface QueryCost {
  sql: string;
  rowsRead: number;
  /** Human-readable account of where the reads came from. */
  breakdown: string[];
  /** True when any table is accessed by full scan. */
  hasScan: boolean;
  scannedTables: string[];
  /** A temp b-tree sort means ORDER BY found no index to walk. */
  sorts: number;
}

/**
 * Map query-plan names back to real tables.
 *
 * EXPLAIN QUERY PLAN reports the ALIAS ("SCAN sg"), not the table, so a plan
 * cannot be priced without re-reading the SQL to find what `sg` refers to.
 */
function aliasMap(sql: string): Map<string, string> {
  const map = new Map<string, string>();
  const RESERVED = new Set([
    'on', 'where', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'group',
    'order', 'limit', 'having', 'union', 'set', 'values', 'using', 'as', 'and',
    'or', 'select', 'from', 'natural',
  ]);
  const re = /\b(?:FROM|JOIN)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?(?:\s+(?:AS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1];
    const alias = m[2];
    map.set(table, table);
    if (alias && !RESERVED.has(alias.toLowerCase())) map.set(alias, table);
  }
  return map;
}

const SCAN = /^SCAN\s+(?:TABLE\s+)?([A-Za-z_][A-Za-z0-9_]*)/i;
const SEARCH = /^SEARCH\s+(?:TABLE\s+)?([A-Za-z_][A-Za-z0-9_]*)/i;
// SQLite also reports transient indexes it builds for one query, as
// "USING AUTOMATIC PARTIAL COVERING INDEX (col=?)". Those are still indexed
// lookups — treating them as unindexed priced a 280-row join at 7,392.
const USING_INDEX =
  /USING\s+(?:AUTOMATIC\s+)?(?:PARTIAL\s+)?(?:COVERING\s+)?INDEX\s*(\S*?)\s*\(([^)]*)\)/i;
const USING_PK = /USING\s+INTEGER\s+PRIMARY\s+KEY/i;
/** A transient index costs one pass over the table to build, then seeks. */
const AUTOMATIC_INDEX = /USING\s+AUTOMATIC/i;
const SUBQUERY = /(CORRELATED\s+)?(LIST|SCALAR)\s+SUBQUERY/i;

export class RowModel {
  private cardinality = new Map<string, number>();
  private fanoutCache = new Map<string, number>();

  constructor(private db: Client) {}

  /** Row count for a table, measured once and reused. */
  private async rows(table: string): Promise<number> {
    const hit = this.cardinality.get(table);
    if (hit !== undefined) return hit;
    let n = 0;
    try {
      const r = await this.db.execute(`SELECT COUNT(*) AS c FROM "${table}"`);
      n = Number(r.rows[0].c);
    } catch {
      n = 0; // not a real table (a CTE or subquery alias)
    }
    this.cardinality.set(table, n);
    return n;
  }

  /**
   * Average number of rows matching an equality lookup on `columns`.
   * Measured from the data rather than assumed: a lookup by suggestionId
   * genuinely returns ~3 votes, and pretending it returns 1 would understate
   * every join in the suggestions listing.
   */
  private async fanout(table: string, columns: string[]): Promise<number> {
    const usable = columns.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c));
    if (usable.length === 0) return 1;
    const key = `${table}:${usable.join(',')}`;
    const hit = this.fanoutCache.get(key);
    if (hit !== undefined) return hit;

    let value = 1;
    try {
      const expr = usable.map((c) => `COALESCE(CAST("${c}" AS TEXT),'')`).join(` || '|' || `);
      const r = await this.db.execute(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT ${expr}) AS groups FROM "${table}"`
      );
      const total = Number(r.rows[0].total);
      const groups = Number(r.rows[0].groups) || 1;
      value = total === 0 ? 1 : Math.max(1, total / groups);
    } catch {
      value = 1;
    }
    this.fanoutCache.set(key, value);
    return value;
  }

  /**
   * The effective LIMIT of a statement, resolving `LIMIT ?` against its
   * bound parameter. Returns null when there is no limit.
   */
  private static limitOf(sql: string, params: unknown[]): number | null {
    const m = /\bLIMIT\s+(\?|\d+)\s*(?:;|\)|$)/i.exec(sql.trim());
    if (!m) return null;
    if (m[1] !== '?') return Number(m[1]);
    // `LIMIT ?` binds the last placeholder in the statement.
    const value = params[params.length - 1];
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Parse EXPLAIN QUERY PLAN rows into a tree. */
  private static tree(rows: { id: number; parent: number; detail: string }[]): PlanNode[] {
    const byId = new Map<number, PlanNode>();
    const roots: PlanNode[] = [];
    for (const r of rows) {
      byId.set(r.id, { id: r.id, parent: r.parent, detail: r.detail, children: [] });
    }
    for (const node of byId.values()) {
      const parent = byId.get(node.parent);
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async cost(sql: string, params: unknown[] = []): Promise<QueryCost> {
    const breakdown: string[] = [];
    const scannedTables: string[] = [];
    const aliases = aliasMap(sql);
    const real = (name: string) => aliases.get(name) ?? name;
    let total = 0;
    let sorts = 0;

    // Writes and DDL read nothing worth modelling.
    if (!/^\s*(SELECT|WITH)/i.test(sql)) {
      return {
        sql, rowsRead: 0, breakdown: ['(non-SELECT)'],
        hasScan: false, scannedTables: [], sorts: 0,
      };
    }

    let planRows: { id: number; parent: number; detail: string }[];
    try {
      const explained = await this.db.execute({
        sql: `EXPLAIN QUERY PLAN ${sql}`,
        args: params as never[],
      });
      planRows = explained.rows.map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        parent: Number(r.parent),
        detail: String(r.detail),
      }));
    } catch (e) {
      return {
        sql,
        rowsRead: 0,
        breakdown: [`(could not explain: ${(e as Error).message})`],
        hasScan: false,
        scannedTables: [],
        sorts: 0,
      };
    }

    const roots = RowModel.tree(planRows);

    // A LIMIT only bounds the work when nothing has to be materialised first.
    // `SCAN x USING INDEX idx_created` + LIMIT 30 reads 30 rows; the same
    // query without the index reads the table and sorts it in a temp B-tree,
    // then throws away all but 30.
    const mustMaterialise = planRows.some((r) => /USE TEMP B-TREE/i.test(r.detail));
    const limit = mustMaterialise ? null : RowModel.limitOf(sql, params);
    let outermost = true;

    /**
     * Walk a sibling list as a nested loop. Returns the number of rows the
     * whole group produces, and accumulates rows read along the way.
     */
    const walk = async (nodes: PlanNode[], outerIterations: number): Promise<number> => {
      let iterations = outerIterations;
      let produced = outerIterations;

      for (const node of nodes) {
        const detail = node.detail.trim();

        const scanMatch = SCAN.exec(detail);
        const searchMatch = SEARCH.exec(detail);
        const subqueryMatch = SUBQUERY.exec(detail);

        if (scanMatch) {
          const table = real(scanMatch[1]);
          const full = await this.rows(table);
          // The driving loop stops at the LIMIT when the order came from an
          // index. Deeper loops are already bounded by what feeds them.
          const n =
            outermost && limit !== null && iterations === 1 ? Math.min(full, limit) : full;
          outermost = false;
          const read = iterations * n;
          if (full > 0) {
            total += read;
            // Only a genuine whole-table read is worth reporting as a scan;
            // an index walk cut short by LIMIT is the fixed version.
            if (n >= full) scannedTables.push(table);
            breakdown.push(`SCAN ${table}: ${iterations} × ${n} = ${read.toLocaleString()}`);
          }
          // Children of a scan node (subqueries) run once per scanned row.
          if (node.children.length > 0) await walk(node.children, iterations * n);
          produced = iterations * n;
          iterations = produced;
          continue;
        }

        if (searchMatch) {
          const table = real(searchMatch[1]);
          const idx = USING_INDEX.exec(detail);
          let perLookup = 1;
          if (idx) {
            const columns = idx[2]
              .split(/\s+AND\s+/i)
              .map((c) => c.split(/[=><]/)[0].trim())
              .filter(Boolean);
            perLookup = await this.fanout(table, columns);
          } else if (USING_PK.test(detail)) {
            perLookup = 1;
          } else {
            // A SEARCH with no usable index degenerates to a scan.
            perLookup = await this.rows(table);
          }
          let read = Math.round(iterations * perLookup);
          // Building a transient index is one pass over the table, once.
          if (AUTOMATIC_INDEX.test(detail)) read += await this.rows(table);
          total += read;
          breakdown.push(
            `SEARCH ${table}: ${iterations} × ${perLookup.toFixed(1)} = ${read.toLocaleString()}`
          );
          if (node.children.length > 0) await walk(node.children, read);
          produced = read;
          iterations = Math.max(1, read);
          continue;
        }

        if (subqueryMatch) {
          const correlated = Boolean(subqueryMatch[1]);
          // An uncorrelated subquery is materialised once no matter how many
          // outer rows there are; a correlated one runs per outer row.
          await walk(node.children, correlated ? iterations : 1);
          continue;
        }

        // A temp b-tree sorts rows already read, so it costs no extra reads —
        // but it is the fingerprint of an ORDER BY with no index behind it,
        // which is exactly what makes a LIMIT 30 read a whole table.
        if (/USE TEMP B-TREE FOR ORDER BY/i.test(detail)) sorts++;

        // COMPOUND QUERY, MERGE, BLOOM FILTER: bookkeeping over counted rows.
        if (node.children.length > 0) await walk(node.children, iterations);
      }

      return produced;
    };

    await walk(roots, 1);

    return {
      sql,
      rowsRead: Math.round(total),
      breakdown,
      hasScan: scannedTables.length > 0,
      scannedTables: [...new Set(scannedTables)],
      sorts,
    };
  }
}
