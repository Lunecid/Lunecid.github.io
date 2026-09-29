// P-04 (F-026): is a footer link the current page? Paths compare without query, hash or a trailing index.html, with one trailing slash.
const normalise = (path: string): string => {
  const bare = (path.split(/[?#]/)[0] ?? '').replace(/index\.html$/, '');
  return bare.endsWith('/') ? bare : `${bare}/`;
};

export function isCurrentPath(href: string, pathname: string): boolean {
  return normalise(href) === normalise(pathname);
}
