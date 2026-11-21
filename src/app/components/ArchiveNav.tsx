import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { MEDIUMS, NAV, NAV_SHORTCUTS } from "@/lib/archive";
import { useBoard } from "../board-context";

function isOn(to: string, pathname: string) {
  if (to === "/archive") return pathname === "/archive";
  if (to === "/work") return pathname === "/work" || pathname.startsWith("/work/") || pathname.startsWith("/era/");
  if (to === "/board") return pathname === "/board";
  if (to === "/medium") {
    return (
      pathname === "/medium" ||
      pathname.startsWith("/medium/") ||
      pathname === "/music" ||
      pathname.startsWith("/fashion/")
    );
  }
  if (to === "/unrealized") return pathname === "/unrealized";
  return pathname === to;
}

export function ArchiveNav() {
  const loc = useLocation();
  const nav = useNavigate();
  const board = useBoard();
  const searchOn = loc.pathname === "/search";
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setSheet(false);
  }, [loc.pathname]);

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);

  const boardLabel = board.count > 0 ? `Board (${board.count})` : "Board";

  return (
    <header className="ye-nav">
      <NavLink to="/" className="ye-nav__mark">
        YE ARCHIVE
      </NavLink>
      <span />
      <nav className="ye-nav__views" aria-label="Archive views">
        {NAV.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={() => (isOn(item.to, loc.pathname) ? "is-on" : "")}
          >
            {item.label === "Board" ? boardLabel : item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={searchOn ? "is-on" : ""}
          onClick={() => nav("/search")}
          aria-label="Search"
        >
          Search
        </button>
      </nav>
      <div className="ye-nav__mobile">
        <button type="button" className={searchOn ? "is-on" : ""} onClick={() => nav("/search")} aria-label="Search">
          ⌕
        </button>
        <button type="button" aria-label="Menu" aria-expanded={sheet} onClick={() => setSheet(true)}>
          ≡
        </button>
      </div>
      {sheet ? (
        <div className="ye-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="ye-sheet__bar">
            <span className="ye-nav__mark">YE ARCHIVE</span>
            <button type="button" onClick={() => setSheet(false)} aria-label="Close menu">
              Close
            </button>
          </div>
          <nav className="ye-sheet__nav">
            {NAV.map((item) => (
              <NavLink key={item.label} to={item.to} className={() => (isOn(item.to, loc.pathname) ? "is-on" : "")}>
                {item.label === "Board" ? boardLabel : item.label}
              </NavLink>
            ))}
            <NavLink to="/search" className={() => (searchOn ? "is-on" : "")}>
              Search
            </NavLink>
          </nav>
          <p className="meta ye-sheet__k">Medium</p>
          <nav className="ye-sheet__nav ye-sheet__nav--sub">
            {MEDIUMS.map((m) => (
              <NavLink key={m.slug} to={m.entry}>
                {m.domain}
              </NavLink>
            ))}
            {NAV_SHORTCUTS.filter((s) => s.to !== "/medium").map((item) => (
              <NavLink key={item.label} to={item.to} className={() => (isOn(item.to, loc.pathname) ? "is-on" : "")}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}
      {board.toast ? (
        <div className="ye-toast" role="status">
          {board.toast === "SAVED · VIEW BOARD" ? (
            <NavLink to="/board">SAVED · VIEW BOARD</NavLink>
          ) : (
            board.toast
          )}
        </div>
      ) : null}
    </header>
  );
}
