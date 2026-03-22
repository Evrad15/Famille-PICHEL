import React, { useState, useRef, useEffect, useCallback, WheelEvent as ReactWheelEvent } from "react";
import { Plus, Trash2, Edit2, UserPlus, Users, Save, X, Camera, LogOut, ZoomIn, ZoomOut, RefreshCw, Link, MessageSquare, Send, Volume2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { chatWithFamilyTree, generatePortrait, speakBiography, Person, ChatMessage } from "./services/aiService";

const FAMILY_PWD = "famille2026";
const ADMIN_PWD = "admin2026";

interface ColorPalette {
  c1: string; c2: string; c3: string;
  c4: string; c5: string; c6: string;
  male: string; female: string;
  maleL: string; femaleL: string;
  link: string;
}

const C: ColorPalette = {
  c1: "#06141B", c2: "#11212D", c3: "#253745",
  c4: "#4A5C6A", c5: "#9BA8AB", c6: "#CCD0CF",
  male: "#4A8FBF", female: "#BF4A6A",
  maleL: "#4A8FBF33", femaleL: "#BF4A6A33",
  link: "#9BA8AB",
};

const NW = 54, NH = 54, R = NW / 2;
const H_GAP = 200;
const V_GAP = 230;
const FAN_DY = 120;

// ══════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════
const norm = (m: any): Person => ({
  ...m,
  id: Number(m.id),
  parentIds: (Array.isArray(m.parentIds) ? m.parentIds : JSON.parse(m.parentIds || "[]")).map(Number),
  conjointIds: (Array.isArray(m.conjointIds) ? m.conjointIds : JSON.parse(m.conjointIds || "[]")).map(Number),
});

const apiGet = (): Promise<Person[]> => fetch("/api/membres").then(r => r.json()).then(d => d.map(norm));
const apiAdd = (m: Partial<Person>) => fetch("/api/add-membre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).then(r => r.json());
const apiUpdate = (m: Person) => fetch("/api/update-membre", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).then(r => r.json());
const apiDelete = (id: number) => fetch("/api/delete-membre", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then(r => r.json());

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const nextId = (d: Person[]) => Math.max(0, ...d.map(p => p.id)) + 1;
const initials = (p: Person) => `${p.prenom[0]}${p.nom[0]}`.toUpperCase();
const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
const isFem = (p: Person) => p.genre === "F";

function calcAge(b: string, d?: string | null) {
  const e = d ? new Date(d) : new Date(), bb = new Date(b);
  let a = e.getFullYear() - bb.getFullYear();
  if (e.getMonth() - bb.getMonth() < 0 || (e.getMonth() === bb.getMonth() && e.getDate() < bb.getDate())) a--;
  return a;
}

function buildGenMap(data: Person[]) {
  const memo: Record<number, number> = {};
  function gen(id: number, stk = new Set<number>()) {
    if (id in memo) return memo[id];
    if (stk.has(id)) return 0;
    const p = data.find(x => x.id === id);
    if (!p) return (memo[id] = 0);
    const ns = new Set(stk); ns.add(id);
    let g = 0;
    if (p.parentIds.length) {
      g = 1 + Math.max(...p.parentIds.map((pid) => gen(pid, ns)));
    } else if (p.conjointIds.length) {
      const cg = p.conjointIds.map((cid) => {
        const c = data.find(x => x.id === cid);
        if (!c || ns.has(cid)) return 0;
        return c.parentIds.length ? 1 + Math.max(...c.parentIds.map((pid) => gen(pid, ns))) : 0;
      });
      g = Math.max(0, ...cg);
    }
    return (memo[id] = g);
  }
  data.forEach(p => gen(p.id));
  return memo;
}

function subtreeOf(rootId: number, data: Person[]) {
  const s = new Set<number>([rootId]);
  let ch = true;
  while (ch) { ch = false; data.forEach(p => { if (!s.has(p.id) && p.parentIds.some((pid) => s.has(pid))) { s.add(p.id); ch = true; } }); }
  return s;
}

interface Position { x: number; y: number; }

function computeLayout(data: Person[]) {
  if (!data.length) return {};
  const genOf = buildGenMap(data);
  const H_GAP = 220;
  const V_GAP = 200;
  const BLOCK_MARGIN = 120;
  const pos: Record<number, Position> = {};
  const positioned = new Set<number>();
  const memoWidth = new Map<number, number>();

  const isPatriarch = (id: number) => {
    const p = data.find(x => x.id === id);
    return p && p.conjointIds.length >= 3;
  };

  function getWidth(id: number): number {
    if (memoWidth.has(id)) return memoWidth.get(id)!;
    const p = data.find(x => x.id === id);
    if (!p) return 0;
    const kids = data.filter(c => c.parentIds.includes(id));
    const isPat = isPatriarch(id);
    if (isPat) {
      let totalW = 0;
      p.conjointIds.forEach(sid => {
        const ukids = kids.filter(c => c.parentIds.includes(sid));
        const spouseWidth = Math.max(H_GAP, ukids.reduce((s, k) => s + getWidth(k.id), 0));
        totalW += spouseWidth + BLOCK_MARGIN;
      });
      memoWidth.set(id, totalW);
      return totalW;
    }
    const unionGroups: { sid: number | null, kids: Person[] }[] = [];
    p.conjointIds.forEach(sid => {
      const ukids = kids.filter(c => c.parentIds.includes(sid));
      unionGroups.push({ sid, kids: ukids });
    });
    const soloKids = kids.filter(c => c.parentIds.length === 1);
    if (soloKids.length > 0) unionGroups.push({ sid: null, kids: soloKids });
    if (unionGroups.length === 0) { memoWidth.set(id, H_GAP); return H_GAP; }
    let totalW = 0;
    unionGroups.forEach(group => {
      const ukw = group.kids.reduce((s, k) => s + getWidth(k.id), 0);
      totalW += Math.max(H_GAP * 2, ukw) + BLOCK_MARGIN;
    });
    memoWidth.set(id, totalW);
    return totalW;
  }

  function layout(id: number, centerX: number, yOffset = 0) {
    if (positioned.has(id)) return;
    const p = data.find(x => x.id === id);
    if (!p) return;
    const isPat = isPatriarch(id);
    const kids = data.filter(c => c.parentIds.includes(id));
    const blockWidth = getWidth(id);
    if (isPat) {
      pos[id] = { x: centerX, y: (genOf[id] * V_GAP) + yOffset };
      positioned.add(id);
      let curX = centerX - blockWidth / 2;
      p.conjointIds.forEach(sid => {
        const s = data.find(x => x.id === sid);
        if (!s) return;
        const ukids = kids.filter(c => c.parentIds.includes(sid));
        const ukw = ukids.reduce((s, k) => s + getWidth(k.id), 0);
        const spouseWidth = Math.max(H_GAP, ukw);
        const spouseX = curX + spouseWidth / 2;
        if (!positioned.has(s.id)) { 
          pos[s.id] = { x: spouseX, y: pos[id].y + V_GAP * 0.5 }; 
          positioned.add(s.id); 
        }
        let kX = spouseX - ukw / 2;
        ukids.forEach((k) => {
          const kw = getWidth(k.id);
          layout(k.id, kX + kw / 2, yOffset);
          kX += kw;
        });
        curX += spouseWidth + BLOCK_MARGIN;
      });
      return;
    }
    const unionGroups: { spouse: Person | null, kids: Person[] }[] = [];
    p.conjointIds.forEach(sid => {
      const s = data.find(x => x.id === sid);
      if (!s) return;
      const ukids = kids.filter(c => c.parentIds.includes(sid));
      unionGroups.push({ spouse: s, kids: ukids });
    });
    const soloKids = kids.filter(c => c.parentIds.length === 1);
    if (soloKids.length > 0) unionGroups.push({ spouse: null, kids: soloKids });
    if (unionGroups.length === 0) { pos[id] = { x: centerX, y: (genOf[id] * V_GAP) + yOffset }; positioned.add(id); return; }
    const midIdx = Math.floor(unionGroups.length / 2);
    let personX = centerX - blockWidth / 2;
    for (let i = 0; i < midIdx; i++) {
      const group = unionGroups[i];
      const ukw = group.kids.reduce((s, k) => s + getWidth(k.id), 0);
      personX += Math.max(H_GAP * 2, ukw) + BLOCK_MARGIN;
    }
    pos[id] = { x: personX, y: (genOf[id] * V_GAP) + yOffset };
    positioned.add(id);
    let xOffset = centerX - blockWidth / 2;
    unionGroups.forEach((group, i) => {
      const ukw = group.kids.reduce((s, k) => s + getWidth(k.id), 0);
      const uw = Math.max(H_GAP * 2, ukw);
      if (i === midIdx) xOffset = personX;
      if (group.spouse) {
        let spouseX = (i < midIdx) ? xOffset + H_GAP / 2 : xOffset + uw - H_GAP / 2;
        if (!positioned.has(group.spouse.id)) { pos[group.spouse.id] = { x: spouseX, y: (genOf[group.spouse.id] * V_GAP) + yOffset }; positioned.add(group.spouse.id); }
        const pairMid = (pos[id].x + pos[group.spouse.id].x) / 2;
        let kX = pairMid - ukw / 2;
        group.kids.forEach((k) => { const kw = getWidth(k.id); layout(k.id, kX + kw / 2, yOffset); kX += kw; });
      } else {
        let kX = xOffset + uw / 2 - ukw / 2;
        group.kids.forEach((k) => { const kw = getWidth(k.id); layout(k.id, kX + kw / 2, yOffset); kX += kw; });
      }
      xOffset += uw + BLOCK_MARGIN;
    });
  }

  const roots = data.filter(p => p.parentIds.length === 0);
  // Prioriser les patriarches pour qu'ils organisent leur famille en premier
  roots.sort((a, b) => (isPatriarch(b.id) ? 1 : 0) - (isPatriarch(a.id) ? 1 : 0));
  
  let globalX = 0;
  roots.forEach(r => {
    if (!positioned.has(r.id)) {
      const w = getWidth(r.id);
      layout(r.id, globalX + w / 2);
      globalX += w + H_GAP;
    }
  });

  data.forEach(p => {
    if (!positioned.has(p.id)) {
      pos[p.id] = { x: globalX, y: genOf[p.id] * V_GAP };
      globalX += H_GAP;
    }
  });

  return pos;
}


function buildLinks(data: Person[], pos: Record<number, Position>) {
  const links: any[] = [], seenCouple = new Set<string>();

  data.forEach(p => {
    const isPat = p.conjointIds.length >= 3;
    if (isPat) {
      const pa = pos[p.id];
      if (!pa) return;
      const wives = p.conjointIds.map((cid) => ({ id: cid, p: pos[cid] })).filter(x => x.p);
      if (!wives.length) return;

      const stemY = pa.y + R;
      const barY = pa.y + V_GAP * 0.3;
      links.push({ type: "fan-stem", id: `fstem-${p.id}`, x: pa.x, y1: stemY, y2: barY });
      const xs = wives.map(w => w.p.x);
      links.push({ type: "fan-hbar", id: `fhbar-${p.id}`, x1: Math.min(...xs), x2: Math.max(...xs), y: barY });
      wives.forEach(w => {
        links.push({ 
          type: "fan-branch", 
          id: `fbr-${p.id}-${w.id}`, 
          x: w.p.x, 
          y1: barY, 
          y2: w.p.y - R, 
          p1id: p.id, 
          p2id: w.id, 
          midX: w.p.x, 
          midY: (barY + w.p.y - R) / 2 
        });
      });
      p.conjointIds.forEach((cid) => seenCouple.add(`${Math.min(p.id, cid)}-${Math.max(p.id, cid)}`));
    }

    p.conjointIds.forEach((cid) => {
      const key = `${Math.min(p.id, cid)}-${Math.max(p.id, cid)}`;
      if (seenCouple.has(key)) return; seenCouple.add(key);
      const a = pos[p.id], b = pos[cid];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      links.push({ type: "couple", id: `cp-${key}`, x1: a.x + dx / len * R, y1: a.y + dy / len * R, x2: b.x - dx / len * R, y2: b.y - dy / len * R, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, p1id: p.id, p2id: cid });
    });
  });

  const famMap = new Map<string, { pids: number[], children: Person[] }>();
  data.forEach(c => {
    if (!c.parentIds.length) return;
    const key = [...c.parentIds].sort((a, b) => a - b).join("-");
    if (!famMap.has(key)) famMap.set(key, { pids: [...c.parentIds].sort((a, b) => a - b), children: [] });
    famMap.get(key)!.children.push(c);
  });

  let famIdx = 0;
  famMap.forEach(({ pids, children }) => {
    const vk = children.filter((c) => pos[c.id]);
    if (!vk.length) return;
    const isPatUnion = pids.some(pid => data.find(x => x.id === pid)?.conjointIds.length! >= 3);

    let stemX: number, stemTopY: number;
    if (pids.length === 2 && pos[pids[0]] && pos[pids[1]]) {
      const p1 = pos[pids[0]], p2 = pos[pids[1]];
      if (isPatUnion) {
        const wifeId = pids.find(pid => data.find(x => x.id === pid)?.conjointIds.length! < 3) || pids[0];
        stemX = pos[wifeId].x;
        stemTopY = pos[wifeId].y + R;
      } else {
        stemX = (p1.x + p2.x) / 2;
        stemTopY = Math.max(p1.y, p2.y) + R;
      }
    } else {
      if (!pos[pids[0]]) return;
      stemX = pos[pids[0]].x;
      stemTopY = pos[pids[0]].y + R;
    }

    const kidY = pos[vk[0].id].y;
    const midY = stemTopY + (kidY - R - stemTopY) * 0.5 + (famIdx * 4);
    famIdx++;
    const famId = pids.join("-");
    links.push({ type: "stem", id: `stem-${famId}`, x: stemX, y1: stemTopY, y2: midY });
    const xs = vk.map((c) => pos[c.id].x);
    links.push({ type: "hbar", id: `hbar-${famId}`, x1: vk.length > 1 ? Math.min(...xs) : stemX, x2: vk.length > 1 ? Math.max(...xs) : stemX, y: midY });
    vk.forEach((c) => links.push({ type: "branch", id: `br-${c.id}`, x: pos[c.id].x, y1: midY, y2: pos[c.id].y - R }));
  });
  return links;
}

// ══════════════════════════════════════════════
//  COMPONENTS
// ══════════════════════════════════════════════
function Spinner({ text = "Chargement..." }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#06141B] to-[#11212D] gap-4">
      <div className="w-9 h-9 border-3 border-[#253745] border-t-[#9BA8AB] rounded-full animate-spin" />
      <span className="text-[#4A5C6A] text-sm font-serif">{text}</span>
    </div>
  );
}

function Chatbot({ data, onClose }: { data: Person[], onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "model", text: "Bonjour ! Je suis votre assistant généalogique. Comment puis-je vous aider aujourd'hui ?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await chatWithFamilyTree(data, input, messages);
      setMessages(prev => [...prev, { role: "model", text: response }]);
    } catch (error) {
      console.error("Chatbot error:", error);
      setMessages(prev => [...prev, { role: "model", text: "Désolé, j'ai rencontré une erreur. Réessayez plus tard." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-24 right-6 w-80 h-[450px] bg-[#11212D] border border-[#253745] rounded-2xl shadow-2xl z-[600] flex flex-col overflow-hidden"
    >
      <div className="p-4 border-b border-[#253745] bg-[#06141B] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-[#4A8FBF]" size={18} />
          <span className="text-sm font-display font-bold text-[#CCD0CF]">Assistant IA</span>
        </div>
        <button onClick={onClose} className="text-[#4A5C6A] hover:text-white transition-colors"><X size={18} /></button>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-xs font-serif ${m.role === "user" ? "bg-[#4A8FBF] text-white rounded-tr-none" : "bg-[#253745] text-[#9BA8AB] rounded-tl-none"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#253745] p-3 rounded-2xl rounded-tl-none flex gap-1">
              <div className="w-1.5 h-1.5 bg-[#4A5C6A] rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-[#4A5C6A] rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-[#4A5C6A] rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[#253745] bg-[#06141B] flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder="Posez une question..."
          className="flex-1 bg-[#11212D] border border-[#253745] rounded-xl px-3 py-2 text-xs text-[#CCD0CF] outline-none focus:border-[#4A8FBF]"
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} className="w-9 h-9 bg-[#4A8FBF] rounded-xl flex items-center justify-center text-white hover:bg-[#5A9FCF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Send size={16} />
        </button>
      </div>
    </motion.div>
  );
}

interface MemberFormProps {
  config: { type: string; targetId?: number };
  data: Person[];
  onSave: (fd: Partial<Person>) => Promise<void>;
  onClose: () => void;
}

function MemberForm({ config, data, onSave, onClose }: MemberFormProps) {
  const { type, targetId } = config;
  const src = type === "edit" ? data.find((p) => p.id === targetId) : null;
  const [f, setF] = useState<Partial<Person>>({ prenom: src?.prenom || "", nom: src?.nom || "", naissance: src?.naissance || "", deces: src?.deces || "", bio: src?.bio || "", genre: src?.genre || "M", photo: src?.photo || null });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const set = (k: keyof Person, v: any) => setF((x) => ({ ...x, [k]: v }));
  const canSave = f.prenom?.trim() && f.nom?.trim() && f.naissance;
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = ev => set("photo", ev.target?.result);
    r.readAsDataURL(file);
  };

  const handleGeneratePortrait = async () => {
    if (!f.prenom || !f.nom || !f.naissance) {
      alert("Veuillez remplir le prénom, le nom et la date de naissance pour générer un portrait.");
      return;
    }
    setGenerating(true);
    try {
      const photo = await generatePortrait(f);
      if (photo) set("photo", photo);
    } catch (error) {
      console.error("Portrait generation error:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave({ ...f, deces: f.deces || null });
    setSaving(false);
  };

  const titles = { "add-conjoint": "💑 Ajouter un(e) conjoint(e)", "add-child": "👶 Ajouter un enfant", "add-parent": "👴 Ajouter un parent", "edit": "✏️ Modifier" };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-gradient-to-br from-[#06141B] to-[#11212D] border border-[#253745] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-thin"
      >
        <h2 className="text-lg font-display font-bold text-[#CCD0CF] mb-6">{titles[type]}</h2>
        
        <div className="flex items-center gap-4 mb-6">
          <div
            onClick={() => fileRef.current?.click()}
            className={`w-16 h-16 ${f.genre === "M" ? "rounded-lg" : "rounded-full"} bg-[#11212D] border-2 border-dashed border-[#4A5C6A] flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0 group relative`}
          >
            {f.photo ? <img src={f.photo} alt="" className="w-full h-full object-cover" /> : <Camera className="text-[#4A5C6A] group-hover:text-[#9BA8AB]" size={24} />}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[#9BA8AB] font-serif">Photo de profil</span>
            <div className="flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="px-3 py-1 bg-[#253745] border border-[#4A5C6A] rounded-md text-[10px] text-[#9BA8AB] hover:text-white transition-colors">Importer</button>
              <button 
                onClick={handleGeneratePortrait} 
                disabled={generating}
                className="px-3 py-1 bg-[#4A8FBF]/10 border border-[#4A8FBF]/30 rounded-md text-[10px] text-[#4A8FBF] hover:bg-[#4A8FBF]/20 transition-all flex items-center gap-1"
              >
                {generating ? <RefreshCw className="animate-spin" size={10} /> : <Sparkles size={10} />}
                {generating ? "Génération..." : "IA Portrait"}
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">Prénom *</label>
            <input value={f.prenom} onChange={e => set("prenom", e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">Nom *</label>
            <input value={f.nom} onChange={e => set("nom", e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none" />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans mb-1 block">Genre *</label>
          <div className="flex gap-2">
            {[["M", "Homme", C.male], ["F", "Femme", C.female]].map(([v, lb, col]) => (
              <button
                key={v}
                onClick={() => set("genre", v)}
                className={`flex-1 py-2 rounded-lg border-1.5 text-xs transition-all ${f.genre === v ? `border-[${col}] bg-[${col}]/10 text-[${col}]` : "border-[#253745] bg-[#11212D] text-[#4A5C6A]"}`}
                style={{ borderColor: f.genre === v ? col : "#253745", color: f.genre === v ? col : "#4A5C6A", backgroundColor: f.genre === v ? `${col}18` : "#11212D" }}
              >
                {v === "M" ? "🟦" : "🔴"} {lb}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">Naissance *</label>
            <input type="date" value={f.naissance} onChange={e => set("naissance", e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">Décès</label>
            <input type="date" value={f.deces} onChange={e => set("deces", e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none" />
          </div>
        </div>

        <div className="mb-6">
          <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans mb-1 block">Biographie</label>
          <textarea value={f.bio} onChange={e => set("bio", e.target.value)} placeholder="Quelques mots..." className="w-full bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none min-h-[80px] resize-none" />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[#11212D] border border-[#253745] text-[#4A5C6A] text-sm hover:text-white transition-colors">Annuler</button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`flex-[2] py-2.5 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 transition-all ${canSave ? "bg-[#4A8FBF]/20 border border-[#4A8FBF] text-[#CCD0CF] hover:bg-[#4A8FBF]/30" : "bg-[#11212D] border border-[#253745] text-[#4A5C6A] cursor-not-allowed"}`}
          >
            {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

interface PersonNodeProps {
  person: Person;
  p: Position;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
}

function PersonNode({ person, p, isSelected, isDragging, onClick }: PersonNodeProps) {
  const fem = isFem(person), col = fem ? C.female : C.male, colL = fem ? C.femaleL : C.maleL;
  const dead = !!person.deces, { x, y } = p;
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} className="cursor-pointer" style={{ opacity: isDragging ? 0.65 : 1 }}>
      {isSelected && (fem ? <circle r={R + 9} fill={`${col}15`} stroke={`${col}35`} strokeWidth={1} /> : <rect x={-R - 9} y={-R - 9} width={NW + 18} height={NH + 18} rx={7} fill={`${col}15`} stroke={`${col}35`} strokeWidth={1} />)}
      {fem ? <circle r={R + 1} cy={3} fill="rgba(0,0,0,0.28)" /> : <rect x={-R + 1} y={-R + 3} width={NW} height={NH} rx={5} fill="rgba(0,0,0,0.28)" />}
      {fem ? <circle r={R} fill={dead ? C.c2 : colL} stroke={isSelected ? col : `${col}80`} strokeWidth={isSelected ? 2.5 : 1.5} className="transition-all duration-200" />
        : <rect x={-R} y={-R} width={NW} height={NH} rx={5} fill={dead ? C.c2 : colL} stroke={isSelected ? col : `${col}80`} strokeWidth={isSelected ? 2.5 : 1.5} className="transition-all duration-200" />}
      {person.photo && (
        <>
          <clipPath id={`cl-${person.id}`}>{fem ? <circle r={R - 2} /> : <rect x={-R + 2} y={-R + 2} width={NW - 4} height={NH - 4} rx={4} />}</clipPath>
          <image href={person.photo} x={-R + 2} y={-R + 2} width={NW - 4} height={NH - 4} clipPath={`url(#cl-${person.id})`} preserveAspectRatio="xMidYMid slice" style={{ opacity: dead ? 0.45 : 1 }} />
        </>
      )}
      {!person.photo && <text textAnchor="middle" dominantBaseline="central" fill={dead ? C.c4 : col} fontSize="13" fontWeight="700" className="font-display select-none">{initials(person)}</text>}
      {dead && <text x={R - 6} y={-R + 9} fontSize="9" fill={C.c4} className="select-none">✝</text>}
      <text y={R + 14} textAnchor="middle" fill={isSelected ? C.c6 : C.c4} fontSize="9" className="font-serif select-none transition-colors duration-200">{person.prenom}</text>
    </g>
  );
}

interface PersonPanelProps {
  person: Person;
  data: Person[];
  isAdmin: boolean;
  onClose: () => void;
  onAddConjoint: () => void;
  onAddParent: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: (id: number) => void;
  onLink: () => void;
  onUpdate: (p: Person) => void;
}

function PersonPanel({ person, data, isAdmin, onClose, onAddConjoint, onAddParent, onAddChild, onEdit, onDelete, onSelect, onLink, onUpdate }: PersonPanelProps) {
  const fem = isFem(person), col = fem ? C.female : C.male;
  const dead = !!person.deces, age = calcAge(person.naissance, person.deces);
  const conjoints = person.conjointIds.map((id) => data.find((p) => p.id === id)).filter(Boolean);
  const parents = person.parentIds.map((id) => data.find((p) => p.id === id)).filter(Boolean);
  const children = data.filter(p => p.parentIds.includes(person.id));
  const allSiblings = data.filter(p => p.id !== person.id && p.parentIds.some((pid) => person.parentIds.includes(pid)));
  
  const fullSiblings = allSiblings.filter(s => 
    s.parentIds.length === person.parentIds.length && 
    s.parentIds.every(pid => person.parentIds.includes(pid))
  );
  
  const halfSiblings = allSiblings.filter(s => !fullSiblings.includes(s));
  const grandchildren = data.filter(p => p.parentIds.some((pid) => children.map(c => c.id).includes(pid)));

  const [speaking, setSpeaking] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleSpeak = async () => {
    if (!person.bio || speaking) return;
    setSpeaking(true);
    try {
      const audioUrl = await speakBiography(person.bio);
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.onended = () => setSpeaking(false);
        audio.play();
      } else {
        setSpeaking(false);
      }
    } catch (error) {
      console.error("TTS error:", error);
      setSpeaking(false);
    }
  };

  const handleGeneratePortrait = async () => {
    setGenerating(true);
    try {
      const photo = await generatePortrait(person);
      if (photo) {
        onUpdate({ ...person, photo });
      }
    } catch (error) {
      console.error("Portrait generation error:", error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      className="fixed top-0 right-0 w-72 h-screen bg-gradient-to-b from-[#06141B] to-[#11212D] border-l-2 border-[#253745] z-[100] flex flex-col shadow-2xl"
    >
      <div className="p-4 border-b border-[#253745] flex-shrink-0">
        <button onClick={onClose} className="float-right text-[#4A5C6A] hover:text-white transition-colors"><X size={20} /></button>
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 ${fem ? "rounded-full" : "rounded-lg"} bg-[#11212D] border-2 border-[${col}] flex items-center justify-center overflow-hidden flex-shrink-0`} style={{ borderColor: col }}>
            {person.photo ? <img src={person.photo} className={`w-full h-full object-cover ${dead ? "opacity-50" : ""}`} /> : <span className="text-sm font-bold font-display" style={{ color: col }}>{initials(person)}</span>}
          </div>
          <div>
            <div className="font-display font-bold text-[#CCD0CF] leading-tight flex items-center gap-2">
              {person.prenom} <span className="text-[9px] text-[#4A5C6A]">#{person.id}</span>
            </div>
            <div className="text-xs font-serif" style={{ color: col }}>{person.nom}</div>
            {dead && <div className="text-[9px] text-[#4A5C6A] mt-1">✝ Décédé(e) · {age} ans</div>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
        <div className="grid grid-cols-2 gap-2">
          {[["🎂", "Naissance", fmtDate(person.naissance)], [dead ? "⚰️" : "⏳", dead ? "Décès" : "Âge", dead ? fmtDate(person.deces) : `${age} ans`]].map(([ic, lb, vl]) => (
            <div key={lb} className="bg-[#11212D] border border-[#253745] rounded-xl p-2.5">
              <div className="text-sm mb-1">{ic}</div>
              <div className="text-[8px] text-[#4A5C6A] uppercase tracking-widest font-sans mb-0.5">{lb}</div>
              <div className="text-[11px] text-[#9BA8AB] font-serif">{vl}</div>
            </div>
          ))}
        </div>

        {person.bio && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[9px] text-[#4A5C6A] uppercase tracking-widest font-sans block">Biographie</label>
              <button 
                onClick={handleSpeak} 
                disabled={speaking}
                className={`p-1 rounded-md transition-colors ${speaking ? "text-[#4A8FBF] bg-[#4A8FBF]/10" : "text-[#4A5C6A] hover:text-[#9BA8AB] hover:bg-[#253745]"}`}
              >
                <Volume2 size={14} className={speaking ? "animate-pulse" : ""} />
              </button>
            </div>
            <p className="text-xs text-[#9BA8AB] leading-relaxed font-serif">{person.bio}</p>
          </div>
        )}

        {( [
          [`💑 Conjoint(e)${conjoints.length > 1 ? "s" : ""}`, conjoints],
          ["👨‍👩‍👧 Parents", parents],
          [`👶 Enfants (${children.length})`, children],
          [`🍼 Petits-Enfants (${grandchildren.length})`, grandchildren],
          [`👥 Frères & Sœurs`, fullSiblings],
          [`👥 Demi-Frères & Sœurs`, halfSiblings]
        ] as [string, Person[]][]).filter(([, m]) => m.length > 0).map(([lb, members]) => (
          <div key={lb}>
            <label className="text-[9px] text-[#4A5C6A] uppercase tracking-widest font-sans mb-2 block">{lb}</label>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m: Person) => (
                <button 
                  key={m.id} 
                  onClick={() => onSelect(m.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-serif border transition-all hover:scale-105 active:scale-95 ${isFem(m) ? "bg-[#BF4A6A]/10 border-[#BF4A6A]/30 text-[#BF4A6A] hover:bg-[#BF4A6A]/20" : "bg-[#4A8FBF]/10 border-[#4A8FBF]/30 text-[#4A8FBF] hover:bg-[#4A8FBF]/20"}`}
                >
                  {m.prenom} {m.nom}
                </button>
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div className="pt-6 border-t border-[#253745] space-y-3">
            <label className="text-[9px] text-[#4A5C6A] uppercase tracking-widest font-sans mb-1 block">⚙️ Administration</label>
            <div className="flex flex-col gap-2">
              <AdminBtn onClick={onAddConjoint} icon={<UserPlus size={14} />} text="Ajouter conjoint(e)" color="#9BA8AB" />
              <AdminBtn onClick={onAddParent} icon={<Users size={14} />} text="Ajouter parent" color="#a89bd4" />
              <AdminBtn onClick={onAddChild} icon={<Plus size={14} />} text="Ajouter un enfant" color="#82c582" />
              <AdminBtn onClick={onLink} icon={<Link size={14} />} text="Lier à un membre existant" color="#9BA8AB" />
              <AdminBtn 
                onClick={handleGeneratePortrait} 
                icon={generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} 
                text={generating ? "Génération..." : "Générer un portrait IA"} 
                color="#4A8FBF" 
              />
              <AdminBtn onClick={onEdit} icon={<Edit2 size={14} />} text="Modifier" color="#4A8FBF" />
              <AdminBtn onClick={onDelete} icon={<Trash2 size={14} />} text="Supprimer" color="#BF4A4A" danger />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface AdminBtnProps {
  onClick: () => void | Promise<void>;
  icon: React.ReactNode;
  text: string;
  color?: string;
  danger?: boolean;
}

function AdminBtn({ onClick, icon, text, color, danger }: AdminBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-serif transition-all border ${danger ? "bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500/10" : "bg-[#11212D] border-[#253745] text-[#9BA8AB] hover:text-white hover:bg-[#253745]"}`}
      style={{ color: !danger ? color : undefined }}
    >
      {icon} {text}
    </button>
  );
}

function LoginScreen({ onLogin }: { onLogin: (role: "family" | "admin") => void }) {
  const [pwd, setPwd] = useState(""), [err, setErr] = useState(false), [shake, setShake] = useState(false);
  const go = () => {
    if (pwd === FAMILY_PWD) { onLogin("family"); return; }
    if (pwd === ADMIN_PWD) { onLogin("admin"); return; }
    setErr(true); setShake(true); setTimeout(() => setShake(false), 500);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06141B] via-[#11212D] to-[#253745] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-gradient-to-br from-[#06141B]/90 to-[#11212D]/90 backdrop-blur-xl border border-[#253745] rounded-3xl p-10 w-full max-w-xs text-center shadow-2xl ${shake ? "animate-[shake_0.45s_ease-out]" : ""}`}
      >
        <div className="text-6xl mb-4 animate-[float_4s_ease-in-out_infinite]">🌳</div>
        <h1 className="font-display font-bold text-[#CCD0CF] text-2xl mb-1">Arbre Familial</h1>
        <p className="text-[#4A5C6A] text-sm font-serif italic mb-8">Espace privé de la famille</p>
        
        <div className="space-y-4">
          <input
            type="password"
            value={pwd}
            placeholder="Mot de passe"
            onChange={e => { setPwd(e.target.value); setErr(false); }}
            onKeyDown={e => e.key === "Enter" && go()}
            className="w-full bg-[#11212D] border border-[#253745] rounded-xl px-4 py-3 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none transition-all placeholder:text-[#4A5C6A]"
          />
          {err && <p className="text-red-500 text-[10px] font-sans">Mot de passe incorrect</p>}
          <button onClick={go} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#253745] to-[#4A5C6A] border border-[#4A5C6A] text-[#CCD0CF] font-display font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all">Entrer →</button>
        </div>

        <div className="mt-8 flex justify-center gap-6">
          {[["Homme", false], ["Femme", true]].map(([lb, f]) => (
            <div key={lb} className="flex items-center gap-2">
              <div className={`w-3 h-3 ${f ? "rounded-full" : "rounded-sm"} border-1.5`} style={{ backgroundColor: `${f ? C.female : C.male}30`, borderColor: f ? C.female : C.male }} />
              <span className="text-[10px] text-[#4A5C6A] font-sans uppercase tracking-wider">{lb}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════
export default function App() {
  const [mode, setMode] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 });
  const [panDrag, setPanDrag] = useState(null);
  const [svgW, setSvgW] = useState(window.innerWidth);
  const [offsets, setOffsets] = useState({});
  const [search, setSearch] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const subtreeDragRef = useRef(null);
  const svgRef = useRef(null);

  const basePos = computeLayout(data);
  const finalPos = {};
  Object.keys(basePos).forEach(id => {
    const nid = Number(id), off = offsets[nid] || { dx: 0, dy: 0 };
    finalPos[nid] = { x: basePos[nid].x + off.dx, y: basePos[nid].y + off.dy };
  });

  const links = buildLinks(data, finalPos);
  const selPerson = data.find(p => p.id === selected);
  const isAdmin = mode === "admin";
  const panelOpen = !!selPerson;

  // Filtrage pour la recherche
  const searchResults = search.trim() 
    ? data.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase()))
    : [];

  const handleSearchSelect = (person) => {
    setSelected(person.id);
    setSearch("");
    // Centrer la vue sur la personne
    const p = finalPos[person.id];
    if (p) {
      setTf(t => ({ ...t, x: -p.x * t.scale, y: -p.y * t.scale }));
    }
  };

  useEffect(() => {
    if (!mode) return;
    setLoading(true);
    apiGet().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [mode]);

  useEffect(() => {
    const upd = () => setSvgW(window.innerWidth);
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setTf(t => ({ ...t, scale: Math.min(3, Math.max(0.15, t.scale * (e.deltaY < 0 ? 1.1 : 0.91))) }));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (el) el.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const toSvg = useCallback((cx, cy) => {
    const ox = (svgW - (panelOpen ? 280 : 0)) / 2;
    return { sx: (cx - ox - tf.x) / tf.scale, sy: (cy - 90 - tf.y) / tf.scale };
  }, [svgW, panelOpen, tf]);

  const onMD = useCallback((e) => {
    if (isAdmin && e.target.dataset.fanwife) {
      const wifId = Number(e.target.dataset.fanwife);
      const subtree = subtreeOf(wifId, data);
      const { sx, sy } = toSvg(e.clientX, e.clientY);
      subtreeDragRef.current = { wifId, subtree, sx0: sx, sy0: sy, moved: false, baseOff: { ...offsets } };
      e.stopPropagation(); return;
    }
    if (e.target.closest("[data-node]")) return;
    setPanDrag({ sx: e.clientX - tf.x, sy: e.clientY - tf.y });
  }, [isAdmin, data, offsets, toSvg, tf]);

  const onMM = useCallback((e) => {
    if (subtreeDragRef.current) {
      const { sx, sy } = toSvg(e.clientX, e.clientY);
      const dx = sx - subtreeDragRef.current.sx0, dy = sy - subtreeDragRef.current.sy0;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) subtreeDragRef.current.moved = true;
      const next = { ...subtreeDragRef.current.baseOff };
      subtreeDragRef.current.subtree.forEach((id) => {
        const b = subtreeDragRef.current.baseOff[id] || { dx: 0, dy: 0 };
        next[id] = { dx: b.dx + dx, dy: b.dy + dy };
      });
      setOffsets(next); return;
    }
    if (panDrag) setTf(t => ({ ...t, x: e.clientX - panDrag.sx, y: e.clientY - panDrag.sy }));
  }, [panDrag, toSvg]);

  const onMU = useCallback(() => { subtreeDragRef.current = null; setPanDrag(null); }, []);

  const handleSave = async (fd) => {
    if (!form) return;
    const { type, targetId, parentIds } = form;
    if (type === "edit") {
      const u = { ...data.find(p => p.id === targetId), ...fd };
      await apiUpdate(u); setData(d => d.map(p => p.id === targetId ? u : p));
    } else if (type === "add-conjoint") {
      const nid = nextId(data);
      const newM = { id: nid, ...fd, parentIds: [], conjointIds: [targetId] };
      await apiAdd(newM);
      const t = data.find(p => p.id === targetId);
      const ut = { ...t, conjointIds: [...t.conjointIds, nid] };
      await apiUpdate(ut);
      setData(d => [...d.map(p => p.id === targetId ? ut : p), newM]);
    } else if (type === "add-child") {
      const nid = nextId(data);
      const newM = { id: nid, ...fd, parentIds, conjointIds: [] };
      await apiAdd(newM); setData(d => [...d, newM]);
    } else if (type === "add-parent") {
      const nid = nextId(data);
      const newM = { id: nid, ...fd, parentIds: [], conjointIds: [] };
      await apiAdd(newM);
      const t = data.find(p => p.id === targetId);
      const ut = { ...t, parentIds: [...t.parentIds, nid] };
      await apiUpdate(ut);
      setData(d => [...d.map(p => p.id === targetId ? ut : p), newM]);
    }
    setForm(null);
  };

  const [showLinkModal, setShowLinkModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleLink = async (targetId, type) => {
    if (!selected) return;
    const p1 = data.find(x => x.id === selected);
    const p2 = data.find(x => x.id === targetId);
    if (!p1 || !p2) return;

    const u1 = { ...p1 }, u2 = { ...p2 };
    if (type === "conjoint") {
      if (!u1.conjointIds.includes(p2.id)) u1.conjointIds.push(p2.id);
      if (!u2.conjointIds.includes(p1.id)) u2.conjointIds.push(p1.id);
    } else if (type === "parent") {
      if (!u1.parentIds.includes(p2.id)) u1.parentIds.push(p2.id);
    } else if (type === "enfant") {
      if (!u2.parentIds.includes(p1.id)) u2.parentIds.push(p1.id);
    }

    await apiUpdate(u1);
    await apiUpdate(u2);
    const d = await apiGet();
    setData(d);
    setShowLinkModal(null);
  };

  const handleDelete = async (id) => {
    setConfirmDelete(id);
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete;
    await apiDelete(id);
    setData(d => d.filter(p => p.id !== id).map(p => ({
      ...p,
      conjointIds: p.conjointIds.filter((c) => c !== id),
      parentIds: p.parentIds.filter((c) => c !== id),
    })));
    setConfirmDelete(null);
    setSelected(null);
  };

  const handleLinkClick = (e, link) => {
    if (!isAdmin) return;
    if (subtreeDragRef.current?.moved) return;
    e.stopPropagation();
    setForm({ type: "add-child", targetId: null, parentIds: [link.p1id, link.p2id] });
  };

  if (!mode) return <LoginScreen onLogin={setMode} />;
  if (loading) return <Spinner text="Chargement de l'arbre..." />;

  const cx_val = (svgW - (panelOpen ? 280 : 0)) / 2;
  const draggingSubtree = subtreeDragRef.current?.subtree;

  return (
    <div className="h-screen bg-gradient-to-br from-[#06141B] via-[#11212D] to-[#253745] overflow-hidden flex flex-col relative">
      <div className="h-14 bg-[#06141B]/90 backdrop-blur-xl border-b border-[#253745] flex items-center justify-between px-6 flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          <span className="text-xl">🌳</span>
          <h1 className="font-display font-bold text-[#CCD0CF] text-base">Arbre Familial</h1>
          <span className="text-[10px] text-[#4A5C6A] uppercase tracking-widest font-sans">{data.length} membres</span>
          {isAdmin && <span className="bg-[#82c582]/10 border border-[#82c582]/30 text-[#82c582] text-[8px] px-2 py-0.5 rounded-full font-sans tracking-widest uppercase">Admin</span>}
        </div>
        <div className="flex items-center gap-4 flex-1 max-w-md mx-4 relative">
          <div className="relative w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un membre..."
              className="w-full bg-[#11212D] border border-[#253745] rounded-full px-4 py-1.5 text-xs text-[#CCD0CF] focus:border-[#4A8FBF] outline-none transition-all"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#11212D] border border-[#253745] rounded-xl shadow-2xl overflow-hidden z-[100] max-h-60 overflow-y-auto scrollbar-thin">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSearchSelect(p)}
                    className="w-full px-4 py-2 text-left text-xs text-[#9BA8AB] hover:bg-[#253745] hover:text-white transition-colors flex items-center gap-2 border-b border-[#253745] last:border-0"
                  >
                    <div className={`w-6 h-6 rounded-full border border-[${isFem(p) ? C.female : C.male}] flex items-center justify-center text-[8px]`} style={{ borderColor: isFem(p) ? C.female : C.male }}>
                      {initials(p)}
                    </div>
                    {p.prenom} {p.nom}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {isAdmin && Object.keys(offsets).length > 0 && (
            <button onClick={() => setOffsets({})} className="h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-sans uppercase tracking-widest hover:bg-red-500/20 transition-colors">Positions</button>
          )}
          <div className="flex bg-[#11212D] border border-[#253745] rounded-lg p-0.5">
            <button onClick={() => setTf(t => ({ ...t, scale: Math.max(0.15, t.scale - 0.15) }))} className="w-8 h-8 flex items-center justify-center text-[#9BA8AB] hover:text-white transition-colors"><ZoomOut size={16} /></button>
            <button onClick={() => setTf(t => ({ ...t, scale: Math.min(3, t.scale + 0.15) }))} className="w-8 h-8 flex items-center justify-center text-[#9BA8AB] hover:text-white transition-colors"><ZoomIn size={16} /></button>
          </div>
          <button onClick={() => setTf({ x: 0, y: 0, scale: 1 })} className="h-8 px-3 rounded-lg bg-[#11212D] border border-[#253745] text-[#9BA8AB] text-[10px] font-sans uppercase tracking-widest hover:text-white transition-colors">Centrer</button>
          <button onClick={() => { setMode(null); setSelected(null); setData([]); setOffsets({}); }} className="h-8 px-3 rounded-lg bg-[#11212D] border border-[#253745] text-[#9BA8AB] text-[10px] font-sans uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"><LogOut size={12} /> Quitter</button>
        </div>
      </div>

      <svg ref={svgRef} className={`flex-1 ${subtreeDragRef.current || panDrag ? "cursor-grabbing" : "cursor-grab"}`} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
        <g transform={`translate(${cx_val + tf.x},${90 + tf.y}) scale(${tf.scale})`}>
          {links.map((l) => {
            if (l.type === "fan-stem") return <line key={l.id} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={C.link} strokeWidth="1.6" opacity="0.4" strokeDasharray="4 2" />;
            if (l.type === "fan-hbar") return <line key={l.id} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} stroke={C.link} strokeWidth="1.6" opacity="0.4" strokeDasharray="4 2" />;
            if (l.type === "fan-branch") {
              return (
                <g key={l.id}>
                  <line x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={C.link} strokeWidth="1.6" opacity="0.4" strokeDasharray="4 2" />
                  {isAdmin && (
                    <g onClick={e => handleLinkClick(e, l)} className="cursor-pointer">
                      <circle cx={l.midX} cy={l.midY} r={11} fill={C.c2} stroke="#82c582" strokeWidth="1.3" />
                      <text x={l.midX} y={l.midY} textAnchor="middle" dominantBaseline="central" fill="#82c582" fontSize="16" fontWeight="bold" className="select-none pointer-events-none">+</text>
                    </g>
                  )}
                </g>
              );
            }
            if (l.type === "couple") {
              return (
                <g key={l.id}>
                  <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={C.link} strokeWidth="1.8" strokeDasharray="5,3" opacity="0.55" />
                  {isAdmin && (
                    <g onClick={e => handleLinkClick(e, l)} className="cursor-pointer">
                      <circle cx={l.midX} cy={l.midY} r={11} fill={C.c2} stroke="#82c582" strokeWidth="1.3" />
                      <text x={l.midX} y={l.midY} textAnchor="middle" dominantBaseline="central" fill="#82c582" fontSize="16" fontWeight="bold" className="select-none pointer-events-none">+</text>
                    </g>
                  )}
                </g>
              );
            }
            if (l.type === "stem") return <line key={l.id} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={C.link} strokeWidth="1.6" opacity="0.4" />;
            if (l.type === "hbar") return <line key={l.id} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} stroke={C.link} strokeWidth="1.6" opacity="0.4" />;
            if (l.type === "branch") return <line key={l.id} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={C.link} strokeWidth="1.6" opacity="0.4" />;
            return null;
          })}
          {data.map(person => {
            const p = finalPos[person.id]; if (!p) return null;
            return (
              <g key={person.id} data-node="1">
                <PersonNode
                  person={person}
                  p={p}
                  isSelected={selected === person.id}
                  isDragging={draggingSubtree?.has(person.id) || false}
                  onClick={() => { if (subtreeDragRef.current?.moved) return; setSelected(s => s === person.id ? null : person.id); }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <AnimatePresence>
        {selPerson && (
          <PersonPanel
            person={selPerson}
            data={data}
            isAdmin={isAdmin}
            onClose={() => setSelected(null)}
            onAddConjoint={() => setForm({ type: "add-conjoint", targetId: selPerson.id, parentIds: [] })}
            onAddParent={() => setForm({ type: "add-parent", targetId: selPerson.id, parentIds: [] })}
            onAddChild={() => setForm({ type: "add-child", targetId: null, parentIds: [selPerson.id] })}
            onLink={() => setShowLinkModal(selPerson.id)}
            onEdit={() => setForm({ type: "edit", targetId: selPerson.id, parentIds: [] })}
            onDelete={() => handleDelete(selPerson.id)}
            onUpdate={async (u) => {
              await apiUpdate(u);
              setData(d => d.map(p => p.id === u.id ? u : p));
            }}
            onSelect={(id) => {
              setSelected(id);
              const p = finalPos[id];
              if (p) setTf(t => ({ ...t, x: -p.x * t.scale, y: -p.y * t.scale }));
            }}
          />
        )}
      </AnimatePresence>

      {form && <MemberForm config={form} data={data} onSave={handleSave} onClose={() => setForm(null)} />}
      {showLinkModal && <LinkModal personId={showLinkModal} data={data} onLink={handleLink} onClose={() => setShowLinkModal(null)} />}

      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#4A8FBF] rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all z-[500]"
      >
        {chatOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>

      <AnimatePresence>
        {chatOpen && <Chatbot data={data} onClose={() => setChatOpen(false)} />}
      </AnimatePresence>

      <div className="fixed bottom-6 left-6 bg-[#06141B]/90 backdrop-blur-xl border border-[#253745] rounded-2xl p-4 z-50 shadow-2xl">
        <div className="text-[8px] text-[#4A5C6A] uppercase tracking-[0.2em] font-sans mb-4">Légende</div>
        <div className="space-y-3">
          {[["Homme", false], ["Femme", true]].map(([lb, f]) => (
            <div key={lb} className="flex items-center gap-3">
              <div className={`w-3 h-3 ${f ? "rounded-full" : "rounded-sm"} border-1.5`} style={{ backgroundColor: `${f ? C.female : C.male}25`, borderColor: f ? C.female : C.male }} />
              <span className="text-[10px] text-[#9BA8AB] font-serif">{lb}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <div className="w-4 h-0 border-t-1.5 border-dashed border-[#9BA8AB]/40" />
            <span className="text-[10px] text-[#9BA8AB] font-serif">1-2 conjoints</span>
          </div>
          <div className="flex items-center gap-3">
            <svg width="16" height="12"><line x1="8" y1="0" x2="0" y2="12" stroke={C.link} strokeWidth="1.5" opacity="0.5" /><line x1="8" y1="0" x2="16" y2="12" stroke={C.link} strokeWidth="1.5" opacity="0.5" /></svg>
            <span className="text-[10px] text-[#9BA8AB] font-serif">3+ conjoints (fan)</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#06141B]/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#11212D] border border-[#253745] rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-display font-bold text-[#CCD0CF] mb-2">Supprimer ce membre ?</h3>
              <p className="text-[#4A5C6A] text-sm mb-8">Cette action est irréversible et retirera cette personne de tous les liens familiaux.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-3 px-6 rounded-xl bg-[#253745] text-[#9BA8AB] text-sm font-medium hover:bg-[#2C3E4A] transition-colors"
                >
                  Annuler
                </button>
                <button 
                  onClick={executeDelete}
                  className="flex-1 py-3 px-6 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface LinkModalProps {
  personId: number;
  data: Person[];
  onLink: (targetId: number, type: string) => void;
  onClose: () => void;
}

function LinkModal({ personId, data, onLink, onClose }: LinkModalProps) {
  const [targetId, setTargetId] = useState(null);
  const [type, setType] = useState("conjoint");
  const p = data.find((x) => x.id === personId);
  const others = data.filter((x) => x.id !== personId).sort((a, b) => a.prenom.localeCompare(b.prenom));

  return (
    <div onClick={onClose} className="fixed inset-0 z-[600] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#11212D] border border-[#253745] rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <h2 className="text-lg font-display font-bold text-[#CCD0CF] mb-4">Lier {p?.prenom} à...</h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans mb-1 block">Type de relation</label>
            <div className="flex gap-2">
              {[["conjoint", "Conjoint(e)"], ["parent", "Parent"], ["enfant", "Enfant"]].map(([v, lb]) => (
                <button
                  key={v}
                  onClick={() => setType(v)}
                  className={`flex-1 py-2 rounded-lg border text-[10px] transition-all ${type === v ? "border-[#4A8FBF] bg-[#4A8FBF]/10 text-[#4A8FBF]" : "border-[#253745] bg-[#06141B] text-[#4A5C6A]"}`}
                >
                  {lb}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans mb-1 block">Choisir un membre</label>
            <select 
              value={targetId || ""} 
              onChange={e => setTargetId(Number(e.target.value))}
              className="w-full bg-[#06141B] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] outline-none focus:border-[#4A8FBF]"
            >
              <option value="">Sélectionner...</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.prenom} {o.nom} (#{o.id})</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[#253745] text-[#9BA8AB] text-sm hover:text-white transition-colors">Annuler</button>
            <button
              onClick={() => targetId && onLink(targetId, type)}
              disabled={!targetId}
              className={`flex-[2] py-2.5 rounded-xl font-display font-bold text-sm transition-all ${targetId ? "bg-[#4A8FBF] text-white hover:bg-[#5A9FCF]" : "bg-[#253745] text-[#4A5C6A] cursor-not-allowed"}`}
            >
              Créer le lien
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
