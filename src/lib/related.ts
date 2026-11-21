import type { PackedRecord, SearchHit, VisualRow } from "./archive";

export type { VisualRow };

export type RelatedGroup = {
  key: "same-work-other-medium" | "documented" | "same-work" | "same-year";
  label: string;
  rows: VisualRow[];
};

const CAP = 12;

function asVisual(hit: SearchHit): VisualRow {
  return {
    id: hit.id,
    t: hit.title,
    y: hit.year,
    m: hit.domain.toLowerCase(),
    w: hit.work_slug ?? null,
    i: hit.img,
    src: hit.source_name,
  };
}

export function relatedGroups(
  rec: PackedRecord,
  visual: VisualRow[],
  index: SearchHit[] | null,
): RelatedGroup[] {
  const used = new Set<string>([rec.id]);
  const medium = rec.domain.toLowerCase();
  const work = rec.work_slug ?? null;
  const year = rec.year;

  const take = (rows: VisualRow[]) => {
    const out: VisualRow[] = [];
    for (const row of rows) {
      if (used.has(row.id)) continue;
      used.add(row.id);
      out.push(row);
      if (out.length >= CAP) break;
    }
    return out;
  };

  const sameWorkOther = work
    ? take(visual.filter((v) => v.w === work && v.m !== medium && v.i))
    : [];

  const documented: VisualRow[] = [];
  if (index) {
    for (const id of rec.related_records) {
      if (used.has(id) || documented.length >= CAP) continue;
      const hit = index.find((h) => h.id === id);
      if (!hit) continue;
      used.add(id);
      documented.push(asVisual(hit));
    }
  }

  const sameWork = work ? take(visual.filter((v) => v.w === work && v.i)) : [];
  const sameYear = year
    ? take(visual.filter((v) => v.y === year && v.i && v.w !== work))
    : [];

  return [
    { key: "same-work-other-medium", label: "SAME WORK · OTHER MEDIUM", rows: sameWorkOther },
    { key: "documented", label: "DOCUMENTED LINK", rows: documented },
    { key: "same-work", label: "SAME WORK", rows: sameWork },
    { key: "same-year", label: "SAME YEAR", rows: sameYear },
  ];
}
