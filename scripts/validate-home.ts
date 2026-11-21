/**
 * Validate home.json + threads.json against composition rules (04, 05).
 * Writes src/data/home.generated.json for inlined first paint.
 * Does not modify data/archive.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

type WorkRow = {
  slug: string;
  name: string;
  years: [string, string];
  kind: string;
  parent: string | null;
  count: number;
  image_count: number;
  domains: Record<string, number>;
  covers: string[];
};

type ThreadDef = {
  slug: string;
  name: string;
  number: number;
  intro: string;
  ids: string[];
};

const home = JSON.parse(readFileSync(join(root, "src/data/home.json"), "utf8")) as { ids: string[] };
const threadsFile = JSON.parse(readFileSync(join(root, "src/data/threads.json"), "utf8")) as {
  threads: ThreadDef[];
};
const visual = JSON.parse(readFileSync(join(root, "public/idx/visual.json"), "utf8")) as VisualRow[];
const worksFile = JSON.parse(readFileSync(join(root, "public/idx/works.json"), "utf8")) as {
  works: WorkRow[];
};
const slim = JSON.parse(readFileSync(join(root, "public/search-index.json"), "utf8")) as {
  id: string;
  title: string;
  year: string | null;
  domain: string;
  type: string;
  work_slug?: string | null;
  img: string | null;
  source_name: string | null;
  source_url: string | null;
  status: string;
}[];

const visualById = new Map(visual.map((r) => [r.id, r]));
const slimById = new Map(slim.map((r) => [r.id, r]));
const errors: string[] = [];

if (!Array.isArray(home.ids) || home.ids.length !== 48) {
  errors.push(`home.json must have exactly 48 ids (got ${home.ids?.length ?? 0})`);
}

const seen = new Set<string>();
for (const id of home.ids) {
  if (seen.has(id)) errors.push(`duplicate home id ${id}`);
  seen.add(id);
  const row = visualById.get(id);
  if (!row) errors.push(`home id ${id} is not an image record in visual.json`);
  else if (!row.i) errors.push(`home id ${id} has no image path`);
}

const wall = home.ids.map((id) => visualById.get(id)).filter((r): r is VisualRow => Boolean(r));
const mediumCounts: Record<string, number> = {};
for (const r of wall) mediumCounts[r.m] = (mediumCounts[r.m] ?? 0) + 1;
for (const [m, n] of Object.entries(mediumCounts)) {
  if (n / 48 > 0.4) errors.push(`medium ${m} is ${(100 * n) / 48}% of the wall (max 40%)`);
}

const first12 = wall.slice(0, 12);
const first12Mediums = new Set(first12.map((r) => r.m));
if (first12Mediums.size < 5) {
  errors.push(`first 12 tiles span ${first12Mediums.size} mediums (need ≥5)`);
}

const decades = new Set(
  wall.map((r) => (r.y && /^\d{4}$/.test(r.y) ? `${r.y.slice(0, 3)}0s` : null)).filter(Boolean),
);
if (decades.size < 3) {
  errors.push(`wall covers ${[...decades].join(", ") || "no"} decades (need ≥3)`);
}

if (!threadsFile.threads?.length) errors.push("threads.json has no threads");
if (threadsFile.threads[0]?.slug !== "glow-in-the-dark") {
  errors.push("Thread 01 must be glow-in-the-dark");
}

for (const th of threadsFile.threads) {
  if (th.ids.length < 4 || th.ids.length > 12) {
    errors.push(`thread ${th.slug} has ${th.ids.length} ids (need 4–12)`);
  }
  const meds = new Set<string>();
  for (const id of th.ids) {
    const v = visualById.get(id);
    const s = slimById.get(id);
    if (!v && !s) errors.push(`thread ${th.slug} id ${id} is not in the archive`);
    meds.add((v?.m ?? s?.domain ?? "").toLowerCase());
  }
  if (meds.size < 3) errors.push(`thread ${th.slug} spans ${meds.size} mediums (need ≥3)`);
}

if (errors.length) {
  console.error(errors.map((e) => `HOME VALIDATION: ${e}`).join("\n"));
  process.exit(1);
}

const SOURCE_URLS: Record<string, string> = {
  "YZY Library": "https://www.yzylibrary.com/",
  "Yeezy Archive": "https://yeezyarchive.net/",
  "Paris Saint": "https://www.parisaint.com/",
  "Ye Tracker": "https://yetracker.cc/",
  "Ye Tour": "https://yetour.xyz/",
};

const sourceCounts: Record<string, number> = {};
for (const r of slim) {
  const n = r.source_name ?? "Unknown";
  sourceCounts[n] = (sourceCounts[n] ?? 0) + 1;
}

function tileOf(row: VisualRow, index: number) {
  return {
    id: row.id,
    t: row.t,
    y: row.y,
    m: row.m,
    w: row.w,
    s: row.s,
    src: row.src,
    i: row.i,
    f: (index % 2 === 0 ? "contain" : "cover") as "contain" | "cover",
    bg: row.bg ?? null,
  };
}

function resolveThreadTile(id: string) {
  const v = visualById.get(id);
  if (v) return { id: v.id, t: v.t, y: v.y, m: v.m, w: v.w, i: v.i, src: v.src };
  const s = slimById.get(id);
  if (!s) return null;
  return {
    id: s.id,
    t: s.title,
    y: s.year,
    m: s.domain.toLowerCase(),
    w: s.work_slug ?? null,
    i: s.img,
    src: s.source_name,
  };
}

const generated = {
  records: slim.length,
  with_images: visual.length,
  wall: wall.map((r, i) => tileOf(r, i)),
  threads: threadsFile.threads.map((th) => ({
    ...th,
    covers: th.ids.map(resolveThreadTile).filter(Boolean),
  })),
  works: worksFile.works
    .filter((w) => w.image_count > 0 && w.covers[0] && visualById.has(w.covers[0]))
    .sort((a, b) => a.years[0].localeCompare(b.years[0]) || a.name.localeCompare(b.name))
    .map((w) => {
      const cover = visualById.get(w.covers[0])!;
      return {
        slug: w.slug,
        name: w.name,
        years: w.years,
        cover: { id: cover.id, t: cover.t, y: cover.y, m: cover.m, i: cover.i, bg: cover.bg ?? null },
      };
    }),
  sources: Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      url: SOURCE_URLS[name] ?? null,
    })),
  composition: {
    first12_mediums: [...first12Mediums],
    medium_counts: mediumCounts,
    decades: [...decades].sort(),
  },
};

writeFileSync(join(root, "src/data/home.generated.json"), JSON.stringify(generated));

console.log(
  JSON.stringify(
    {
      ok: true,
      records: generated.records,
      with_images: generated.with_images,
      first12_mediums: generated.composition.first12_mediums,
      medium_counts: mediumCounts,
      decades: generated.composition.decades,
      threads: generated.threads.map((t) => [t.slug, t.covers.length]),
      works_strip: generated.works.length,
    },
    null,
    2,
  ),
);
