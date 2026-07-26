import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FACTION_ICONS } from "../../constants/factionIcons";
import {
  FAMILY_FILTER_DEFAULTS,
  buildFamilyLookups,
  deriveFamilyRelationships,
  groupFamilyRelationships,
  makeFamilyLink,
  validateFamilyLink,
} from "../../utils/familyRelationships";

const NODE_W = 190;
const NODE_H = 78;
const X_GAP = 34;
const Y_GAP = 92;
const ROW_GAP = 24;
const PAD = 28;

// SVG <text> never wraps or clips to its node's rect, so long names/labels
// spill past the tree card border. Estimate rendered width from font metrics
// and truncate with an ellipsis — the hover tooltip still shows the full name.
const truncateForWidth = (text, fontSize, maxWidth, bold = false) => {
  if (!text) return text;
  const avgCharWidth = fontSize * (bold ? 0.62 : 0.55);
  const maxChars = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
};

const getTreeColumnCount = () => {
  if (typeof window === "undefined") return 4;
  const pagePadding = window.innerWidth >= 768 ? 48 : 24;
  const shellWidth = Math.min(1280, window.innerWidth - pagePadding);
  const sidebarWidth = window.innerWidth >= 1280 ? 296 : 0;
  const available = Math.max(260, shellWidth - sidebarWidth);
  return Math.max(1, Math.floor((available - PAD * 2 + X_GAP) / (NODE_W + X_GAP)));
};

const extractYear = (value) => {
  if (!value) return null;
  const match = value.match(/-?\d+/);
  if (!match) return null;
  const year = parseInt(match[0], 10);
  return Number.isFinite(year) ? year : null;
};

const FAMILY_TYPE_OPTIONS = ["biological", "adoptive", "step", "chosen", "legal", "magical", "unknown"];
const FAMILY_STATUS_OPTIONS = ["active", "former", "secret", "disputed", "hidden"];

const RELATIVE_ROLE_OPTIONS = [
  ["parent", "Parent"],
  ["child", "Child"],
  ["sibling", "Sibling"],
  ["partner", "Partner / spouse"],
  ["guardian", "Guardian"],
  ["ward", "Ward"],
];

const newConnectionForm = (targetCharacterId = "") => ({
  targetCharacterId,
  role: "parent",
  type: "biological",
  status: "active",
  knownPublicly: true,
  startDate: "",
  endDate: "",
  notes: "",
  allowUnusual: false,
});

function RelationshipList({ title, items, byId, onSelectCharacter }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1.5">{title}</div>
      <div className="space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">None set</p>
        ) : items.map((relationship) => {
          const character = byId.get(relationship.toCharacterId);
          if (!character) return null;
          return (
            <button
              key={`${title}-${relationship.toCharacterId}-${relationship.label}`}
              onClick={() => onSelectCharacter(relationship.toCharacterId)}
              className="w-full text-left rounded-md border border-[var(--border)] bg-[var(--bg-main)] px-2 py-1.5 hover:border-[var(--accent)]"
            >
              <span className="block text-xs font-semibold text-[var(--text-main)] truncate">{character.name || "Unnamed character"}</span>
              <span className="block text-[10px] text-[var(--text-muted)]">{relationship.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const getRoleHelp = (role, selectedName, targetName = "the selected person") => {
  const focusName = selectedName || "This character";
  if (role === "parent") return `${targetName} will appear under Parents for ${focusName}.`;
  if (role === "child") return `${targetName} will appear under Children for ${focusName}.`;
  if (role === "sibling") return `${targetName} will appear under Siblings for ${focusName}.`;
  if (role === "partner") return `${targetName} will appear under Partners for ${focusName}.`;
  if (role === "guardian") return `${targetName} will appear under Guardians and Wards for ${focusName}.`;
  return `${targetName} will appear under Guardians and Wards for ${focusName}.`;
};

const makeLinkFromRelativeForm = (focusId, form) => {
  if (!focusId || !form.targetCharacterId || focusId === form.targetCharacterId) return null;
  const base = {
    type: form.type,
    status: form.status,
    startDate: form.startDate,
    endDate: form.endDate,
    knownPublicly: form.knownPublicly,
    notes: form.notes,
  };
  if (form.role === "parent") {
    return makeFamilyLink({ ...base, sourceCharacterId: focusId, targetCharacterId: form.targetCharacterId, kind: "parent_child", direction: "target_is_parent" });
  }
  if (form.role === "child") {
    return makeFamilyLink({ ...base, sourceCharacterId: focusId, targetCharacterId: form.targetCharacterId, kind: "parent_child", direction: "source_is_parent" });
  }
  if (form.role === "sibling") {
    return makeFamilyLink({ ...base, sourceCharacterId: focusId, targetCharacterId: form.targetCharacterId, kind: "sibling" });
  }
  if (form.role === "partner") {
    return makeFamilyLink({ ...base, sourceCharacterId: focusId, targetCharacterId: form.targetCharacterId, kind: "partner" });
  }
  if (form.role === "guardian") {
    return makeFamilyLink({ ...base, sourceCharacterId: focusId, targetCharacterId: form.targetCharacterId, kind: "guardian", direction: "target_is_parent" });
  }
  return makeFamilyLink({ ...base, sourceCharacterId: focusId, targetCharacterId: form.targetCharacterId, kind: "guardian", direction: "source_is_parent" });
};

export default function FamilyTree({ store }) {
  const { characters, factions, selectedCharacterId, setSelectedCharacterId, currentYear, saveCharacter } = store;
  const [hoveredCharId, setHoveredCharId] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [treeColumnCount, setTreeColumnCount] = useState(getTreeColumnCount);
  const [filters, setFilters] = useState(FAMILY_FILTER_DEFAULTS);
  const [connectionForm, setConnectionForm] = useState(() => newConnectionForm());
  const [connectionWarnings, setConnectionWarnings] = useState([]);
  const [connectionNotice, setConnectionNotice] = useState("");
  const parsedCurrentYear = Number.isFinite(Number(currentYear)) ? Number(currentYear) : 0;

  const getAgeLabel = (char) => {
    const birth = extractYear(char.birthDate);
    if (birth === null) return null;
    if (char.deathDate) {
      const death = extractYear(char.deathDate);
      return death !== null ? `${death - birth} yrs at death` : null;
    }
    return birth > parsedCurrentYear ? `Born ${birth}` : `${parsedCurrentYear - birth} yrs`;
  };

  const byId = useMemo(() => {
    const map = new Map();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, [characters]);

  const focusCharacterId = selectedCharacterId || characters[0]?.id || "";
  const selectedCharacter = characters.find((c) => c.id === focusCharacterId) || null;
  const hoveredCharacter = hoveredCharId ? characters.find((c) => c.id === hoveredCharId) : null;
  const familyLookups = useMemo(() => buildFamilyLookups(characters, filters), [characters, filters]);
  const derivedBySelected = useMemo(
    () => focusCharacterId ? deriveFamilyRelationships(characters, focusCharacterId, filters) : [],
    [characters, focusCharacterId, filters],
  );
  const groupedSelectedFamily = useMemo(
    () => focusCharacterId ? groupFamilyRelationships(characters, focusCharacterId, filters) : null,
    [characters, focusCharacterId, filters],
  );
  const selectedRelationshipLabels = useMemo(() => new Map(
    derivedBySelected.map(relationship => [relationship.toCharacterId, relationship]),
  ), [derivedBySelected]);

  const getParentIds = useCallback((characterId) => (familyLookups.parentsByChild.get(characterId) || []).map(parent => parent.id), [familyLookups]);
  const getChildIds = useCallback((characterId) => (familyLookups.childrenByParent.get(characterId) || []).map(child => child.id), [familyLookups]);
  const getPartnerIds = useCallback((characterId) => (familyLookups.partnersByCharacter.get(characterId) || []).map(partner => partner.id), [familyLookups]);

  useEffect(() => {
    const updateColumns = () => setTreeColumnCount(getTreeColumnCount());
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const updateHoverPosition = (target) => {
    const rect = target.getBoundingClientRect();
    setHoverPosition({
      x: Math.min(Math.max(rect.left + rect.width / 2, 148), window.innerWidth - 148),
      y: Math.max(rect.top - 10, 16),
    });
  };

  const generations = useMemo(() => {
    const gen = new Map();
    const childrenByParent = new Map();

    characters.forEach((c) => {
      getParentIds(c.id).forEach((pid) => {
        if (!byId.has(pid)) return;
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(c.id);
      });
    });

    const queue = [];
    characters.forEach((c) => {
      const validParents = getParentIds(c.id).filter((pid) => byId.has(pid));
      if (validParents.length === 0) {
        gen.set(c.id, 0);
        queue.push(c.id);
      }
    });

    while (queue.length > 0) {
      const id = queue.shift();
      const base = gen.get(id) ?? 0;
      (childrenByParent.get(id) || []).forEach((childId) => {
        const next = base + 1;
        const current = gen.get(childId);
        if (current == null || next > current) {
          gen.set(childId, next);
          queue.push(childId);
        }
      });
    }

    characters.forEach((c) => {
      if (!gen.has(c.id)) gen.set(c.id, 0);
    });

    for (let pass = 0; pass < characters.length; pass++) {
      let changed = false;
      characters.forEach((char) => {
        const hasParents = getParentIds(char.id).some((pid) => byId.has(pid));
        if (hasParents) return;
        const spouseIds = new Set(getPartnerIds(char.id));
        const spouseGenerations = [...spouseIds].map((sid) => gen.get(sid)).filter((g) => g != null);
        if (spouseGenerations.length === 0) return;
        const nextGen = Math.min(...spouseGenerations);
        if (gen.get(char.id) !== nextGen) {
          gen.set(char.id, nextGen);
          changed = true;
        }
      });
      if (!changed) break;
    }

    return gen;
  }, [characters, byId, getParentIds, getPartnerIds]);

  const familySections = useMemo(() => {
    const groups = new Map();
    characters.forEach((char) => {
      const key = (char.familyGroup || "").trim() || "unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(char);
    });

    const sections = Array.from(groups.entries()).map(([familyGroup, members]) => {
      const label = familyGroup === "unassigned" ? "Ungrouped Characters" : familyGroup;
      const hasFamilyLink = (member) => {
        const parentLinked = getParentIds(member.id).some((pid) => byId.has(pid));
        const childLinked = getChildIds(member.id).some((cid) => byId.has(cid));
        const spouseLinked = getPartnerIds(member.id).some((sid) => byId.has(sid));
        return parentLinked || childLinked || spouseLinked;
      };
      const linkedMembers = members.filter(hasFamilyLink);
      const unlinkedMembers = members.filter((member) => !hasFamilyLink(member));
      const maxGeneration = linkedMembers.reduce((max, m) => Math.max(max, generations.get(m.id) ?? 0), 0);
      let yCursor = PAD;
      const generationRows = [];
      if (linkedMembers.length > 0) {
        Array.from({ length: maxGeneration + 1 }, (_, i) => i).forEach((generation) => {
          const people = linkedMembers
            .filter((m) => (generations.get(m.id) ?? 0) === generation)
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          if (people.length === 0) return;
          const rows = Math.max(1, Math.ceil(people.length / treeColumnCount));
          const row = { id: `gen-${generation}`, label: `Generation ${generation + 1}`, generation, people, y: yCursor, rows };
          yCursor += rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP + Y_GAP;
          generationRows.push(row);
        });
      }
      const unlinkedRows = unlinkedMembers.length > 0
        ? [{
            id: "unlinked",
            label: "Unlinked Characters",
            people: unlinkedMembers.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')),
            y: yCursor,
            rows: Math.max(1, Math.ceil(unlinkedMembers.length / treeColumnCount)),
          }]
        : [];
      if (unlinkedRows.length > 0) {
        yCursor += unlinkedRows[0].rows * NODE_H + Math.max(0, unlinkedRows[0].rows - 1) * ROW_GAP + Y_GAP;
      }
      const displayRows = [...generationRows, ...unlinkedRows];

      const positions = new Map();
      displayRows.forEach((row) => {
        const getParentCenter = (person) => {
          const parentPositions = getParentIds(person.id)
            .map((pid) => positions.get(pid))
            .filter(Boolean);
          if (parentPositions.length === 0) return null;
          return parentPositions.reduce((sum, pos) => sum + pos.x + NODE_W / 2, 0) / parentPositions.length;
        };
        const getNearestSpouseX = (person) => {
          const spouseIds = new Set(getPartnerIds(person.id));
          const spousePositions = [...spouseIds].map((sid) => positions.get(sid)).filter(Boolean);
          if (spousePositions.length === 0) return null;
          return spousePositions.reduce((sum, pos) => sum + pos.x + NODE_W / 2, 0) / spousePositions.length;
        };
        const sortedPeople = row.people.slice().sort((a, b) => {
          const aParent = getParentCenter(a);
          const bParent = getParentCenter(b);
          if (aParent != null || bParent != null) return (aParent ?? Number.MAX_SAFE_INTEGER) - (bParent ?? Number.MAX_SAFE_INTEGER);
          const aSpouse = getNearestSpouseX(a);
          const bSpouse = getNearestSpouseX(b);
          if (aSpouse != null || bSpouse != null) return (aSpouse ?? Number.MAX_SAFE_INTEGER) - (bSpouse ?? Number.MAX_SAFE_INTEGER);
          return (a.name || '').localeCompare(b.name || '');
        });
        row.people = sortedPeople;
        sortedPeople.forEach((person, index) => {
          const wrappedRow = Math.floor(index / treeColumnCount);
          const column = index % treeColumnCount;
          const desiredCenter = row.id === "unlinked"
            ? null
            : getParentCenter(person) ?? getNearestSpouseX(person);
          const previousPerson = column > 0 ? sortedPeople[index - 1] : null;
          const previousPosition = previousPerson ? positions.get(previousPerson.id) : null;
          const baseX = desiredCenter != null
            ? desiredCenter - NODE_W / 2
            : PAD + column * (NODE_W + X_GAP);
          const minX = previousPosition && Math.floor(index / treeColumnCount) === Math.floor((index - 1) / treeColumnCount)
            ? previousPosition.x + NODE_W + X_GAP
            : PAD;
          positions.set(person.id, {
            x: Math.round(Math.max(minX, baseX)),
            y: row.y + wrappedRow * (NODE_H + ROW_GAP),
          });
        });
      });

      // Center a single child directly under the midpoint of its parents' trunk
      const parentGroupsSeen = new Map();
      members.forEach((child) => {
        const pIds = getParentIds(child.id).filter((pid) => positions.has(pid));
        if (pIds.length < 2) return;
        const key = [...pIds].sort().join(",");
        if (!parentGroupsSeen.has(key)) parentGroupsSeen.set(key, { parentIds: pIds, childIds: [] });
        parentGroupsSeen.get(key).childIds.push(child.id);
      });
      parentGroupsSeen.forEach(({ parentIds, childIds }) => {
        if (childIds.length !== 1) return;
        const pCenters = parentIds.map((pid) => positions.get(pid).x + NODE_W / 2);
        const trunkX = Math.round((Math.min(...pCenters) + Math.max(...pCenters)) / 2);
        const childPos = positions.get(childIds[0]);
        positions.set(childIds[0], { ...childPos, x: trunkX - Math.round(NODE_W / 2) });
      });

      const width = Math.max(
        320,
        ...displayRows.map((row) => {
          const columns = Math.min(treeColumnCount, Math.max(1, row.people.length));
          return PAD * 2 + columns * NODE_W + Math.max(0, columns - 1) * X_GAP;
        }),
        ...[...positions.values()].map((position) => position.x + NODE_W + PAD)
      );
      const height = Math.max(PAD * 2 + NODE_H, yCursor - Y_GAP + PAD);

      return { familyGroup, label, memberCount: members.length, members, generationRows, displayRows, positions, width, height };
    });

    return sections.sort((a, b) => {
      if (a.familyGroup === "unassigned") return 1;
      if (b.familyGroup === "unassigned") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [characters, generations, treeColumnCount, byId, getChildIds, getParentIds, getPartnerIds]);

  const jumpToCharacters = (characterId) => {
    if (characterId) setSelectedCharacterId(characterId);
    window.dispatchEvent(new CustomEvent("switch-section", { detail: { section: "characters" } }));
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const updateConnectionForm = (key, value) => {
    setConnectionWarnings([]);
    setConnectionNotice("");
    setConnectionForm((current) => {
      if (key !== "role") return { ...current, [key]: value };
      const defaultType = value === "partner" ? "legal" : value === "guardian" || value === "ward" ? "chosen" : current.type === "legal" || current.type === "chosen" ? "biological" : current.type;
      return { ...current, role: value, type: defaultType };
    });
  };

  const saveFamilyConnection = () => {
    if (!selectedCharacter || !connectionForm.targetCharacterId) return;
    const link = makeLinkFromRelativeForm(selectedCharacter.id, connectionForm);
    if (!link) return;
    const warnings = validateFamilyLink(characters, link);
    if (warnings.length > 0 && !connectionForm.allowUnusual) {
      setConnectionWarnings(warnings);
      return;
    }
    const source = byId.get(link.sourceCharacterId);
    if (!source) return;
    saveCharacter({ familyLinks: [...(source.familyLinks || []), link] }, source.id);
    const targetName = byId.get(connectionForm.targetCharacterId)?.name || "Relative";
    setConnectionNotice(`${targetName} was added as ${connectionForm.role.replace("_", " ")}. The grouped lists below update automatically.`);
    setConnectionForm(newConnectionForm());
    setConnectionWarnings([]);
  };

  return (
    <div className="h-full bg-[var(--bg-main)] overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between" data-tour="familytree-header">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Family Tree</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Structured genealogy by direct facts, with extended relationships calculated around the focal character.</p>
          </div>
          <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-nav)] border border-[var(--border)] rounded px-3 py-2">
            Current Year: <span className="text-[var(--accent)] font-bold">{parsedCurrentYear}</span>
          </div>
        </div>

        {characters.length > 0 && (
          <section className="bg-[var(--bg-nav)] border border-[var(--border)] rounded-xl p-3 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="text-xs text-[var(--text-muted)] md:min-w-60">
                Focus character
                <select
                  value={focusCharacterId}
                  onChange={(event) => setSelectedCharacterId(event.target.value)}
                  className="block mt-1 w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)]"
                >
                  {characters.map(character => <option key={character.id} value={character.id}>{character.name || "Unnamed character"}</option>)}
                </select>
              </label>
              <label className="text-xs text-[var(--text-muted)] md:min-w-52">
                View
                <select
                  value={filters.scope}
                  onChange={(event) => updateFilter("scope", event.target.value)}
                  className="block mt-1 w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)]"
                >
                  <option value="direct">Direct lineage</option>
                  <option value="immediate">Immediate family</option>
                  <option value="extended">Extended family</option>
                  <option value="full">Full dynasty</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              {[
                ["bloodOnly", "Blood only"],
                ["includePartners", "Partners"],
                ["includeAdoption", "Adoption"],
                ["includeStep", "Step-family"],
                ["includeGuardians", "Guardians"],
                ["includeDeceased", "Deceased"],
                ["showHidden", "Hidden / secret"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={Boolean(filters[key])}
                    onChange={(event) => updateFilter(key, event.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        )}

        {characters.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-center border border-dashed border-[var(--border)] rounded-xl px-8">
            <p className="text-[var(--text-muted)] text-sm font-medium">No characters yet</p>
            <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-xs">Create characters in the Characters tab, then assign parents, children, spouses, and family groups as the tree grows.</p>
            <button onClick={() => jumpToCharacters()} className="bg-[var(--accent)] text-[var(--bg-main)] text-xs font-bold px-4 py-2 rounded hover:opacity-90">Open Characters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
            <div className="space-y-6 min-w-0">
              {familySections.map((section) => (
                <section key={section.familyGroup} className="bg-[var(--bg-nav)] border border-[var(--border)] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-[var(--text-main)]">{section.label}</h2>
                      <p className="text-xs text-[var(--text-muted)]">{section.memberCount} characters</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-main)] tree-container relative" data-tour="familytree-canvas" onScroll={() => setHoveredCharId(null)}>
                    <svg width={section.width} height={section.height} className="block min-w-full">
                      {section.displayRows.map((row) => (
                        <text
                          key={`row-${row.id}`}
                          x={12}
                          y={row.y - 8}
                          fill="var(--text-muted)"
                          fontSize="10"
                          fontWeight="700"
                          style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
                        >
                          {row.label}
                        </text>
                      ))}

                      {(() => {
                        // Group children by their sorted parent set so siblings share a trunk
                        const groups = new Map();
                        section.members.forEach((child) => {
                          const pIds = getParentIds(child.id).filter((pid) => section.positions.has(pid));
                          if (pIds.length === 0) return;
                          const key = [...pIds].sort().join(",");
                          if (!groups.has(key)) groups.set(key, { parentIds: pIds, childIds: [] });
                          groups.get(key).childIds.push(child.id);
                        });

                        const lines = [];
                        const sw = { stroke: "var(--border)", strokeWidth: "1.7" };
                        const connectorPath = (from, to, bendY) => {
                          if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
                          return `M ${from.x} ${from.y} L ${from.x} ${bendY} L ${to.x} ${bendY} L ${to.x} ${to.y}`;
                        };

                        groups.forEach(({ parentIds, childIds }, key) => {
                          const pAnchors = parentIds.map((pid) => {
                            const p = section.positions.get(pid);
                            return { x: p.x + NODE_W / 2, y: p.y + NODE_H };
                          });
                          const cAnchors = childIds.map((cid) => {
                            const p = section.positions.get(cid);
                            return { x: p.x + NODE_W / 2, y: p.y };
                          });

                          const parentBottomY = Math.max(...pAnchors.map((a) => a.y));
                          const childTopY = Math.min(...cAnchors.map((a) => a.y));
                          const gap = childTopY - parentBottomY;

                          const minPX = Math.min(...pAnchors.map((a) => a.x));
                          const maxPX = Math.max(...pAnchors.map((a) => a.x));
                          const trunkX = parentIds.length === 1 ? pAnchors[0].x : Math.round((minPX + maxPX) / 2);

                          const minCX = Math.min(...cAnchors.map((a) => a.x));
                          const maxCX = Math.max(...cAnchors.map((a) => a.x));

                          // junctionY: where parent legs meet; splitY: where trunk fans to children
                          const junctionY = parentIds.length > 1 ? parentBottomY + Math.round(gap * 0.42) : parentBottomY;
                          const splitY = childIds.length > 1 ? childTopY - Math.round(gap * 0.42) : junctionY;

                          // 1-to-1: choose the shortest tidy orthogonal route rather than a long diagonal.
                          if (parentIds.length === 1 && childIds.length === 1) {
                            const bendY = parentBottomY + Math.max(14, Math.round(gap / 2));
                            lines.push(<path key={key} d={connectorPath(pAnchors[0], cAnchors[0], bendY)} fill="none" strokeDasharray={parentIds.length === 1 ? (familyLookups.parentsByChild.get(childIds[0]) || []).find(parent => parent.id === parentIds[0])?.link.type === "adoptive" ? "7 4" : (familyLookups.parentsByChild.get(childIds[0]) || []).find(parent => parent.id === parentIds[0])?.link.type === "step" ? "2 4" : undefined : undefined} {...sw} />);
                            return;
                          }

                          // Parent legs down + junction horizontal (multiple parents only)
                          if (parentIds.length > 1) {
                            pAnchors.forEach((a, i) => {
                              lines.push(<line key={`${key}-pl${i}`} x1={a.x} y1={a.y} x2={a.x} y2={junctionY} {...sw} />);
                            });
                            lines.push(<line key={`${key}-jh`} x1={minPX} y1={junctionY} x2={maxPX} y2={junctionY} {...sw} />);
                          }

                          // Trunk from junction/parent down to split/child
                          lines.push(<line key={`${key}-trunk`} x1={trunkX} y1={junctionY} x2={trunkX} y2={splitY} {...sw} />);

                          // Split horizontal + child legs (multiple children only)
                          if (childIds.length > 1) {
                            const splitMinX = Math.min(minCX, trunkX);
                            const splitMaxX = Math.max(maxCX, trunkX);
                            lines.push(<line key={`${key}-sh`} x1={splitMinX} y1={splitY} x2={splitMaxX} y2={splitY} {...sw} />);
                            cAnchors.forEach((a, i) => {
                              lines.push(<line key={`${key}-cl${i}`} x1={a.x} y1={splitY} x2={a.x} y2={a.y} {...sw} />);
                            });
                          } else {
                            lines.push(<path key={`${key}-single-child`} d={connectorPath({ x: trunkX, y: splitY }, cAnchors[0], parentBottomY + Math.max(14, Math.round(gap / 2)))} fill="none" {...sw} />);
                          }
                        });

                        return lines;
                      })()}

                      {section.members.map((char) => {
                        const p1 = section.positions.get(char.id);
                        if (!p1) return null;
                        const spouseIds = new Set(getPartnerIds(char.id));
                        return [...spouseIds]
                          .filter((sid) => sid > char.id && section.positions.has(sid))
                          .map((sid) => {
                            const p2 = section.positions.get(sid);
                            const partnerLink = (familyLookups.partnersByCharacter.get(char.id) || []).find(partner => partner.id === sid)?.link;
                            return <line key={`spouse-${char.id}-${sid}`} x1={p1.x + NODE_W} y1={p1.y + NODE_H / 2} x2={p2.x} y2={p2.y + NODE_H / 2} stroke="var(--accent)" strokeWidth="2.2" strokeDasharray={partnerLink?.status === "former" ? "7 4" : undefined} />;
                          });
                      })}

                      {section.members.map((char) => {
                        const p = section.positions.get(char.id);
                        if (!p) return null;
                        const ageLabel = getAgeLabel(char);
                        const hasPhoto = Boolean(char.image);
                        const isDeceased = Boolean(char.deathDate);
                        const photoSize = 46;
                        const photoX = p.x + 7;
                        const photoY = p.y + (NODE_H - photoSize) / 2;
                        const textX = hasPhoto ? p.x + photoSize + 14 : p.x + 10;
                        const textMaxWidth = NODE_W - (textX - p.x) - 8;
                        const clipId = `clip-${char.id}`;
                        const relativeLabel = selectedRelationshipLabels.get(char.id)?.label;
                        const relationshipMeta = selectedRelationshipLabels.get(char.id);
                        const isSecret = relationshipMeta?.sourceLinkIds?.some(linkId => {
                          const link = familyLookups.links.find(item => item.id === linkId);
                          return link?.status === "secret" || link?.status === "hidden" || link?.knownPublicly === false;
                        });
                        const isDisputed = relationshipMeta?.sourceLinkIds?.some(linkId => familyLookups.links.find(item => item.id === linkId)?.status === "disputed");
                        return (
                          <g
                            key={`node-${char.id}`}
                            className="tree-node"
                            style={{ cursor: "pointer" }}
                            onClick={() => setSelectedCharacterId(char.id)}
                            onMouseEnter={(e) => {
                              updateHoverPosition(e.currentTarget);
                              setHoveredCharId(char.id);
                            }}
                            onMouseMove={(e) => {
                              updateHoverPosition(e.currentTarget);
                              setHoveredCharId(char.id);
                            }}
                            onMouseLeave={() => setHoveredCharId(null)}
                          >
                            {hasPhoto && (
                              <defs>
                                <clipPath id={clipId}>
                                  <rect x={photoX} y={photoY} width={photoSize} height={photoSize} rx="6" />
                                </clipPath>
                              </defs>
                            )}
                            <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="9" fill={isDeceased ? "color-mix(in srgb, var(--bg-nav) 70%, #000 30%)" : "var(--bg-nav)"} stroke={focusCharacterId === char.id ? "var(--accent)" : isDeceased ? "color-mix(in srgb, var(--border) 60%, #000 40%)" : "var(--border)"} strokeWidth={focusCharacterId === char.id ? "2.6" : "1.4"} />
                            {isDeceased && (
                              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="9" fill="none" stroke="color-mix(in srgb, var(--border) 50%, #888 50%)" strokeWidth="1" strokeDasharray="4 3" style={{ pointerEvents: "none" }} />
                            )}
                            {hasPhoto && (
                              <>
                                <image href={char.image} x={photoX} y={photoY} width={photoSize} height={photoSize} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" style={{ pointerEvents: "none", filter: isDeceased ? "grayscale(0.6)" : undefined }} />
                                <rect x={photoX} y={photoY} width={photoSize} height={photoSize} rx="6" fill="none" stroke="var(--border)" strokeWidth="1" style={{ pointerEvents: "none" }} />
                              </>
                            )}
                            <text x={textX} y={p.y + 22} fill={isDeceased ? "var(--text-muted)" : "var(--text-main)"} fontSize="12" fontWeight="700">{truncateForWidth(char.name, 12, textMaxWidth - (isDeceased ? 10 : 0), true)}{isDeceased ? " †" : ""}</text>
                            <text x={textX} y={p.y + 38} fill="var(--text-muted)" fontSize="10">{truncateForWidth(char.role || "Character", 10, textMaxWidth)}</text>
                            {relativeLabel ? (
                              <text x={textX} y={p.y + 54} fill="var(--accent)" fontSize="10" fontWeight="600">{truncateForWidth(`${isSecret ? "Locked " : ""}${isDisputed ? "? " : ""}${relativeLabel}`, 10, textMaxWidth, true)}</text>
                            ) : ageLabel && <text x={textX} y={p.y + 54} fill={isDeceased ? "color-mix(in srgb, var(--text-muted) 80%, #888 20%)" : "var(--accent)"} fontSize="10" fontWeight="600">{truncateForWidth(`${isDeceased ? "Died:" : "Age:"} ${ageLabel}`, 10, textMaxWidth, true)}</text>}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </section>
              ))}
            </div>

            <aside className="bg-[var(--bg-nav)] border border-[var(--border)] rounded-xl p-3 sticky top-4">
              <h3 className="text-sm font-bold text-[var(--text-main)] mb-2">Family Details</h3>
              {!selectedCharacter ? (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text-muted)]">Select a character node to review their family links, or open Characters to add someone new.</p>
                  <button onClick={() => jumpToCharacters()} className="w-full bg-[var(--accent)] text-[var(--bg-main)] text-xs font-bold py-1.5 rounded hover:opacity-90">Open Characters</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-[var(--text-muted)] mb-1">Selected</div>
                    <div className="flex items-center gap-2">
                      {selectedCharacter.image ? (
                        <img src={selectedCharacter.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-[var(--border)]" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--accent-fade)] border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-[var(--accent)]">{selectedCharacter.name.charAt(0)}</span>
                        </div>
                      )}
                      <div className="text-sm text-[var(--text-main)] font-semibold">{selectedCharacter.name}</div>
                    </div>
                    {(() => {
                      const selectedFaction = factions.find(f => f.id === selectedCharacter.factionId);
                      const selectedFactionIcon = FACTION_ICONS.find(i => i.id === selectedFaction?.iconId)?.url;
                      return (
                        <>
                          {selectedFaction && (
                            <div className="flex items-center gap-1.5 mt-2">
                              {selectedFactionIcon && <img src={selectedFactionIcon} alt="" className="w-4 h-4 opacity-80" />}
                              <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold">{selectedFaction.name}</span>
                            </div>
                          )}
                          {selectedCharacter.bio?.trim() && (
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-2">{selectedCharacter.bio.trim()}</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="border-t border-[var(--border)] pt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-[var(--text-main)]">Add Relative</h4>
                      <span className="text-[10px] text-[var(--text-muted)]">Saved here and in the map</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <select
                        value={connectionForm.role}
                        onChange={(event) => updateConnectionForm("role", event.target.value)}
                        className="field text-xs"
                        aria-label={`Relationship to ${selectedCharacter.name}`}
                      >
                        {RELATIVE_ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <select
                        value={connectionForm.targetCharacterId}
                        onChange={(event) => updateConnectionForm("targetCharacterId", event.target.value)}
                        className="field text-xs"
                        aria-label="Relative"
                      >
                        <option value="">Choose character</option>
                        {characters
                          .filter(character => character.id !== selectedCharacter.id)
                          .map(character => <option key={character.id} value={character.id}>{character.name || "Unnamed character"}</option>)}
                      </select>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      {getRoleHelp(connectionForm.role, selectedCharacter.name, byId.get(connectionForm.targetCharacterId)?.name)}
                    </p>
                    <details className="rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-2 py-1.5">
                      <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Details</summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <select value={connectionForm.type} onChange={(event) => updateConnectionForm("type", event.target.value)} className="field text-xs">
                          {FAMILY_TYPE_OPTIONS.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
                        </select>
                        <select value={connectionForm.status} onChange={(event) => updateConnectionForm("status", event.target.value)} className="field text-xs">
                          {FAMILY_STATUS_OPTIONS.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
                        </select>
                        <label className="col-span-2 flex items-center gap-2 text-xs text-[var(--text-main)]">
                          <input type="checkbox" checked={connectionForm.knownPublicly} onChange={(event) => updateConnectionForm("knownPublicly", event.target.checked)} className="accent-[var(--accent)]" />
                          Publicly known
                        </label>
                        <input value={connectionForm.startDate} onChange={(event) => updateConnectionForm("startDate", event.target.value)} className="field text-xs" placeholder="Start date" />
                        <input value={connectionForm.endDate} onChange={(event) => updateConnectionForm("endDate", event.target.value)} className="field text-xs" placeholder="End date" />
                        <textarea value={connectionForm.notes} onChange={(event) => updateConnectionForm("notes", event.target.value)} className="field text-xs col-span-2 min-h-14 resize-y" placeholder="Notes" />
                      </div>
                    </details>
                    {connectionWarnings.length > 0 && (
                      <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 p-2 text-xs text-amber-200 space-y-2">
                        {connectionWarnings.map(warning => <p key={warning}>{warning}</p>)}
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={connectionForm.allowUnusual} onChange={(event) => updateConnectionForm("allowUnusual", event.target.checked)} className="accent-[var(--accent)]" />
                          Allow unusual family structure
                        </label>
                      </div>
                    )}
                    {connectionNotice && (
                      <p className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-200">{connectionNotice}</p>
                    )}
                    <button
                      onClick={saveFamilyConnection}
                      disabled={!connectionForm.targetCharacterId}
                      className="w-full bg-[var(--accent)] disabled:opacity-40 text-[var(--bg-main)] text-xs font-bold py-2 rounded-lg"
                    >
                      Add to Family
                    </button>
                  </div>
                  <div className="border-t border-[var(--border)] pt-3 space-y-2 text-xs">
                    <RelationshipList title="Parents" items={groupedSelectedFamily?.parents || []} byId={byId} onSelectCharacter={setSelectedCharacterId} />
                    <RelationshipList title="Partners" items={groupedSelectedFamily?.partners || []} byId={byId} onSelectCharacter={setSelectedCharacterId} />
                    <RelationshipList title="Children" items={groupedSelectedFamily?.children || []} byId={byId} onSelectCharacter={setSelectedCharacterId} />
                    <RelationshipList title="Siblings" items={groupedSelectedFamily?.siblings || []} byId={byId} onSelectCharacter={setSelectedCharacterId} />
                    <RelationshipList title="Extended Family" items={groupedSelectedFamily?.extended || []} byId={byId} onSelectCharacter={setSelectedCharacterId} />
                    <RelationshipList title="Guardians and Wards" items={groupedSelectedFamily?.guardians || []} byId={byId} onSelectCharacter={setSelectedCharacterId} />
                  </div>

                  <button onClick={() => jumpToCharacters(selectedCharacter.id)} className="w-full border border-[var(--border)] text-[var(--text-main)] text-xs py-1.5 rounded hover:border-[var(--accent)]">
                    Open in Characters
                  </button>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
      {hoveredCharacter && createPortal((() => {
        const faction = factions.find(f => f.id === hoveredCharacter.factionId);
        const icon = FACTION_ICONS.find(i => i.id === faction?.iconId)?.url;
        return (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: hoverPosition.x,
              top: hoverPosition.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="w-64 bg-[var(--bg-nav)]/95 backdrop-blur-md border-2 border-[var(--accent)]/60 rounded-xl p-4 shadow-2xl text-left">
              {hoveredCharacter.image && (
                <img src={hoveredCharacter.image} alt={hoveredCharacter.name} className="w-full h-28 object-cover rounded-lg mb-3" />
              )}
              <div className="flex items-center gap-2 mb-2">
                {icon && <img src={icon} alt="" className="w-5 h-5 opacity-80" />}
                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold">{faction?.name || "No Faction"}</span>
              </div>
              <div className="text-sm text-[var(--text-main)] font-bold mb-1">{hoveredCharacter.name}</div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{hoveredCharacter.bio?.trim() || "No biography snippet available."}</p>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 bg-[var(--bg-nav)] border-r-2 border-b-2 border-[var(--accent)]/60 rotate-45" />
          </div>
        );
      })(), document.body)}
    </div>
  );
}
