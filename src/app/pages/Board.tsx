import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { loadSearchIndex, loadVisualIndex, type SearchHit, type VisualRow } from "@/lib/archive";
import { useBoard } from "../board-context";
import { Tile, type TileData } from "../components/Tile";

export function BoardPage() {
  const board = useBoard();
  const [visual, setVisual] = useState<VisualRow[] | null>(null);
  const [index, setIndex] = useState<SearchHit[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadVisualIndex().then((rows) => {
      if (alive) setVisual(rows);
    });
    loadSearchIndex().then((rows) => {
      if (alive) setIndex(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const tiles = useMemo<TileData[]>(() => {
    return board.ids.map((id) => {
      const v = visual?.find((r) => r.id === id);
      if (v) {
        return { id: v.id, t: v.t, y: v.y, m: v.m, i: v.i, src: v.src, w: v.w, f: "contain" };
      }
      const h = index?.find((r) => r.id === id);
      return {
        id,
        t: h?.title ?? id,
        y: h?.year ?? null,
        m: (h?.domain ?? "").toLowerCase(),
        i: h?.img ?? null,
        src: h?.source_name,
        w: h?.work_slug ?? null,
      };
    });
  }, [board.ids, visual, index]);

  return (
    <main className="home board-page">
      <p className="meta home__count">
        Board
        {board.count ? ` · ${board.count}` : ""}
      </p>
      {!board.count ? (
        <p className="meta" style={{ padding: "24px 16px" }}>
          Nothing saved. Long-press a tile or use Save on a record.
        </p>
      ) : (
        <section className="wall" aria-label="Saved records">
          {tiles.map((tile) => (
            <Tile key={tile.id} tile={tile} />
          ))}
        </section>
      )}
      <p className="home__enter">
        <Link to="/">Home</Link>
      </p>
    </main>
  );
}
