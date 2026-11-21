/**
 * Quality-derived indexes, people normalization, search index, record shards,
 * canonical work_slug, and slim public/idx files.
 * Does not modify data/archive.json or public/archive/.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import type { ArchiveRecord } from "../scrapers/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const records = JSON.parse(
  readFileSync(join(root, "data/archive.json"), "utf8"),
) as ArchiveRecord[];
const idSet = new Set(records.map((r) => r.id));

type WorkKind = "album" | "season" | "tour" | "collab" | "film" | "other";
type WorkDef = {
  slug: string;
  name: string;
  years: [string, string];
  kind: WorkKind;
  parent?: string;
  aliases: string[];
  title_includes?: string[];
  cover_ids?: string[];
};

type AliasFile = {
  note?: string;
  do_not_map?: string[];
  works: WorkDef[];
};

type DerivRow = { hash: string; fit: "contain" | "cover"; bg: string };
type DerivFile = { images?: Record<string, DerivRow> };

const aliasFile = JSON.parse(
  readFileSync(join(root, "data/works.aliases.json"), "utf8"),
) as AliasFile;

const derivFile: DerivFile = (() => {
  try {
    return JSON.parse(readFileSync(join(root, "data/image-derivatives.json"), "utf8"));
  } catch {
    return {};
  }
})();
const derivByHash = derivFile.images ?? {};

function publicUrl(local: string | null | undefined): string | null {
  if (!local) return null;
  if (local.startsWith("public/")) return "/" + local.slice("public/".length);
  if (local.startsWith("/")) return local;
  return "/" + local;
}

function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return s || "untitled";
}

function yearOf(r: ArchiveRecord): string | null {
  if (r.year && /^\d{4}$/.test(String(r.year).trim())) return String(r.year).trim();
  const m = String(r.date ?? "").match(/(19|20)\d{2}/);
  return m ? m[0] : null;
}

function decadeOf(year: string | null): string {
  if (!year || !/^\d{4}$/.test(year)) return "undated";
  return `${year.slice(0, 3)}0s`;
}

function mediumOf(domain: string): string {
  return domain.toLowerCase();
}

type RoleHint = { record_id: string; original_url: string; editorial_role: string; rank: number };
const roleFile = (() => {
  try {
    return JSON.parse(readFileSync(join(root, "data/image-roles.json"), "utf8")) as {
      images: RoleHint[];
    };
  } catch {
    return { images: [] as RoleHint[] };
  }
})();
const roleMap = new Map<string, RoleHint>();
for (const row of roleFile.images) {
  roleMap.set(`${row.record_id}|${row.original_url}`, row);
}

function roleFor(recordId: string, originalUrl: string): RoleHint | undefined {
  return roleMap.get(`${recordId}|${originalUrl}`);
}

type ImageRow = ArchiveRecord["images"][number] & {
  sha256?: string | null;
  phash?: string | null;
};

function rankedLocals(r: ArchiveRecord): ImageRow[] {
  return ((r.images ?? []) as ImageRow[])
    .filter((i) => i.local_path)
    .slice()
    .sort((a, b) => {
      const ra = roleFor(r.id, a.original_url)?.rank ?? (a.role === "primary" ? 6 : 5);
      const rb = roleFor(r.id, b.original_url)?.rank ?? (b.role === "primary" ? 6 : 5);
      if (rb !== ra) return rb - ra;
      return (b.width ?? 0) - (a.width ?? 0);
    });
}

function firstLocal(r: ArchiveRecord): ImageRow | null {
  return rankedLocals(r)[0] ?? null;
}

function firstImg(r: ArchiveRecord): string | null {
  return publicUrl(firstLocal(r)?.local_path ?? null);
}

function hasImage(r: ArchiveRecord): boolean {
  return Boolean(firstLocal(r));
}

const SENTENCE = /cover art for|featuring kanye|posted by|designed by the/i;

/** Split people only on clear structural separators. Preserve original on the record. */
export function splitPeople(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (SENTENCE.test(t) && t.split(/\s+/).length > 8) return [];
  const protectedStr = t.replace(/,\s*Inc\.?/gi, " Inc.");
  const parts = protectedStr
    .split(/\s*(?:&|,|\band\b|\/)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const names: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/);
    if (words.length === 0 || words.length > 6) continue;
    if (/^inc\.?$/i.test(p)) continue;
    names.push(p);
  }
  if (names.length) return names;
  if (t.split(/\s+/).length <= 6 && !SENTENCE.test(t)) return [t];
  return [];
}

function shardKey(id: string): string {
  const hex = id.includes("-") ? id.slice(id.lastIndexOf("-") + 1) : id;
  return hex.slice(0, 2).toLowerCase().replace(/[^0-9a-f]/g, "0").padEnd(2, "0");
}

/* -------------------------------------------------------------------------- */
/* Canonical Works                                                             */
/* -------------------------------------------------------------------------- */

const worksBySlug = new Map<string, WorkDef>();
const aliasToSlug = new Map<string, string>();
const titleNeedles: { needle: string; slug: string }[] = [];

for (const work of aliasFile.works) {
  if (worksBySlug.has(work.slug)) {
    throw new Error(`Duplicate work slug: ${work.slug}`);
  }
  worksBySlug.set(work.slug, work);
  for (const alias of work.aliases ?? []) {
    if (!alias) continue;
    const existing = aliasToSlug.get(alias);
    if (existing && existing !== work.slug) {
      throw new Error(`Duplicate alias ${JSON.stringify(alias)}: ${existing} and ${work.slug}`);
    }
    aliasToSlug.set(alias, work.slug);
  }
  for (const needle of work.title_includes ?? []) {
    if (!needle) continue;
    titleNeedles.push({ needle: needle.toLowerCase(), slug: work.slug });
  }
}

titleNeedles.sort((a, b) => b.needle.length - a.needle.length);

for (const work of aliasFile.works) {
  if (work.parent && !worksBySlug.has(work.parent)) {
    throw new Error(`Work ${work.slug} parent ${work.parent} is not defined`);
  }
}

function ancestors(slug: string): Set<string> {
  const out = new Set<string>();
  let cur = worksBySlug.get(slug);
  const seen = new Set<string>();
  while (cur?.parent && !seen.has(cur.slug)) {
    seen.add(cur.slug);
    out.add(cur.parent);
    cur = worksBySlug.get(cur.parent);
  }
  return out;
}

function titleSlug(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const n of titleNeedles) {
    if (t.includes(n.needle)) return n.slug;
  }
  return null;
}

function resolveWork(r: ArchiveRecord): string | null {
  type Cand = { slug: string; prio: number };
  const cands: Cand[] = [];
  if (r.project) {
    const s = aliasToSlug.get(r.project);
    if (s) cands.push({ slug: s, prio: 0 });
  }
  if (r.era) {
    const s = aliasToSlug.get(r.era);
    if (s) cands.push({ slug: s, prio: 1 });
  }
  const fromTitle = titleSlug(r.title);
  if (fromTitle) cands.push({ slug: fromTitle, prio: 2 });
  if (!cands.length) return null;

  const slugs = [...new Set(cands.map((c) => c.slug))];
  const keep = new Set(
    slugs.filter((s) => !slugs.some((other) => other !== s && ancestors(other).has(s))),
  );
  const remaining = cands.filter((c) => keep.has(c.slug));
  remaining.sort((a, b) => a.prio - b.prio || ancestors(b.slug).size - ancestors(a.slug).size);
  return remaining[0]?.slug ?? null;
}

const workSlugById = new Map<string, string | null>();
for (const r of records) {
  workSlugById.set(r.id, resolveWork(r));
}

/* Unmapped era/project strings (largest first: image count, then total). */
type UnmappedRow = { value: string; field: "era" | "project"; total: number; images: number };
const unmappedMap = new Map<string, UnmappedRow>();
function bumpUnmapped(field: "era" | "project", value: string | null, imaged: boolean) {
  if (!value) return;
  if (aliasToSlug.has(value)) return;
  const key = `${field}\t${value}`;
  const row = unmappedMap.get(key) ?? { value, field, total: 0, images: 0 };
  row.total += 1;
  if (imaged) row.images += 1;
  unmappedMap.set(key, row);
}

let imageTotal = 0;
let imageMapped = 0;
for (const r of records) {
  const imaged = hasImage(r);
  if (imaged) {
    imageTotal += 1;
    if (workSlugById.get(r.id)) imageMapped += 1;
  }
  bumpUnmapped("era", r.era, imaged);
  bumpUnmapped("project", r.project, imaged);
}

const unmappedRows = [...unmappedMap.values()].sort(
  (a, b) => b.images - a.images || b.total - a.total || a.value.localeCompare(b.value),
);
const coveragePct = imageTotal ? (100 * imageMapped) / imageTotal : 0;

const unmappedLines = [
  `# Unmapped era / project strings`,
  `# Image records with work_slug: ${imageMapped} / ${imageTotal} (${coveragePct.toFixed(1)}%)`,
  `# Sorted by image count, then total. Category labels in do_not_map are listed here but were not assigned.`,
  `# field\timages\ttotal\tvalue`,
  ...unmappedRows.map((r) => `${r.field}\t${r.images}\t${r.total}\t${r.value}`),
  "",
];
writeFileSync(join(root, "data/unmapped-eras.txt"), unmappedLines.join("\n"));

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

type Person = {
  slug: string;
  display_name: string;
  aliases: string[];
  original_fields: string[];
  record_count: number;
  record_ids: string[];
  domains: string[];
  years: string[];
};

const peopleMap = new Map<string, Person>();

function addPerson(display: string, original: string, rec: ArchiveRecord) {
  const key = display.toLowerCase();
  let p = peopleMap.get(key);
  if (!p) {
    p = {
      slug: slugify(display),
      display_name: display,
      aliases: [],
      original_fields: [],
      record_count: 0,
      record_ids: [],
      domains: [],
      years: [],
    };
    peopleMap.set(key, p);
  }
  if (!p.original_fields.includes(original)) p.original_fields.push(original);
  if (!p.record_ids.includes(rec.id)) {
    p.record_ids.push(rec.id);
    p.record_count += 1;
  }
  if (rec.domain && !p.domains.includes(rec.domain)) p.domains.push(rec.domain);
  const y = yearOf(rec);
  if (y && !p.years.includes(y)) p.years.push(y);
}

for (const r of records) {
  for (const raw of r.people ?? []) {
    if (typeof raw !== "string") continue;
    const parts = splitPeople(raw);
    if (!parts.length) continue;
    for (const part of parts) addPerson(part, raw, r);
  }
}

const slugUsed = new Set<string>();
const people = [...peopleMap.values()]
  .sort((a, b) => b.record_count - a.record_count || a.display_name.localeCompare(b.display_name))
  .map((p) => {
    let slug = p.slug;
    if (slugUsed.has(slug)) slug = `${slug}-${p.record_count}`;
    slugUsed.add(slug);
    p.years.sort();
    return { ...p, slug };
  });

writeFileSync(
  join(root, "data/people-normalized.json"),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      note: "Derived. archive.json people[] left unchanged. Ye and Kanye West are not merged.",
      people,
    },
    null,
    2,
  ),
);

/* -------------------------------------------------------------------------- */
/* Legacy public/index (current pages)                                         */
/* -------------------------------------------------------------------------- */

const years: Record<string, { count: number; domains: Record<string, number>; with_image: number }> = {};
const domains: Record<string, { count: number; types: Record<string, number>; with_image: number }> = {};
const projects: Record<string, { count: number; domains: Record<string, number>; years: Record<string, number> }> = {};
const eras: Record<string, { count: number }> = {};
const statuses: Record<string, { count: number }> = {};

for (const r of records) {
  const y = yearOf(r);
  if (y) {
    years[y] ??= { count: 0, domains: {}, with_image: 0 };
    years[y].count += 1;
    years[y].domains[r.domain] = (years[y].domains[r.domain] ?? 0) + 1;
    if (firstImg(r)) years[y].with_image += 1;
  }
  domains[r.domain] ??= { count: 0, types: {}, with_image: 0 };
  domains[r.domain].count += 1;
  domains[r.domain].types[r.type] = (domains[r.domain].types[r.type] ?? 0) + 1;
  if (firstImg(r)) domains[r.domain].with_image += 1;
  if (r.project) {
    projects[r.project] ??= { count: 0, domains: {}, years: {} };
    projects[r.project].count += 1;
    projects[r.project].domains[r.domain] = (projects[r.project].domains[r.domain] ?? 0) + 1;
    if (y) projects[r.project].years[y] = (projects[r.project].years[y] ?? 0) + 1;
  }
  if (r.era) {
    eras[r.era] ??= { count: 0 };
    eras[r.era].count += 1;
  }
  if (r.status) {
    statuses[r.status] ??= { count: 0 };
    statuses[r.status].count += 1;
  }
}

type WorkAgg = {
  def: WorkDef;
  count: number;
  image_count: number;
  domains: Record<string, number>;
  years: Record<string, number>;
  sources: Record<string, number>;
  ids: string[];
  image_ids: string[];
};

const workAggs = new Map<string, WorkAgg>();
for (const def of aliasFile.works) {
  workAggs.set(def.slug, {
    def,
    count: 0,
    image_count: 0,
    domains: {},
    years: {},
    sources: {},
    ids: [],
    image_ids: [],
  });
}

for (const r of records) {
  const slug = workSlugById.get(r.id);
  if (!slug) continue;
  const agg = workAggs.get(slug);
  if (!agg) continue;
  agg.count += 1;
  agg.ids.push(r.id);
  agg.domains[r.domain] = (agg.domains[r.domain] ?? 0) + 1;
  const src = r.source?.name ?? "?";
  agg.sources[src] = (agg.sources[src] ?? 0) + 1;
  const y = yearOf(r);
  if (y) agg.years[y] = (agg.years[y] ?? 0) + 1;
  if (hasImage(r)) {
    agg.image_count += 1;
    agg.image_ids.push(r.id);
  }
}

const recordById = new Map(records.map((r) => [r.id, r]));

function pickCoversFast(ids: string[], max = 12): string[] {
  const byMedium = new Map<string, string[]>();
  for (const id of ids) {
    const r = recordById.get(id);
    if (!r) continue;
    const list = byMedium.get(r.domain) ?? [];
    list.push(id);
    byMedium.set(r.domain, list);
  }
  const queues = [...byMedium.values()];
  const out: string[] = [];
  let i = 0;
  while (out.length < max) {
    let added = false;
    for (const q of queues) {
      if (q[i]) {
        out.push(q[i]);
        added = true;
        if (out.length >= max) break;
      }
    }
    if (!added) break;
    i += 1;
  }
  if (out.length < 4) return ids.slice(0, Math.min(ids.length, max));
  return out.slice(0, Math.min(Math.max(out.length, 4), max));
}

const worksIndex = aliasFile.works
  .map((def) => {
    const agg = workAggs.get(def.slug)!;
    const covers = def.cover_ids?.length ? def.cover_ids : pickCoversFast(agg.image_ids);
    return {
      slug: def.slug,
      label: def.name,
      name: def.name,
      years: def.years,
      kind: def.kind,
      parent: def.parent ?? null,
      aliases: def.aliases,
      titleIncludes: def.title_includes ?? [],
      project: def.aliases,
      era: def.aliases,
      count: agg.count,
      image_count: agg.image_count,
      domains: agg.domains,
      years_hist: agg.years,
      sources: agg.sources,
      covers,
      threads: [] as string[],
    };
  })
  .filter((w) => w.count > 0);

const publicIndex = join(root, "public/index");
mkdirSync(publicIndex, { recursive: true });

writeFileSync(
  join(publicIndex, "years.json"),
  JSON.stringify({
    years: Object.entries(years)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, v]) => ({ year, ...v })),
  }),
);
writeFileSync(
  join(publicIndex, "domains.json"),
  JSON.stringify({
    domains: Object.entries(domains)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([domain, v]) => ({
        domain,
        slug: slugify(domain),
        ...v,
        types: Object.entries(v.types)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count })),
      })),
  }),
);
writeFileSync(
  join(publicIndex, "projects.json"),
  JSON.stringify({
    works: worksIndex.map((w) => ({
      slug: w.slug,
      label: w.label,
      name: w.name,
      kind: w.kind,
      parent: w.parent,
      project: w.project,
      era: w.era,
      titleIncludes: w.titleIncludes,
      count: w.count,
      domains: w.domains,
      years: w.years_hist,
    })),
    projects: Object.entries(projects)
      .filter(([, v]) => v.count >= 20)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([project, v]) => ({
        project,
        slug: slugify(project),
        count: v.count,
        domains: v.domains,
        years: v.years,
      })),
  }),
);
writeFileSync(
  join(publicIndex, "people.json"),
  JSON.stringify({
    people: people.map((p) => ({
      slug: p.slug,
      display_name: p.display_name,
      record_count: p.record_count,
      domains: p.domains,
      years: p.years,
      aliases: p.aliases,
      original_fields: p.original_fields,
    })),
  }),
);
writeFileSync(
  join(publicIndex, "status.json"),
  JSON.stringify({
    statuses: Object.entries(statuses)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([status, v]) => ({ status, count: v.count })),
    eras: Object.entries(eras)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 80)
      .map(([era, v]) => ({ era, count: v.count })),
  }),
);

const slim = records.map((r) => ({
  id: r.id,
  title: r.title,
  year: yearOf(r),
  date: r.date,
  era: r.era,
  project: r.project,
  domain: r.domain,
  type: r.type,
  subtype: r.subtype,
  status: r.status,
  status_source_term: r.status_source_term,
  people: r.people ?? [],
  names: (r.people ?? []).flatMap((p) => (typeof p === "string" ? splitPeople(p) : [])),
  source_name: r.source?.name ?? null,
  source_url: r.source?.url ?? null,
  img: firstImg(r),
  desc: (r.description ?? "").slice(0, 220),
  confidence: r.confidence,
  work_slug: workSlugById.get(r.id) ?? null,
}));
writeFileSync(join(root, "public/search-index.json"), JSON.stringify(slim));

/* -------------------------------------------------------------------------- */
/* Shards + new idx                                                            */
/* -------------------------------------------------------------------------- */

function imageMeta(img: ImageRow | null) {
  if (!img) return { hash: null as string | null, fit: undefined as "contain" | "cover" | undefined, bg: undefined as string | undefined };
  const hash = img.sha256 ?? null;
  const deriv = hash ? derivByHash[hash] : undefined;
  return {
    hash,
    fit: deriv?.fit,
    bg: deriv?.bg,
  };
}

const shards = new Map<string, object[]>();
for (const r of records) {
  const key = shardKey(r.id);
  const locals = rankedLocals(r);
  const row = {
    id: r.id,
    title: r.title,
    date: r.date,
    year: yearOf(r),
    domain: r.domain,
    type: r.type,
    subtype: r.subtype,
    era: r.era,
    project: r.project,
    status: r.status,
    status_source_term: r.status_source_term,
    description: r.description,
    people: r.people ?? [],
    organizations: r.organizations ?? [],
    related_records: (r.related_records ?? []).filter((id) => idSet.has(id)),
    related_unresolved: (r.related_records ?? []).filter((id) => !idSet.has(id)).length,
    references: r.references ?? [],
    source: r.source,
    source_claims: (r.source_claims ?? []).filter((c) => c.field !== "headers"),
    confidence: r.confidence,
    work_slug: workSlugById.get(r.id) ?? null,
    images: locals.map((i) => {
      const meta = imageMeta(i);
      return {
        local_path: publicUrl(i.local_path),
        original_url: i.original_url,
        source_page: i.source_page,
        caption: i.caption,
        role: i.role,
        editorial_role: roleFor(r.id, i.original_url)?.editorial_role ?? i.role,
        width: i.width,
        height: i.height,
        hash: meta.hash,
        ...(meta.fit ? { fit: meta.fit } : {}),
        ...(meta.bg ? { bg: meta.bg } : {}),
      };
    }),
  };
  const list = shards.get(key) ?? [];
  list.push(row);
  shards.set(key, list);
}

const recDir = join(root, "public/records");
rmSync(recDir, { recursive: true, force: true });
mkdirSync(recDir, { recursive: true });
for (const [key, list] of shards) {
  writeFileSync(join(recDir, `${key}.json`), JSON.stringify(list));
}

/* Slim visual / text / works indexes */
type VisualRow = {
  id: string;
  t: string;
  y: string | null;
  m: string;
  ty: string;
  w: string | null;
  s: string;
  src: string | null;
  i: string | null;
  f?: "contain" | "cover";
  bg?: string;
};

const visual: VisualRow[] = [];
const textByDecade = new Map<string, object[]>();

for (const r of records) {
  const y = yearOf(r);
  const img = firstLocal(r);
  const meta = imageMeta(img);
  const imgUrlPath = firstImg(r);
  const base = {
    id: r.id,
    t: r.title,
    y,
    m: mediumOf(r.domain),
    ty: r.type,
    w: workSlugById.get(r.id) ?? null,
    s: r.status,
    src: r.source?.name ?? null,
  };
  if (imgUrlPath) {
    const row: VisualRow = { ...base, i: imgUrlPath };
    if (meta.fit) row.f = meta.fit;
    if (meta.bg) row.bg = meta.bg;
    visual.push(row);
  }
  const decade = decadeOf(y);
  const textRow: Record<string, unknown> = { ...base };
  if (imgUrlPath) textRow.i = imgUrlPath;
  const list = textByDecade.get(decade) ?? [];
  list.push(textRow);
  textByDecade.set(decade, list);
}

visual.sort((a, b) => (b.y ?? "").localeCompare(a.y ?? "") || a.t.localeCompare(b.t));

const idxDir = join(root, "public/idx");
const idxWorkDir = join(idxDir, "work");
const idxTextDir = join(idxDir, "text");
rmSync(idxDir, { recursive: true, force: true });
mkdirSync(idxWorkDir, { recursive: true });
mkdirSync(idxTextDir, { recursive: true });

const visualJson = JSON.stringify(visual);
writeFileSync(join(idxDir, "visual.json"), visualJson);
const visualGz = gzipSync(Buffer.from(visualJson)).length;

writeFileSync(
  join(idxDir, "works.json"),
  JSON.stringify({
    works: worksIndex.map((w) => ({
      slug: w.slug,
      name: w.name,
      years: w.years,
      kind: w.kind,
      parent: w.parent,
      count: w.count,
      image_count: w.image_count,
      domains: w.domains,
      covers: w.covers,
      threads: w.threads,
    })),
  }),
);

for (const w of worksIndex) {
  const agg = workAggs.get(w.slug)!;
  const children = aliasFile.works.filter((d) => d.parent === w.slug).map((d) => d.slug);
  writeFileSync(
    join(idxWorkDir, `${w.slug}.json`),
    JSON.stringify({
      slug: w.slug,
      name: w.name,
      years: w.years,
      kind: w.kind,
      parent: w.parent,
      children,
      count: w.count,
      image_count: w.image_count,
      domains: w.domains,
      sources: w.sources,
      covers: w.covers,
      threads: w.threads,
      ids: agg.ids,
    }),
  );
}

for (const [decade, rows] of textByDecade) {
  writeFileSync(join(idxTextDir, `${decade}.json`), JSON.stringify(rows));
}

writeFileSync(
  join(idxDir, "people.json"),
  JSON.stringify({
    people: people.map((p) => ({
      slug: p.slug,
      display_name: p.display_name,
      record_count: p.record_count,
      domains: p.domains,
      years: p.years,
      record_ids: p.record_ids,
    })),
  }),
);

const RELEASED = new Set(["RELEASED", "REALIZED", "FULL"]);
const UNREALIZED = new Set([
  "UNRELEASED",
  "PROTOTYPE",
  "SAMPLE",
  "CONCEPT",
  "CANCELLED",
  "LOST",
  "NEVER RECORDED",
  "PARTIAL",
]);
const UNCONFIRMED = new Set(["UNCONFIRMED", "RUMORED", "CONFLICTING SOURCES"]);
const otherStatuses = Object.keys(statuses).filter(
  (s) => !RELEASED.has(s) && !UNREALIZED.has(s) && !UNCONFIRMED.has(s),
);

const gapWork = workAggs.get("yzy-gap-balenciaga");
const gapSources = Object.keys(gapWork?.sources ?? {}).length;

console.log(
  JSON.stringify(
    {
      people: people.length,
      years: Object.keys(years).length,
      domains: Object.keys(domains).length,
      works: worksIndex.map((w) => [w.slug, w.count, w.image_count]),
      projects_indexed: Object.keys(projects).filter((k) => projects[k].count >= 20).length,
      search_bytes: JSON.stringify(slim).length,
      shards: shards.size,
      image_records: imageTotal,
      image_mapped: imageMapped,
      image_coverage_pct: Number(coveragePct.toFixed(2)),
      unmapped_strings: unmappedRows.length,
      visual_bytes: visualJson.length,
      visual_gz: visualGz,
      yzy_gap_balenciaga_sources: gapWork?.sources ?? {},
      yzy_gap_balenciaga_source_count: gapSources,
      other_statuses: otherStatuses,
      idx_works: worksIndex.length,
      text_decades: [...textByDecade.keys()].sort(),
      derivatives_loaded: Object.keys(derivByHash).length,
    },
    null,
    2,
  ),
);

if (coveragePct < 90) {
  console.warn(
    `WARNING: image work_slug coverage ${coveragePct.toFixed(1)}% is under the 90% Phase 1 bar`,
  );
}
if (visualGz > 400 * 1024) {
  console.warn(`WARNING: visual.json gzip ${visualGz} exceeds 400KB`);
}
if (gapSources < 2) {
  console.warn(`WARNING: yzy-gap-balenciaga image records span ${gapSources} source(s); need ≥2`);
}

