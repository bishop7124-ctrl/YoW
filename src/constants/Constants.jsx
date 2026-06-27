export const REL_TYPES = [
  {
    id: "spouse",
    label: "Spouse",
    color: "#f59e0b",
    style: "double",
  },
  {
    id: "partner",
    label: "Partner",
    color: "#fb923c",
    dash: "7 4",
  },
  {
    id: "child",
    label: "Child",
    color: "#94a3b8",
    structural: true,
  },
  {
    id: "parent",
    label: "Parent",
    color: "#94a3b8",
    structural: true,
  },
  {
    id: "sibling",
    label: "Sibling",
    color: "#60a5fa",
    dash: "7 4",
  },
  {
    id: "cousin",
    label: "Cousin",
    color: "#2dd4bf",
    dash: "3 4",
  },
  {
    id: "auntuncle",
    label: "Aunt / Uncle",
    color: "#a78bfa",
    dash: "10 4 3 4",
  },
  {
    id: "grandparent",
    label: "Grandparent",
    color: "#818cf8",
    dash: "9 5",
  },
  {
    id: "friend",
    label: "Friend",
    color: "#4ade80",
    dash: "6 4",
  },
  {
    id: "enemy",
    label: "Enemy",
    color: "#f87171",
    style: "zigzag",
  },
  {
    id: "ally",
    label: "Ally",
    color: "#38bdf8",
    dash: "9 3",
  },
  {
    id: "romantic",
    label: "Romantic Interest",
    color: "#f472b6",
    dash: "3 4",
  },
];

export const FAMILY_RELATIONSHIP_TYPE_IDS = new Set([
  "spouse",
  "parent",
  "child",
  "sibling",
  "cousin",
  "auntuncle",
  "grandparent",
]);

export const getRelType = (id) =>
  REL_TYPES.find((r) => r.id === id) ?? REL_TYPES[0];

export const isCharacterLinkRelType = (id) =>
  Boolean(id) &&
  !FAMILY_RELATIONSHIP_TYPE_IDS.has(id) &&
  !getRelType(id).structural;

export const CHARACTER_LINK_REL_TYPES = REL_TYPES.filter((type) =>
  isCharacterLinkRelType(type.id)
);

export const DEFAULT_CHARACTER_LINK_REL_TYPE = "friend";
