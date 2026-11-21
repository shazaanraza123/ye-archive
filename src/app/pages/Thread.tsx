import { Link, useParams } from "react-router";
import home from "@/data/home.generated.json";
import { Tile } from "../components/Tile";

export function ThreadPage() {
  const { slug = "" } = useParams();
  const thread = home.threads.find((t) => t.slug === slug);

  if (!thread) {
    return (
      <main className="ye-page">
        <p className="meta">No thread uses that name.</p>
        <Link to="/" className="meta">
          ← Home
        </Link>
      </main>
    );
  }

  return (
    <main className="home thread-page">
      <p className="meta home__count">
        Thread {String(thread.number).padStart(2, "0")}
      </p>
      <h1 className="thread-page__name">{thread.name}</h1>
      <p className="thread-page__intro">{thread.intro}</p>
      <section className="wall" aria-label={thread.name}>
        {thread.covers.map((cover) =>
          cover ? <Tile key={cover.id} tile={{ ...cover, f: cover.i ? "contain" : undefined }} labeled /> : null,
        )}
      </section>
    </main>
  );
}
