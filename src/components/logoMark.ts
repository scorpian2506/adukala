// Geometry of the Adukala mark, shared by <LogoMark> and scripts/gen-icons.mts
// so the in-app logo and the app icons can never drift apart.
//
// A flame of chilli red over a turmeric uruli: the wide, shallow bell-metal pot
// of a Kerala kitchen, seen side-on. The rim runs past the bowl like the uruli's
// lugs. Read together it is also a lamp: a vessel holding a flame.
// Drawn on a 48-unit grid; flat fills only (no ids) so it can repeat on a page.

export const MARK_VIEWBOX = "0 0 48 48";

export const MARK = {
  flame: "M26 2.5C23.6 6.4 31.5 10.4 31.5 15.8A7.5 7.5 0 0 1 16.5 15.8C16.5 10.4 22.6 7.6 26 2.5Z",
  // The flame's hot core, in the same turmeric as the pot.
  core: "M24 11.8C24 11.8 27.3 15.2 27.3 17.9A3.3 3.3 0 0 1 20.7 17.9C20.7 15.2 24 11.8 24 11.8Z",
  rim: { x: 3, y: 25.5, width: 42, height: 4.5, rx: 2.25 },
  bowl: "M7 30H41A17 17 0 0 1 7 30Z",
} as const;

export const MARK_HEX = {
  flame: "#c4402a", // chilli
  bowl: "#e3a22a", // turmeric
  ink: "#1c1813",
  paper: "#f4ede1",
} as const;
