import { useRef, type MouseEvent, type PointerEvent } from "react";
import { Link } from "react-router";
import { imgUrl } from "@/lib/img";
import { useBoard } from "../board-context";

export type TileData = {
  id: string;
  t: string;
  y: string | null;
  m: string;
  i?: string | null;
  f?: "contain" | "cover";
  bg?: string | null;
  src?: string | null;
  w?: string | null;
};

type Props = {
  tile: TileData;
  sizes?: 400 | 1200;
  labeled?: boolean;
  eager?: boolean;
  /** Record link by default. `false` renders a non-interactive face (parent is the link). */
  to?: string | false;
};

export function Tile({ tile, sizes = 400, labeled = false, eager = false, to }: Props) {
  const board = useBoard();
  const saved = board.has(tile.id);
  const press = useRef<number | null>(null);
  const src = tile.i ? imgUrl("", sizes, tile.i) : null;
  const fit = tile.f ?? "contain";
  const alt = [tile.t, tile.y, tile.m].filter(Boolean).join(" · ");
  const href = to === false ? null : (to ?? `/record/${tile.id}`);
  const className = `tile${fit === "cover" ? " tile--cover" : " tile--contain"}${saved ? " is-saved" : ""}${src ? "" : " tile--text"}`;

  function onSave(e: MouseEvent | PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    board.toggle(tile.id);
  }

  const body = (
    <>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="tile__img"
        />
      ) : (
        <span className="tile__text" aria-hidden="true">
          {tile.t}
        </span>
      )}
      {saved ? <span className="tile__mark" aria-hidden="true" /> : null}
      {href ? (
        <span className="tile__band">
          <span>
            {tile.t}
            {tile.y ? ` · ${tile.y}` : ""}
          </span>
          <button type="button" className="tile__save" aria-label={saved ? "Remove from board" : "Save to board"} onClick={onSave}>
            {saved ? "■" : "□"}
          </button>
        </span>
      ) : null}
      {href && tile.src ? <span className="tile__credit">{tile.src}</span> : null}
      {labeled ? <span className="tile__label">{tile.m}</span> : null}
    </>
  );

  const pointer = {
    onPointerDown: () => {
      press.current = window.setTimeout(() => board.toggle(tile.id), 520);
    },
    onPointerUp: () => {
      if (press.current) window.clearTimeout(press.current);
      press.current = null;
    },
    onPointerLeave: () => {
      if (press.current) window.clearTimeout(press.current);
      press.current = null;
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };

  if (!href) {
    return (
      <div className={className} style={tile.bg ? { background: tile.bg } : undefined} aria-hidden="true">
        {body}
      </div>
    );
  }

  return (
    <Link
      to={href}
      className={className}
      style={tile.bg ? { background: tile.bg } : undefined}
      aria-label={alt}
      {...pointer}
    >
      {body}
    </Link>
  );
}
