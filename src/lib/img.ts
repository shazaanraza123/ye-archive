export type ImgSize = 400 | 1200 | "master";

function publicSrc(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return null;
  if (path.startsWith("/")) return path;
  if (path.startsWith("public/")) return "/" + path.slice("public/".length);
  return "/" + path;
}

/**
 * Single image URL helper. Hosting is undecided (no R2 / CDN yet).
 *
 * Today every size still resolves to the local master under `/archive/…`.
 * When derivatives exist they will live at `/t/{400|1200}/{hash}.webp`.
 * Swap the body of this function when that lands; call sites stay `imgUrl(hash, size)`.
 */
export function imgUrl(
  hash: string,
  size: ImgSize,
  masterSrc?: string | null,
): string {
  if (size !== "master" && hash) {
    const derived = `/t/${size}/${hash}.webp`;
    // Derivatives are opt-in (scripts/build-images.ts). Until a file is
    // known to exist we keep serving the master so tiles never 404.
    void derived;
  }
  const master = publicSrc(masterSrc);
  if (master) return master;
  if (size === "master") return `/t/master/${hash}`;
  return `/t/${size}/${hash}.webp`;
}
