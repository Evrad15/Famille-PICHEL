import { useState, useRef, useEffect, useCallback } from "react";
import SEED from './data/famille.json';

// ══════════════════════════════════════════════
//  CONFIG & PALETTE : MODERN LUXURY
// ══════════════════════════════════════════════
const C = {
  bg: "#0D1117",         // Fond sombre style GitHub
  card: "#161B22",       // Cartes des membres
  cardAlt: "#21262D",    // Survol / Inputs
  border: "#30363D",     // Bordures subtiles
  text: "#E6EDF3",       // Texte principal
  muted: "#8B949E",      // Texte secondaire
  accent: "#58A6FF",     // Bleu focus
  male: "#2F81F7",       // Bleu néon
  female: "#F85149",     // Rouge corail (plus moderne que le rose)
  glass: "rgba(22, 27, 34, 0.85)",
};

// Dimensions pour le layout
const NODE_W = 160; 
const NODE_H = 54;
const H_GAP = 200;
const V_GAP = 120;

// ══════════════════════════════════════════════
//  UTILS & LOGIQUE
// ══════════════════════════════════════════════
const loadData = () => { try { const d = JSON.parse(localStorage.getItem("arbre_v4")); return d?.length ? d : SEED; } catch { return SEED; } };
const saveData = d => localStorage.setItem("arbre_v4", JSON.stringify(d));
const nextId = d => Math.max(0, ...d.map(p => p.id)) + 1;
const initials = p => `${p.prenom[0]}${p.nom[0]}`.toUpperCase();
const fmtDate = s => s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";

function calcAge(birth, death) {
  const e = death ? new Date(death) : new Date(), b = new Date(birth);
  let a = e.getFullYear() - b.getFullYear();
  const m = e.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && e.getDate() < b.getDate())) a--;
  return a;
}

function getGen(id, data, memo = {}) {
  if (id in memo) return memo[id];
  const p = data.find(x => x.id === id);
  if (!p || !p.parentIds.length) return (memo[id] = 0);
  memo[id] = 1 + Math.max(...p.parentIds.map(pid => getGen(pid, data, memo)));
  return memo[id];
}

function computeLayout(data) {
  if (!data.length) return {};
  const memo = {}, pos = {}, byGen = {};
  data.forEach(p => {
    const g = getGen(p.id, data, memo);
    (byGen[g] = byGen[g] || []).push(p);
  });

  Object.keys(byGen).forEach(g => {
    const people = byGen[g], gn = +g;
    const width = (people.length - 1) * H_GAP;
    people.forEach((p, i) => {
      pos[p.id] = { x: i * H_GAP - width / 2, y: gn * V_GAP };
    });
  });
  return pos;
}

// ══════════════════════════════════════════════
//  COMPOSANTS UI
// ══════════════════════════════════════════════

const Button = ({ children, onClick, variant = "primary", style = {} }) => (
  <button onClick={onClick} style={{
    padding: "10px 16px", borderRadius: "8px", border: "1px solid",
    cursor: "pointer", fontSize: "13px", fontWeight: "600",
    backgroundColor: variant === "primary" ? C.accent : "transparent",
    borderColor: variant === "primary" ? C.accent : C.border,
    color: variant === "primary" ? "#fff" : C.text,
    transition: "all 0.2s", ...style
  }}>{children}</button>
);

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: "12px" }}>
    <label style={{ display: "block", fontSize: "11px", color: C.muted, marginBottom: "4px", fontWeight: "bold", textTransform: "uppercase" }}>{label}</label>
    <input {...props} style={{ width: "100%", padding: "10px", borderRadius: "6px", background: C.cardAlt, border: `1px solid ${C.border}`, color: C.text, boxSizing: "border-box" }} />
  </div>
);

// ══════════════════════════════════════════════
//  NODE (Badge design)
// ══════════════════════════════════════════════
function PersonNode({ person, pos, isSelected, onClick }) {
  const isFemale = person.genre === "F";
  const color = isFemale ? C.female : C.male;
  const isDead = !!person.deces;

  return (
    <g transform={`translate(${pos.x - NODE_W / 2},${pos.y - NODE_H / 2})`} onClick={onClick} style={{ cursor: "pointer" }}>
      <rect width={NODE_W} height={NODE_H} rx="10" fill={C.card} stroke={isSelected ? color : C.border} strokeWidth={isSelected ? 2 : 1} />
      <path d={`M 0 10 A 10 10 0 0 1 10 0 L 10 ${NODE_H} A 10 10 0 0 1 0 ${NODE_H - 10} Z`} fill={color} />
      
      {/* Avatar circle */}
      <circle cx="35" cy={NODE_H / 2} r="18" fill={C.bg} />
      {person.photo ? (
        <clipPath id={`avatar-${person.id}`}><circle cx="35" cy={NODE_H / 2} r="18" /></clipPath>
      ) : null}
      {person.photo ? (
        <image href={person.photo} x="17" y={NODE_H / 2 - 18} width="36" height="36" clipPath={`url(#avatar-${person.id})`} preserveAspectRatio="xMidYMid slice" opacity={isDead ? 0.5 : 1} />
      ) : (
        <text x="35" y={NODE_H / 2 + 5} textAnchor="middle" fontSize="12" fontWeight="bold" fill={color}>{initials(person)}</text>
      )}

      <text x="65" y={NODE_H / 2 - 2} fill={C.text} fontSize="13" fontWeight="600">{person.prenom}</text>
      <text x="65" y={NODE_H / 2 + 12} fill={C.muted} fontSize="10">{person.nom}</text>
      {isDead && <text x={NODE_W - 15} y="15" fontSize="10" fill={C.muted}>✝</text>}
    </g>
  );
}

// ══════════════════════════════════════════════
//  APP PRINCIPALE
// ══════════════════════════════════════════════
export default function App() {
  const [data, setData] = useState(loadData);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("family"); // "admin" pour éditer
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [form, setForm] = useState(null);

  useEffect(() => { saveData(data); }, [data]);

  const pos = computeLayout(data);
  const selPerson = data.find(p => p.id === selected);

  const handleAddMember = (type) => {
    setForm({ type, targetId: selected, prenom: "", nom: "", genre: "M", naissance: "" });
  };

  const saveForm = () => {
    const nid = nextId(data);
    if (form.type === "edit") {
        setData(d => d.map(p => p.id === form.targetId ? { ...p, ...form } : p));
    } else {
        const newMember = { ...form, id: nid, parentIds: form.type === "child" ? [selected] : [] };
        setData([...data, newMember]);
    }
    setForm(null);
  };

  return (
    <div style={{ height: "100vh", backgroundColor: C.bg, color: C.text, fontFamily: "Inter, sans-serif", overflow: "hidden", position: "relative" }}>
      
      {/* Barre de navigation */}
      <header style={{ height: "60px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", backgroundColor: C.glass, backdropFilter: "blur(10px)", zIndex: 10 }}>
        <h1 style={{ fontSize: "18px", fontWeight: "bold" }}>🌳 Généalogie <span style={{ color: C.muted, fontWeight: "normal", fontSize: "14px" }}>| {data.length} membres</span></h1>
        <div style={{ display: "flex", gap: "10px" }}>
          <Button variant="secondary" onClick={() => setMode(mode === "admin" ? "family" : "admin")}>
            {mode === "admin" ? "Sortir Admin" : "Mode Édition"}
          </Button>
        </div>
      </header>

      {/* Canevas SVG */}
      <svg width="100%" height="100%" style={{ cursor: "grab" }} onWheel={e => setView(v => ({ ...v, scale: Math.max(0.5, v.scale + (e.deltaY < 0 ? 0.1 : -0.1)) }))}>
        <g transform={`translate(${window.innerWidth / 2 + view.x}, ${100 + view.y}) scale(${view.scale})`}>
          {/* Liens - Simplifiés pour la clarté */}
          {data.map(p => p.parentIds.map(pid => {
            const p1 = pos[pid], p2 = pos[p.id];
            if (!p1 || !p2) return null;
            return <path key={`${pid}-${p.id}`} d={`M ${p1.x} ${p1.y + NODE_H / 2} C ${p1.x} ${(p1.y + p2.y) / 2}, ${p2.x} ${(p1.y + p2.y) / 2}, ${p2.x} ${p2.y - NODE_H / 2}`} stroke={C.border} fill="none" strokeWidth="1.5" />;
          }))}

          {/* Noeuds */}
          {data.map(p => (
            <PersonNode key={p.id} person={p} pos={pos[p.id]} isSelected={selected === p.id} onClick={() => setSelected(p.id)} />
          ))}
        </g>
      </svg>

      {/* Panneau latéral */}
      {selPerson && (
        <aside style={{ position: "absolute", right: 0, top: 60, bottom: 0, width: "320px", backgroundColor: C.glass, backdropFilter: "blur(20px)", borderLeft: `1px solid ${C.border}`, padding: "24px", boxShadow: "-10px 0 30px rgba(0,0,0,0.5)", animation: "slideIn 0.3s ease" }}>
          <button onClick={() => setSelected(null)} style={{ position: "absolute", right: 20, top: 20, background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: C.cardAlt, margin: "0 auto 10px", border: `3px solid ${selPerson.genre === 'F' ? C.female : C.male}`, overflow: "hidden" }}>
              {selPerson.photo && <img src={selPerson.photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <h2 style={{ margin: 0 }}>{selPerson.prenom} {selPerson.nom}</h2>
            <p style={{ color: C.muted, fontSize: "14px" }}>{calcAge(selPerson.naissance, selPerson.deces)} ans</p>
          </div>
          
          {mode === "admin" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <Button onClick={() => handleAddMember("child")}>Ajouter un enfant</Button>
              <Button variant="secondary" onClick={() => handleAddMember("edit")}>Modifier</Button>
            </div>
          )}
        </aside>
      )}

      {/* Formulaire Modal */}
      {form && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ backgroundColor: C.card, padding: "30px", borderRadius: "16px", width: "400px", border: `1px solid ${C.border}` }}>
            <h3>{form.type === "edit" ? "Modifier" : "Nouveau Membre"}</h3>
            <Input label="Prénom" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} />
            <Input label="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "11px", color: C.muted, marginBottom: "8px" }}>GENRE</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <Button variant={form.genre === "M" ? "primary" : "secondary"} onClick={() => setForm({ ...form, genre: "M" })}>H</Button>
                <Button variant={form.genre === "F" ? "primary" : "secondary"} onClick={() => setForm({ ...form, genre: "F" })}>F</Button>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <Button style={{ flex: 1 }} onClick={saveForm}>Enregistrer</Button>
              <Button variant="secondary" onClick={() => setForm(null)}>Annuler</Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        body { margin: 0; font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}
