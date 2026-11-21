import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import {
  GLOW_ID,
  dash,
  displayDate,
  loadRecord,
  loadSearchIndex,
  loadVisualIndex,
  loadWorksIndex,
  slugify,
  statusKind,
  type PackedRecord,
  type SearchHit,
  type VisualRow,
  type WorkSummary,
} from "@/lib/archive";
import { imgUrl } from "@/lib/img";
import { relatedGroups, type RelatedGroup } from "@/lib/related";
import { useBoard } from "../board-context";
import { Tile } from "../components/Tile";

export function RecordPage() {
  const { id = GLOW_ID } = useParams();
  const board = useBoard();
  const [found, setFound] = useState<PackedRecord | null>(null);
  const [missing, setMissing] = useState(false);
  const [index, setIndex] = useState<SearchHit[] | null>(null);
  const [visual, setVisual] = useState<VisualRow[] | null>(null);
  const [works, setWorks] = useState<WorkSummary[] | null>(null);
  const [view, setView] = useState(0);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setFound(null);
    setMissing(false);
    setView(0);
    setZoom(false);
    let alive = true;
    loadRecord(id).then((row) => {
      if (!alive) return;
      if (row) setFound(row);
      else setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    let alive = true;
    loadSearchIndex().then((rows) => {
      if (alive) setIndex(rows);
    });
    loadVisualIndex().then((rows) => {
      if (alive) setVisual(rows);
    });
    loadWorksIndex().then((rows) => {
      if (alive) setWorks(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const images = useMemo(() => {
    if (!found) return [];
    return found.images.filter((img) => img.local_path);
  }, [found]);

  const related: RelatedGroup[] = useMemo(() => {
    if (!found || !visual) return [];
    return relatedGroups(found, visual, index);
  }, [found, visual, index]);

  if (missing) {
    return (
      <main className="ye-page">
        <p className="meta">Record not in the local archive.</p>
      </main>
    );
  }

  if (!found) {
    return (
      <main className="ye-page">
        <p className="meta">Loading record…</p>
      </main>
    );
  }

  const current = images[view] ?? images[0];
  const src = current
    ? imgUrl(current.hash ?? "", 1200, current.local_path)
    : null;
  const unconfirmed = statusKind(found.status) === "unconfirmed";
  const saved = board.has(found.id);
  const people = found.people.filter(Boolean);
  const workDef = found.work_slug ? works?.find((w) => w.slug === found.work_slug) : undefined;
  const workHref = found.work_slug
    ? `/work/${found.work_slug}`
    : found.project
      ? `/work/${slugify(found.project)}`
      : null;
  const workLabel = workDef?.name ?? found.work_slug ?? found.project;
  const shownDate = displayDate(found.date, found.year);

  return (
    <main key={found.id} className={`record-v2${zoom ? " is-zoom" : ""}`}>
      <div className="record-v2__media">
        {src ? (
          <button type="button" className="record-v2__frame" onClick={() => setZoom((z) => !z)} aria-label="Zoom image">
            <img src={src} alt={[found.title, found.year, found.domain].filter(Boolean).join(" · ")} />
          </button>
        ) : (
          <div className="record-v2__text" aria-hidden="true">
            {found.title}
          </div>
        )}
        {images.length > 1 ? (
          <div className="record-v2__strip" aria-label="More images">
            {images.map((img, i) => {
              const thumb = imgUrl(img.hash ?? "", 400, img.local_path);
              return (
                <button
                  key={`${img.original_url}-${i}`}
                  type="button"
                  className={i === view ? "is-on" : ""}
                  onClick={() => {
                    setView(i);
                    setZoom(false);
                  }}
                >
                  <img src={thumb} alt="" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <aside className="record-v2__meta">
        <p className="meta">
          {found.domain}
          {found.type ? ` · ${found.type}` : ""}
          {unconfirmed ? ` · ${found.status}` : ""}
        </p>
        <h1 className="record-v2__title">{found.title}</h1>
        <div className="record-v2__actions">
          <button type="button" className="record-v2__save" onClick={() => board.toggle(found.id)}>
            {saved ? "Saved" : "Save"}
          </button>
        </div>
        <dl className="record__meta">
          {shownDate && shownDate !== found.year ? (
            <>
              <dt className="record__k">Date</dt>
              <dd className="record__v">{dash(shownDate)}</dd>
            </>
          ) : null}
          {found.year ? (
            <>
              <dt className="record__k">Year</dt>
              <dd className="record__v">
                <Link to={`/year/${found.year}`}>{found.year}</Link>
              </dd>
            </>
          ) : null}
          {workHref ? (
            <>
              <dt className="record__k">Work</dt>
              <dd className="record__v">
                <Link to={workHref}>{workLabel}</Link>
              </dd>
            </>
          ) : null}
          {found.domain ? (
            <>
              <dt className="record__k">Medium</dt>
              <dd className="record__v">
                <Link to={`/medium/${found.domain.toLowerCase()}`}>{found.domain}</Link>
                {found.type ? ` / ${found.type}` : ""}
              </dd>
            </>
          ) : null}
          {found.status ? (
            <>
              <dt className="record__k">Status</dt>
              <dd className="record__v">
                {found.status}
                {found.status_source_term ? ` · ${found.status_source_term}` : ""}
              </dd>
            </>
          ) : null}
          {people.length ? (
            <>
              <dt className="record__k">People</dt>
              <dd className="record__v">
                {people.map((p, i) => {
                  const compound = /[,&/]|\band\b/i.test(p);
                  return (
                    <span key={`${p}-${i}`}>
                      {i ? " · " : null}
                      {compound ? p : <Link to={`/people/${slugify(p)}`}>{p}</Link>}
                    </span>
                  );
                })}
              </dd>
            </>
          ) : null}
          {found.source.name ? (
            <>
              <dt className="record__k">Source</dt>
              <dd className="record__v">
                {found.source.url ? (
                  <a href={found.source.url} target="_blank" rel="noreferrer">
                    {found.source.name}
                  </a>
                ) : (
                  found.source.name
                )}
              </dd>
            </>
          ) : null}
          {found.description ? (
            <>
              <dt className="record__k">Note</dt>
              <dd className="record__v">{found.description}</dd>
            </>
          ) : null}
        </dl>
      </aside>
      <div className="record-v2__related">
        {related.map((group) =>
          group.rows.length ? (
            <section key={group.key} className="related">
              <h2 className="meta meta-ink">{group.label}</h2>
              <div className="related__row">
                {group.rows.map((row) => (
                  <Tile
                    key={row.id}
                    tile={{
                      id: row.id,
                      t: row.t,
                      y: row.y,
                      m: row.m,
                      i: row.i,
                      src: row.src,
                      w: row.w,
                      f: "contain",
                    }}
                    labeled
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </main>
  );
}
