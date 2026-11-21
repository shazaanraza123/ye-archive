import curatedJson from "../data/curated.json";

export { imgUrl, type ImgSize } from "./img";

export type SearchHit = {
  id: string;
  title: string;
  year: string | null;
  date: string | null;
  era: string | null;
  project: string | null;
  domain: string;
  type: string;
  subtype: string | null;
  status: string;
  status_source_term: string | null;
  people: string[];
  names?: string[];
  source_name: string | null;
  source_url: string | null;
  img: string | null;
  desc?: string;
  confidence: "high" | "medium" | "low";
  work_slug?: string | null;
};

export type PackedRecord = {
  id: string;
  title: string;
  date: string | null;
  year: string | null;
  domain: string;
  type: string;
  subtype: string | null;
  era: string | null;
  project: string | null;
  status: string;
  status_source_term: string | null;
  description: string | null;
  people: string[];
  organizations: string[];
  related_records: string[];
  related_unresolved?: number;
  references: string[];
  source: { name: string; url: string };
  source_claims: {
    field: string;
    value: string;
    source_name: string;
    source_url: string;
  }[];
  confidence: string;
  work_slug?: string | null;
  images: {
    local_path: string | null;
    original_url: string;
    source_page: string;
    width: number | null;
    height: number | null;
    caption: string | null;
    role: string;
    editorial_role?: string;
    hash?: string | null;
    fit?: "contain" | "cover";
    bg?: string;
  }[];
};

export type AxisRow = {
  id: string;
  title: string;
  year: string | null;
  date: string | null;
  type: string;
  subtype: string | null;
  status: string;
  status_source_term: string | null;
  era: string | null;
  project: string | null;
  domain: string;
  source: { name: string; url: string };
  img: string | null;
};

export type FigmaItem = {
  screen: string;
  file: string;
  record_id: string;
  record_title: string;
  source_name: string;
  source_page: string;
  original_image_url: string;
  master_local_path: string;
  intended_position_role: string;
  image_role: string;
  year: string | null;
  era: string | null;
  status: string;
  status_source_term: string;
  src: string;
  master_src: string | null;
  record: PackedRecord | null;
};

export type Curated = {
  generated_at: string;
  note: string;
  figma: FigmaItem[];
  glow: { primary_id: string; records: PackedRecord[] };
  fashion_id: string;
  music_axis: { demo: AxisRow[]; version: AxisRow[]; release: AxisRow[] };
  yeezus_domains: Record<string, AxisRow[]>;
  domains: string[];
  record_count: number;
};

export const curated = curatedJson as Curated;

export const GLOW_ID = "yetracker-3b678731de5e1b3a";
export const FASHION_ID = "yzylibrary-c5ad330858772531";

export const MEDIUMS = [
  { slug: "music", domain: "MUSIC", entry: "/music" },
  { slug: "fashion", domain: "FASHION", entry: "/fashion/regular-fit-ls-tee-h03" },
  { slug: "performance", domain: "PERFORMANCE", entry: "/medium/performance" },
  { slug: "film", domain: "FILM", entry: "/medium/film" },
  { slug: "design", domain: "DESIGN", entry: "/era/yeezus" },
  { slug: "photography", domain: "PHOTOGRAPHY", entry: "/medium/photography" },
  { slug: "objects", domain: "OBJECTS", entry: "/medium/objects" },
  { slug: "ephemera", domain: "EPHEMERA", entry: "/medium/ephemera" },
  { slug: "writing", domain: "WRITING", entry: "/medium/writing" },
] as const;

export const UNREALIZED_STATUSES = [
  "UNRELEASED",
  "PROTOTYPE",
  "SAMPLE",
  "CONCEPT",
  "CANCELLED",
  "LOST",
  "NEVER RECORDED",
  "UNCONFIRMED",
  "RUMORED",
  "PARTIAL",
  "CONFLICTING SOURCES",
];

export function figmaScreen(screen: string): FigmaItem[] {
  return curated.figma.filter((item) => item.screen === screen);
}

export function figmaByRecord(id: string): FigmaItem[] {
  return curated.figma.filter((item) => item.record_id === id);
}

export function packedById(id: string): PackedRecord | null {
  for (const item of curated.figma) {
    if (item.record_id === id && item.record) return item.record;
  }
  return curated.glow.records.find((r) => r.id === id) ?? null;
}

export function localSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return null;
  if (path.startsWith("/")) return path;
  if (path.startsWith("public/")) return "/" + path.slice("public/".length);
  if (path.startsWith("figma-export/")) return "/" + path;
  return "/" + path;
}

export function statusKind(status: string | null | undefined): "fact" | "claim" | "unconfirmed" {
  const s = (status ?? "").toUpperCase();
  if (s === "UNCONFIRMED" || s === "RUMORED" || s === "CONFLICTING SOURCES") return "unconfirmed";
  if (
    s === "RELEASED" ||
    s === "REALIZED" ||
    s === "FULL" ||
    s === "UNRELEASED" ||
    s === "PROTOTYPE" ||
    s === "SAMPLE" ||
    s === "CONCEPT" ||
    s === "CANCELLED" ||
    s === "LOST" ||
    s === "PARTIAL" ||
    s === "NEVER RECORDED"
  ) {
    return "fact";
  }
  return "claim";
}

export function dash(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v.length ? v : "—";
}

export function shardKey(id: string): string {
  const hex = id.includes("-") ? id.slice(id.lastIndexOf("-") + 1) : id;
  return hex.slice(0, 2).toLowerCase().replace(/[^0-9a-f]/g, "0").padEnd(2, "0");
}

const shardCache = new Map<string, Promise<PackedRecord[]>>();

export function loadRecordShard(id: string): Promise<PackedRecord[]> {
  const key = shardKey(id);
  if (!shardCache.has(key)) {
    shardCache.set(
      key,
      fetch(`/records/${key}.json`).then((res) => {
        if (!res.ok) return [];
        return res.json();
      }),
    );
  }
  return shardCache.get(key)!;
}

export async function loadRecord(id: string): Promise<PackedRecord | null> {
  const rows = await loadRecordShard(id);
  return rows.find((r) => r.id === id) ?? packedById(id);
}

let indexPromise: Promise<SearchHit[]> | null = null;

export function loadSearchIndex(): Promise<SearchHit[]> {
  if (!indexPromise) {
    indexPromise = fetch("/search-index.json").then((res) => {
      if (!res.ok) throw new Error("search-index missing");
      return res.json();
    });
  }
  return indexPromise;
}

export type YearIndex = { year: string; count: number; domains: Record<string, number>; with_image: number };
export type DomainIndex = {
  domain: string;
  slug: string;
  count: number;
  with_image: number;
  types: { type: string; count: number }[];
};
export type WorkIndex = {
  slug: string;
  label: string;
  name?: string;
  count: number;
  domains: Record<string, number>;
  years: Record<string, number>;
  project?: string[];
  era?: string[];
  titleIncludes?: string[];
  kind?: "album" | "season" | "tour" | "collab" | "film" | "other";
  parent?: string;
};
export type PersonIndex = {
  slug: string;
  display_name: string;
  record_count: number;
  domains: string[];
  years: string[];
  aliases?: string[];
  original_fields?: string[];
};

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return s || "untitled";
}

export function hitMatchesWork(hit: SearchHit, work: WorkIndex): boolean {
  if (hit.work_slug && hit.work_slug === work.slug) return true;
  if (work.project?.includes(hit.project ?? "")) return true;
  if (work.era?.includes(hit.era ?? "")) return true;
  if (work.titleIncludes?.some((t) => hit.title.includes(t))) return true;
  return false;
}

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function loadJson<T>(url: string): Promise<T> {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(url);
    return res.json();
  });
}

export type VisualRow = {
  id: string;
  t: string;
  y: string | null;
  m: string;
  ty?: string;
  w: string | null;
  s?: string;
  src?: string | null;
  i: string | null;
  f?: "contain" | "cover";
  bg?: string;
};

let visualPromise: Promise<VisualRow[]> | null = null;

export function loadVisualIndex(): Promise<VisualRow[]> {
  if (!visualPromise) {
    visualPromise = fetch("/idx/visual.json").then((res) => {
      if (!res.ok) throw new Error("visual index missing");
      return res.json();
    });
  }
  return visualPromise;
}

export type WorkSummary = { slug: string; name: string; years: [string, string] };

let worksPromise: Promise<WorkSummary[]> | null = null;

export function loadWorksIndex(): Promise<WorkSummary[]> {
  if (!worksPromise) {
    worksPromise = fetch("/idx/works.json")
      .then((res) => {
        if (!res.ok) throw new Error("works index missing");
        return res.json();
      })
      .then((data: { works: WorkSummary[] }) => data.works);
  }
  return worksPromise;
}

export function displayDate(date: string | null | undefined, year: string | null | undefined): string | null {
  const d = (date ?? "").trim();
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d)) return d;
  const y = (year ?? "").trim();
  return y || null;
}

export function matchHit(hit: SearchHit, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return false;
  const hay = [
    hit.title,
    hit.year,
    hit.era,
    hit.project,
    hit.domain,
    hit.type,
    hit.subtype,
    hit.status,
    hit.status_source_term,
    hit.desc,
    ...(hit.people ?? []),
    ...(hit.names ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export type BrowseFilter = {
  year?: string;
  era?: string;
  domain?: string;
  type?: string;
  subtype?: string;
  project?: string;
  status?: string;
  person?: string;
  source?: string;
  q?: string;
};

export function filterHits(rows: SearchHit[], f: BrowseFilter): SearchHit[] {
  return rows.filter((h) => {
    if (f.year && h.year !== f.year) return false;
    if (f.era && h.era !== f.era) return false;
    if (f.domain && h.domain !== f.domain) return false;
    if (f.type && h.type !== f.type) return false;
    if (f.subtype && h.subtype !== f.subtype) return false;
    if (f.project && h.project !== f.project) return false;
    if (f.status && h.status !== f.status) return false;
    if (f.source && h.source_name !== f.source) return false;
    if (f.person) {
      const p = f.person.toLowerCase();
      const names = [...(h.people ?? []), ...(h.names ?? [])].map((n) => n.toLowerCase());
      if (!names.some((n) => n === p || n.includes(p))) return false;
    }
    if (f.q && !matchHit(h, f.q)) return false;
    return true;
  });
}

export function sortHits(rows: SearchHit[], sort: "chrono" | "reverse" | "title"): SearchHit[] {
  const copy = [...rows];
  if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    copy.sort((a, b) => {
      const ay = a.year ?? "0000";
      const by = b.year ?? "0000";
      if (ay !== by) return sort === "chrono" ? ay.localeCompare(by) : by.localeCompare(ay);
      return a.title.localeCompare(b.title);
    });
  }
  return copy;
}

export const NAV = [
  { label: "Archive", to: "/archive" },
  { label: "Work", to: "/work" },
  { label: "Board", to: "/board" },
] as const;

export const NAV_SHORTCUTS = [
  { label: "Medium", to: "/medium" },
  { label: "Unrealized", to: "/unrealized" },
] as const;

export const PAGE_SIZE = 40;
