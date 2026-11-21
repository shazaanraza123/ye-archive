/**
 * Image derivatives: WebP 400 / 1200 keyed by content hash.
 * Masters under public/archive/ are never deleted.
 *
 * Hosting is undecided — this writes local files under public/t/ so
 * imgUrl(hash, size) can switch to them later.
 *
 *   npx tsx scripts/build-images.ts           # dry-run
 *   npx tsx scripts/build-images.ts --limit 24
 *   npx tsx scripts/build-images.ts --all     # heavy; skip unless asked
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { ArchiveRecord } from "../scrapers/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const all = args.has("--all");
const limitArg = process.argv.find((a, i, arr) => arr[i - 1] === "--limit");
const limit = all ? Infinity : limitArg ? Number(limitArg) : 0;

type ImageRow = ArchiveRecord["images"][number] & { sha256?: string | null };
type Deriv = { hash: string; fit: "contain" | "cover"; bg: string; ar: number | null };

const records = JSON.parse(
  readFileSync(join(root, "data/archive.json"), "utf8"),
) as ArchiveRecord[];

function masterPath(local: string): string {
  if (local.startsWith("public/")) return join(root, local);
  if (local.startsWith("/")) return join(root, "public", local.slice(1));
  return join(root, local);
}

function cornerStats(buf: Buffer, width: number, height: number, channels: number) {
  const sample = 8;
  const corners = [
    [0, 0],
    [width - sample, 0],
    [0, height - sample],
    [width - sample, height - sample],
  ] as const;
  const avgs: number[][] = [];
  for (const [sx, sy] of corners) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let y = Math.max(0, sy); y < Math.min(height, sy + sample); y++) {
      for (let x = Math.max(0, sx); x < Math.min(width, sx + sample); x++) {
        const i = (y * width + x) * channels;
        r += buf[i] ?? 0;
        g += buf[i + 1] ?? buf[i] ?? 0;
        b += buf[i + 2] ?? buf[i] ?? 0;
        n += 1;
      }
    }
    avgs.push([r / n, g / n, b / n]);
  }
  const mean = avgs.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]).map((v) => v / 4);
  let spread = 0;
  for (const c of avgs) {
    spread += Math.abs(c[0] - mean[0]) + Math.abs(c[1] - mean[1]) + Math.abs(c[2] - mean[2]);
  }
  spread /= 4;
  const hex = mean.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  return { fit: (spread < 28 ? "contain" : "cover") as "contain" | "cover", bg: `#${hex}` };
}

const seen = new Map<string, string>();
const jobs: { abs: string; hash: string }[] = [];

for (const r of records) {
  for (const img of (r.images ?? []) as ImageRow[]) {
    if (!img.local_path) continue;
    const abs = masterPath(img.local_path);
    if (!existsSync(abs)) continue;
    const hash = img.sha256 || `${r.id}:${img.original_url}`;
    if (seen.has(hash)) continue;
    seen.set(hash, abs);
    jobs.push({ abs, hash });
  }
}

console.log(
  JSON.stringify({
    masters: jobs.length,
    mode: all ? "all" : limit > 0 ? `limit ${limit}` : "dry-run",
    note: "Masters are not deleted. Run --all only when you intend to generate bulk webp.",
  }),
);

if (limit === 0 && !all) {
  process.exit(0);
}

const take = jobs.slice(0, Number.isFinite(limit) ? limit : jobs.length);
const out400 = join(root, "public/t/400");
const out1200 = join(root, "public/t/1200");
mkdirSync(out400, { recursive: true });
mkdirSync(out1200, { recursive: true });

const manifest: Record<string, Deriv> = (() => {
  try {
    return (
      JSON.parse(readFileSync(join(root, "data/image-derivatives.json"), "utf8")).images ?? {}
    );
  } catch {
    return {};
  }
})();

let ok = 0;
let failed = 0;
for (const job of take) {
  try {
    const file = readFileSync(job.abs);
    const hash = job.hash.length === 64 ? job.hash : createHash("sha256").update(file).digest("hex");
    const img = sharp(file, { failOn: "none" });
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < 8 || h < 8) continue;
    const raw = await img
      .clone()
      .resize(Math.min(w, 64), Math.min(h, 64), { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const stats = cornerStats(raw.data, raw.info.width, raw.info.height, raw.info.channels);
    const ar = w && h ? w / h : null;
    await img
      .clone()
      .resize(400, 400, { fit: stats.fit, background: stats.bg })
      .webp({ quality: 76 })
      .toFile(join(out400, `${hash}.webp`));
    await img
      .clone()
      .resize(1200, 1200, { fit: stats.fit, background: stats.bg })
      .webp({ quality: 80 })
      .toFile(join(out1200, `${hash}.webp`));
    manifest[hash] = { hash, fit: stats.fit, bg: stats.bg, ar };
    ok += 1;
  } catch (err) {
    failed += 1;
    console.warn("skip", job.abs, (err as Error).message);
  }
}

writeFileSync(
  join(root, "data/image-derivatives.json"),
  JSON.stringify({ generated_at: new Date().toISOString(), images: manifest }, null, 2),
);

console.log(JSON.stringify({ written: ok, failed, manifest: Object.keys(manifest).length }));
