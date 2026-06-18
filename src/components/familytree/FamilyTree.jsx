import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getRelType } from "../../constants/Constants";
import { FACTION_ICONS } from "../../constants/factionIcons";

const toArray = (v) => Array.isArray(v) ? v : []

const NODE_W = 190;
const NODE_H = 78;
const X_GAP = 34;
const Y_GAP = 92;
const ROW_GAP = 24;
const PAD = 28;

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

export default function FamilyTree({ store }) {
  const { characters, factions, selectedCharacterId, setSelectedCharacterId, saveCharacter, currentYear } = store;
  const [relTargetId, setRelTargetId] = useState("");
  const [relType, setRelType] = useState("ally");
  const [hoveredCharId, setHoveredCharId] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [treeColumnCount, setTreeColumnCount] = useState(getTreeColumnCount);
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

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) || null;
  const hoveredCharacter = hoveredCharId ? characters.find((c) => c.id === hoveredCharId) : null;

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
      (c.parentIds || []).forEach((pid) => {
        if (!byId.has(pid)) return;
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(c.id);
      });
    });

    const queue = [];
    characters.forEach((c) => {
      const validParents = (c.parentIds || []).filter((pid) => byId.has(pid));
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
        const hasParents = (char.parentIds || []).some((pid) => byId.has(pid));
        if (hasParents) return;
        const spouseIds = new Set([...(char.spouseIds || [])]);
        characters.forEach((other) => {
          if ((other.spouseIds || []).includes(char.id)) spouseIds.add(other.id);
        });
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
  }, [characters, byId]);

  const familySections = useMemo(() => {
    const groups = new Map();
    characters.forEach((char) => {
      const key = (char.familyGroup || "").trim() || "unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(char);
    });

    const sections = Array.from(groups.entries()).map(([familyGroup, members]) => {
      const label = familyGroup === "unassigned" ? "Ungrouped Characters" : familyGroup;
      const maxGeneration = members.reduce((max, m) => Math.max(max, generations.get(m.id) ?? 0), 0);
      let yCursor = PAD;
      const generationRows = Array.from({ length: maxGeneration + 1 }, (_, i) => i).map((generation) => {
        const people = members
          .filter((m) => (generations.get(m.id) ?? 0) === generation)
          .slice()
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const rows = Math.max(1, Math.ceil(people.length / treeColumnCount));
        const row = { generation, people, y: yCursor, rows };
        yCursor += rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP + Y_GAP;
        return row;
      });

      const positions = new Map();
      generationRows.forEach((row) => {
        row.people.forEach((person, index) => {
          const wrappedRow = Math.floor(index / treeColumnCount);
          const column = index % treeColumnCount;
          positions.set(person.id, {
            x: PAD + column * (NODE_W + X_GAP),
            y: row.y + wrappedRow * (NODE_H + ROW_GAP),
          });
        });
      });

      // Center a single child directly under the midpoint of its parents' trunk
      const parentGroupsSeen = new Map();
      members.forEach((child) => {
        const pIds = (child.parentIds || []).filter((pid) => positions.has(pid));
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
        ...generationRows.map((row) => {
          const columns = Math.min(treeColumnCount, Math.max(1, row.people.length));
          return PAD * 2 + columns * NODE_W + Math.max(0, columns - 1) * X_GAP;
        })
      );
      const height = Math.max(PAD * 2 + NODE_H, yCursor - Y_GAP + PAD);

      return { familyGroup, label, memberCount: members.length, members, generationRows, positions, width, height };
    });

    return sections.sort((a, b) => {
      if (a.familyGroup === "unassigned") return 1;
      if (b.familyGroup === "unassigned") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [characters, generations, treeColumnCount]);

  const jumpToCharacters = (characterId) => {
    setSelectedCharacterId(characterId);
    window.dispatchEvent(new CustomEvent("switch-section", { detail: { section: "characters" } }));
  };

  const addCharacterFromTree = () => {
    const savedId = saveCharacter({ name: "New Character", role: "Character" });
    if (savedId) setSelectedCharacterId(savedId);
  };

  const addRelationshipFromTree = () => {
    if (!selectedCharacterId || !relTargetId || relTargetId === selectedCharacterId) return;
    const source = byId.get(selectedCharacterId);
    if (!source) return;
    const existing = toArray(source.relationships);
    const next = [...existing.filter((r) => !(r.targetId === relTargetId && r.type === relType)), { targetId: relTargetId, type: relType }];
    saveCharacter({ relationships: next }, selectedCharacterId);
  };

  const removeRelationshipFromTree = (targetId, type) => {
    if (!selectedCharacterId) return;
    const source = byId.get(selectedCharacterId);
    if (!source) return;
    const next = (toArray(source.relationships)).filter((r) => !(r.targetId === targetId && r.type === type));
    saveCharacter({ relationships: next }, selectedCharacterId);
  };

  return (
    <div className="h-full bg-[var(--bg-main)] overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between" data-tour="familytree-header">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Relationships</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Tree layout by family group and generation. Works for any character network.</p>
          </div>
          <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-nav)] border border-[var(--border)] rounded px-3 py-2">
            Current Year: <span className="text-[var(--accent)] font-bold">{parsedCurrentYear}</span>
          </div>
        </div>

        {characters.length === 0 ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-center border border-dashed border-[var(--border)] rounded-xl px-8">
            <p className="text-[var(--text-muted)] text-sm font-medium">No characters yet</p>
            <p className="text-[var(--text-muted)] text-xs leading-relaxed max-w-xs">Add someone here, then assign family groups and relationship links as the tree grows.</p>
            <button onClick={addCharacterFromTree} className="bg-[var(--accent)] text-[var(--bg-main)] text-xs font-bold px-4 py-2 rounded hover:opacity-90">Add Character</button>
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
                      {section.generationRows.map((row) => (
                        <text
                          key={`gen-${row.generation}`}
                          x={12}
                          y={row.y - 8}
                          fill="var(--text-muted)"
                          fontSize="10"
                          fontWeight="700"
                          style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
                        >
                          Generation {row.generation + 1}
                        </text>
                      ))}

                      {(() => {
                        // Group children by their sorted parent set so siblings share a trunk
                        const groups = new Map();
                        section.members.forEach((child) => {
                          const pIds = (child.parentIds || []).filter((pid) => section.positions.has(pid));
                          if (pIds.length === 0) return;
                          const key = [...pIds].sort().join(",");
                          if (!groups.has(key)) groups.set(key, { parentIds: pIds, childIds: [] });
                          groups.get(key).childIds.push(child.id);
                        });

                        const lines = [];
                        const sw = { stroke: "var(--border)", strokeWidth: "1.7" };

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
                          const splitY = childIds.length > 1 ? childTopY - Math.round(gap * 0.42) : childTopY;

                          // 1-to-1: straight vertical line
                          if (parentIds.length === 1 && childIds.length === 1) {
                            lines.push(<line key={key} x1={pAnchors[0].x} y1={pAnchors[0].y} x2={cAnchors[0].x} y2={cAnchors[0].y} {...sw} />);
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
                          }
                        });

                        return lines;
                      })()}

                      {section.members.map((char) => {
                        const p1 = section.positions.get(char.id);
                        if (!p1) return null;
                        const spouseIds = new Set([...(char.spouseIds || [])]);
                        section.members.forEach((m) => {
                          if ((m.spouseIds || []).includes(char.id)) spouseIds.add(m.id);
                        });
                        return [...spouseIds]
                          .filter((sid) => sid > char.id && section.positions.has(sid))
                          .map((sid) => {
                            const p2 = section.positions.get(sid);
                            return <line key={`spouse-${char.id}-${sid}`} x1={p1.x + NODE_W} y1={p1.y + NODE_H / 2} x2={p2.x} y2={p2.y + NODE_H / 2} stroke="var(--accent)" strokeWidth="2.2" />;
                          });
                      })}

                      {section.members.map((char) => {
                        const source = section.positions.get(char.id);
                        if (!source) return null;
                        return toArray(char.relationships)
                          .filter((rel) => section.positions.has(rel.targetId))
                          .filter((rel) => rel.targetId > char.id)
                          .map((rel) => {
                            const target = section.positions.get(rel.targetId);
                            const relCfg = getRelType(rel.type);
                            return (
                              <line
                                key={`rel-${char.id}-${rel.targetId}-${rel.type}`}
                                x1={source.x + NODE_W / 2}
                                y1={source.y + NODE_H / 2}
                                x2={target.x + NODE_W / 2}
                                y2={target.y + NODE_H / 2}
                                stroke={relCfg.color || "var(--text-muted)"}
                                strokeWidth="1.6"
                                strokeDasharray={relCfg.dash || "4 3"}
                                opacity="0.8"
                              />
                            );
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
                        const clipId = `clip-${char.id}`;
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
                            <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="9" fill={isDeceased ? "color-mix(in srgb, var(--bg-nav) 70%, #000 30%)" : "var(--bg-nav)"} stroke={selectedCharacterId === char.id ? "var(--accent)" : isDeceased ? "color-mix(in srgb, var(--border) 60%, #000 40%)" : "var(--border)"} strokeWidth={selectedCharacterId === char.id ? "2.6" : "1.4"} />
                            {isDeceased && (
                              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx="9" fill="none" stroke="color-mix(in srgb, var(--border) 50%, #888 50%)" strokeWidth="1" strokeDasharray="4 3" style={{ pointerEvents: "none" }} />
                            )}
                            {hasPhoto && (
                              <>
                                <image href={char.image} x={photoX} y={photoY} width={photoSize} height={photoSize} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" style={{ pointerEvents: "none", filter: isDeceased ? "grayscale(0.6)" : undefined }} />
                                <rect x={photoX} y={photoY} width={photoSize} height={photoSize} rx="6" fill="none" stroke="var(--border)" strokeWidth="1" style={{ pointerEvents: "none" }} />
                              </>
                            )}
                            <text x={textX} y={p.y + 22} fill={isDeceased ? "var(--text-muted)" : "var(--text-main)"} fontSize="12" fontWeight="700">{char.name}{isDeceased ? " †" : ""}</text>
                            <text x={textX} y={p.y + 38} fill="var(--text-muted)" fontSize="10">{char.role || "Character"}</text>
                            {ageLabel && <text x={textX} y={p.y + 54} fill={isDeceased ? "color-mix(in srgb, var(--text-muted) 80%, #888 20%)" : "var(--accent)"} fontSize="10" fontWeight="600">{isDeceased ? "Died:" : "Age:"} {ageLabel}</text>}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </section>
              ))}
            </div>

            <aside className="bg-[var(--bg-nav)] border border-[var(--border)] rounded-xl p-3 sticky top-4">
              <h3 className="text-sm font-bold text-[var(--text-main)] mb-2">Tree Relationships</h3>
              {!selectedCharacter ? (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text-muted)]">Select a character node to edit links or add someone new.</p>
                  <button onClick={addCharacterFromTree} className="w-full bg-[var(--accent)] text-[var(--bg-main)] text-xs font-bold py-1.5 rounded hover:opacity-90">Add Character</button>
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
                  </div>
                  <select value={relTargetId} onChange={(e) => setRelTargetId(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-main)]">
                    <option value="">Select target character</option>
                    {characters.filter((c) => c.id !== selectedCharacter.id).map((c) => <option key={`target-${c.id}`} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={relType} onChange={(e) => setRelType(e.target.value)} className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-main)]">
                    {["enemy", "ally", "romantic", "friend", "partner", "sibling", "cousin", "auntuncle", "grandparent"].map((id) => {
                      const t = getRelType(id);
                      return <option key={`type-${id}`} value={id}>{t.label}</option>;
                    })}
                  </select>
                  <button onClick={addRelationshipFromTree} className="w-full bg-[var(--accent)] text-[var(--bg-main)] text-xs font-bold py-1.5 rounded hover:opacity-90">Add Link</button>

                  <div className="border-t border-[var(--border)] pt-2">
                    <div className="text-xs text-[var(--text-muted)] mb-1">Existing links</div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {toArray(selectedCharacter.relationships).length === 0 && <p className="text-xs text-[var(--text-muted)] italic">No custom links yet.</p>}
                      {toArray(selectedCharacter.relationships).map((rel, idx) => {
                        const target = byId.get(rel.targetId);
                        if (!target) return null;
                        return (
                          <div key={`existing-${idx}`} className="flex items-center justify-between text-xs bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1">
                            <span className="text-[var(--text-main)]">{target.name} - {getRelType(rel.type).label}</span>
                            <button onClick={() => removeRelationshipFromTree(rel.targetId, rel.type)} className="text-red-400">✕</button>
                          </div>
                        );
                      })}
                    </div>
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
