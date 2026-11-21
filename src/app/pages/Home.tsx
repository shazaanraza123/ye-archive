import { Link } from "react-router";
import home from "@/data/home.generated.json";
import { Tile } from "../components/Tile";

type WallTile = (typeof home)["wall"][number];

export function Home() {
  const count = `${home.records.toLocaleString()} RECORDS · ${home.with_images.toLocaleString()} WITH IMAGES`;

  return (
    <main className="home">
      <p className="home__count meta">{count}</p>
      <section className="wall" aria-label="Homepage wall">
        {home.wall.map((tile: WallTile, i: number) => (
          <Tile key={tile.id} tile={tile} eager={i < 12} />
        ))}
      </section>
      <p className="home__enter">
        <Link to="/archive">Enter the archive</Link>
      </p>
      <section className="home__threads" aria-label="Threads">
        <h2 className="meta meta-ink">Threads</h2>
        <div className="home__thread-row">
          {home.threads.map((th) => {
            const cover = th.covers.find((c) => c?.i) ?? th.covers[0];
            return (
              <Link key={th.slug} to={`/thread/${th.slug}`} className="home__thread">
                {cover ? <Tile tile={{ ...cover, f: "cover" }} to={false} /> : null}
                <span className="meta">
                  Thread {String(th.number).padStart(2, "0")}
                </span>
                <span className="home__thread-name">{th.name}</span>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="home__works" aria-label="Works">
        <h2 className="meta meta-ink">Works</h2>
        <div className="home__works-strip">
          {home.works.map((w) => (
            <Link key={w.slug} to={`/work/${w.slug}`} className="home__work">
              <Tile tile={{ ...w.cover, f: "contain" }} to={false} />
              <span className="home__work-name">{w.name}</span>
              <span className="meta">
                {w.years[0]}
                {w.years[1] !== w.years[0] ? `–${w.years[1]}` : ""}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <footer className="home__foot">
        <p className="meta meta-ink">Sources</p>
        <ul>
          {home.sources.map((s) => (
            <li key={s.name}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
              ) : (
                s.name
              )}
              {" · "}
              <Link to={`/archive?src=${encodeURIComponent(s.name)}`}>{s.count.toLocaleString()}</Link>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}
