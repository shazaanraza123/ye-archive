import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { ArchiveShell } from "./ArchiveShell";
import { Home } from "./pages/Home";
import { BoardPage } from "./pages/Board";
import { ThreadPage } from "./pages/Thread";
import { ArchiveField } from "./pages/ArchiveField";
import { EraYeezus } from "./pages/EraYeezus";
import { RecordPage } from "./pages/Record";
import { Music } from "./pages/Music";
import { Fashion } from "./pages/Fashion";
import { Unrealized } from "./pages/Unrealized";
import { Connections } from "./pages/Connections";
import { People } from "./pages/People";
import { Person } from "./pages/Person";
import { Medium } from "./pages/Medium";
import { MediumSlug } from "./pages/MediumSlug";
import { Time } from "./pages/Time";
import { Year } from "./pages/Year";
import { WorkIndexPage } from "./pages/Work";
import { WorkSlug } from "./pages/WorkSlug";

function Root() {
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: ArchiveShell,
    children: [
      { index: true, Component: Home },
      { path: "board", Component: BoardPage },
      { path: "thread/:slug", Component: ThreadPage },
      { path: "archive", Component: ArchiveField },
      { path: "era/yeezus", Component: EraYeezus },
      { path: "record", element: <Navigate to="/record/yetracker-3b678731de5e1b3a" replace /> },
      { path: "record/:id", Component: RecordPage },
      { path: "music", Component: Music },
      { path: "fashion/regular-fit-ls-tee-h03", Component: Fashion },
      { path: "unrealized", Component: Unrealized },
      { path: "connections", Component: Connections },
      { path: "people", Component: People },
      { path: "people/:slug", Component: Person },
      { path: "medium", Component: Medium },
      { path: "medium/:slug", Component: MediumSlug },
      { path: "medium/:slug/:type", Component: MediumSlug },
      { path: "time", Component: Time },
      { path: "year/:year", Component: Year },
      { path: "work", Component: WorkIndexPage },
      { path: "work/:slug", Component: WorkSlug },
      { path: "search", Component: Root },
    ],
  },
]);
