import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, UserPlus, Users, Save, X, Camera, Volume2, LogOut, ZoomIn, ZoomOut, RefreshCw, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generateMemberImage, generateSpeech } from "./services/geminiService";
import ChatBot from "./components/ChatBot";

const FAMILY_PWD = "famille2026";
const ADMIN_PWD  = "admin2026";

const C = {
  c1:"#06141B", c2:"#11212D", c3:"#253745",
  c4:"#4A5C6A", c5:"#9BA8AB", c6:"#CCD0CF",
  male:"#4A8FBF", female:"#BF4A6A",
  maleL:"#4A8FBF33", femaleL:"#BF4A6A33",
  link:"#9BA8AB",
};

const NW=54, NH=54, R=NW/2;
const H_GAP=200;
const V_GAP=230;
const FAN_DY=120;

// ══════════════════════════════════════════════
//  API
// ══════════════════════════════════════════════
const norm=m=>({
  ...m,
  id:Number(m.id),
  parentIds:(Array.isArray(m.parentIds)?m.parentIds:JSON.parse(m.parentIds||"[]")).map(Number),
  conjointIds:(Array.isArray(m.conjointIds)?m.conjointIds:JSON.parse(m.conjointIds||"[]")).map(Number),
});
const apiGet=()=>fetch("/api/membres").then(r=>r.json()).then(d=>d.map(norm));
const apiAdd=m=>fetch("/api/add-membre",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(m)}).then(r=>r.json());
const apiUpdate=m=>fetch("/api/update-membre",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(m)}).then(r=>r.json());
const apiDelete=id=>fetch("/api/delete-membre",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})}).then(r=>r.json());

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const nextId=d=>Math.max(0,...d.map(p=>p.id))+1;
const initials=p=>`${p.prenom[0]}${p.nom[0]}`.toUpperCase();
const fmtDate=s=>s?new Date(s).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"—";
const isFem=p=>p.genre==="F";

function calcAge(b,d){
  const e=d?new Date(d):new Date(),bb=new Date(b);
  let a=e.getFullYear()-bb.getFullYear();
  if(e.getMonth()-bb.getMonth()<0||(e.getMonth()===bb.getMonth()&&e.getDate()<bb.getDate()))a--;
  return a;
}

// ── Generation map ──
function buildGenMap(data){
  const memo={};
  function gen(id,stk=new Set()){
    if(id in memo)return memo[id];
    if(stk.has(id))return 0;
    const p=data.find(x=>x.id===id);
    if(!p)return(memo[id]=0);
    const ns=new Set(stk);ns.add(id);
    let g=0;
    if(p.parentIds.length){
      g=1+Math.max(...p.parentIds.map(pid=>gen(pid,ns)));
    }else if(p.conjointIds.length){
      const cg=p.conjointIds.map(cid=>{
        const c=data.find(x=>x.id===cid);
        if(!c||ns.has(cid))return 0;
        return c.parentIds.length?1+Math.max(...c.parentIds.map(pid=>gen(pid,ns))):0;
      });
      g=Math.max(0,...cg);
    }
    return(memo[id]=g);
  }
  data.forEach(p=>gen(p.id));
  return memo;
}

// ── Subtree collector ──
function subtreeOf(rootId,data){
  const s=new Set([rootId]);
  let ch=true;
  while(ch){ch=false;data.forEach(p=>{if(!s.has(p.id)&&p.parentIds.some(pid=>s.has(pid))){s.add(p.id);ch=true;}});}
  return s;
}

// ══════════════════════════════════════════════
//  FAN DETECTION  (≥3 conjoints = fan mode)
// ══════════════════════════════════════════════
function detectFan(data,genOf){
  const patriarchs=new Set();
  data.forEach(p=>{
    const sg=p.conjointIds.filter(cid=>{const c=data.find(x=>x.id===cid);return c&&genOf[c.id]===genOf[p.id];});
    if(sg.length>=3)patriarchs.add(p.id);
  });
  const spouseOf=new Map();
  patriarchs.forEach(pid=>{
    data.find(x=>x.id===pid).conjointIds.forEach(cid=>{
      const c=data.find(x=>x.id===cid);
      if(c&&genOf[c.id]===genOf[pid])spouseOf.set(cid,pid);
    });
  });
  const yExtra={};
  spouseOf.forEach((_,sid)=>{yExtra[sid]=FAN_DY;});
  let ch=true;
  while(ch){ch=false;data.forEach(p=>{if(!(p.id in yExtra)&&p.parentIds.some(pid=>pid in yExtra)){yExtra[p.id]=FAN_DY;ch=true;}});}
  return{patriarchs,spouseOf,yExtra};
}

// ══════════════════════════════════════════════
//  COUPLE ORDER
//  0 conjoints → [p]
//  1 conjoint  → [p, conjoint]
//  2 conjoints → [conjointA, p, conjointB]  ← sandwich
// ══════════════════════════════════════════════
function coupleOrder(p,people,seen,patriarchs,spouseOf){
  if(patriarchs.has(p.id)||spouseOf.has(p.id))return[p];
  const avail=p.conjointIds
    .map(cid=>people.find(x=>x.id===cid))
    .filter(c=>c&&!seen.has(c.id)&&!patriarchs.has(c.id)&&!spouseOf.has(c.id));
  if(avail.length===0)return[p];
  if(avail.length===1)return[p,avail[0]];
  return[avail[0],p,avail[1]]; // sandwich: wife_left — husband — wife_right
}

// ══════════════════════════════════════════════
//  OVERLAP RESOLUTION
// ══════════════════════════════════════════════
function resolveOverlaps(people,pos){
  const bands={};
  people.forEach(p=>{
    if(!pos[p.id])return;
    const yk=Math.round(pos[p.id].y/10)*10;
    (bands[yk]=bands[yk]||[]).push(p);
  });
  Object.values(bands).forEach(band=>{
    const nodes=band.sort((a,b)=>pos[a.id].x-pos[b.id].x);
    for(let i=1;i<nodes.length;i++){
      const gap=pos[nodes[i].id].x-pos[nodes[i-1].id].x;
      if(gap<H_GAP*0.78){
        const shift=H_GAP*0.78-gap;
        for(let j=i;j<nodes.length;j++)
          pos[nodes[j].id]={...pos[nodes[j].id],x:pos[nodes[j].id].x+shift};
      }
    }
  });
}

// ══════════════════════════════════════════════
//  LAYOUT
//  Each family block (unique sorted parentIds) is
//  anchored at the midpoint of its parents.
//  Siblings with different parentIds never share a T.
// ══════════════════════════════════════════════
function computeLayout(data){
  if(!data.length)return{};
  const genOf=buildGenMap(data);
  const{patriarchs,spouseOf,yExtra}=detectFan(data,genOf);
  const baseY=id=>genOf[id]*V_GAP+(yExtra[id]||0);

  const byGen={};
  data.forEach(p=>{(byGen[genOf[p.id]]=byGen[genOf[p.id]]||[]).push(p);});
  const maxGen=Math.max(...Object.keys(byGen).map(Number));
  const pos={};

  for(let g=0;g<=maxGen;g++){
    if(!byGen[g])continue;
    const people=byGen[g];

    if(g===0){
      // Root generation: simple ordered placement
      const ordered=[],seen=new Set();
      [...people].sort((a,b)=>a.id-b.id).forEach(p=>{
        if(seen.has(p.id))return;
        coupleOrder(p,people,seen,patriarchs,spouseOf).forEach(m=>{seen.add(m.id);ordered.push(m);});
      });
      people.forEach(p=>{if(!seen.has(p.id)){seen.add(p.id);ordered.push(p);}});
      const w=(ordered.length-1)*H_GAP;
      ordered.forEach((p,i)=>{pos[p.id]={x:i*H_GAP-w/2,y:baseY(p.id)};});

    }else{
      // Group into family blocks by strict parentIds key
      const famMap=new Map();
      const noParent=[];

      [...people].sort((a,b)=>
        [...a.parentIds].sort((x,y)=>x-y).join("_")
          .localeCompare([...b.parentIds].sort((x,y)=>x-y).join("_")))
      .forEach(p=>{
        if(!p.parentIds.length){noParent.push(p);return;}
        const key=[...p.parentIds].sort((a,b)=>a-b).join("-");
        if(!famMap.has(key))famMap.set(key,{pids:[...p.parentIds].sort((a,b)=>a-b),members:[],anchorX:0});
        famMap.get(key).members.push(p);
      });

      // Anchor each family at the midpoint of its parents
      famMap.forEach(fam=>{
        const pp=fam.pids.map(pid=>pos[pid]).filter(Boolean);
        fam.anchorX=pp.length?pp.reduce((s,p)=>s+p.x,0)/pp.length:0;
      });

      // Sort families left→right by anchor, then place
      [...famMap.values()].sort((a,b)=>a.anchorX-b.anchorX).forEach(fam=>{
        const ordered=[],seen=new Set();
        fam.members.forEach(p=>{
          if(seen.has(p.id))return;
          coupleOrder(p,fam.members,seen,patriarchs,spouseOf).forEach(m=>{seen.add(m.id);ordered.push(m);});
        });
        fam.members.forEach(p=>{if(!seen.has(p.id)){seen.add(p.id);ordered.push(p);}});
        const startX=fam.anchorX-(ordered.length-1)*H_GAP/2;
        ordered.forEach((p,i)=>{pos[p.id]={x:startX+i*H_GAP,y:baseY(p.id)};});
      });

      noParent.forEach(p=>{if(!pos[p.id])pos[p.id]={x:0,y:baseY(p.id)};});
      resolveOverlaps(people,pos);
    }
  }

  // Gentle re-centering passes (parents nudge toward their children)
  for(let iter=0;iter<4;iter++){
    for(let g=maxGen-1;g>=0;g--){
      if(!byGen[g])continue;
      const famKids=new Map();
      data.forEach(c=>{
        if(!c.parentIds.length||!pos[c.id])return;
        const key=[...c.parentIds].sort((a,b)=>a-b).join("-");
        if(!famKids.has(key))famKids.set(key,{pids:[...c.parentIds].sort((a,b)=>a-b),kids:[]});
        famKids.get(key).kids.push(c);
      });
      famKids.forEach(({pids,kids})=>{
        const thisGen=pids.filter(pid=>{const p=data.find(x=>x.id===pid);return p&&genOf[p.id]===g&&pos[pid];});
        if(!thisGen.length)return;
        const kAvg=kids.reduce((s,c)=>s+pos[c.id].x,0)/kids.length;
        const pMid=thisGen.reduce((s,pid)=>s+pos[pid].x,0)/thisGen.length;
        const shift=(kAvg-pMid)*0.25;
        thisGen.forEach(pid=>{pos[pid]={...pos[pid],x:pos[pid].x+shift};});
      });
      resolveOverlaps(byGen[g],pos);
    }
  }
  return pos;
}

// ══════════════════════════════════════════════
//  BUILD LINKS
//  One line per unique couple, one T per unique parentIds family
// ══════════════════════════════════════════════
function buildLinks(data,pos){
  const genOf=buildGenMap(data);
  const{patriarchs}=detectFan(data,genOf);
  const links=[],seenCouple=new Set();

  // Couple lines
  data.forEach(p=>{
    p.conjointIds.forEach(cid=>{
      const key=`${Math.min(p.id,cid)}-${Math.max(p.id,cid)}`;
      if(seenCouple.has(key))return;seenCouple.add(key);
      const a=pos[p.id],b=pos[cid];
      if(!a||!b)return;
      const isFan=patriarchs.has(p.id)||patriarchs.has(cid);
      if(isFan){
        const patId=patriarchs.has(p.id)?p.id:cid;
        const wifId=patId===p.id?cid:p.id;
        const pa=pos[patId],wa=pos[wifId];
        if(!pa||!wa)return;
        links.push({type:"fan",id:`fan-${key}`,
          x1:pa.x,y1:pa.y+R,x2:wa.x,y2:wa.y-R,
          midX:(pa.x+wa.x)/2,midY:(pa.y+R+wa.y-R)/2,
          p1id:patId,p2id:wifId,wifId});
      }else{
        const dx=b.x-a.x,dy=b.y-a.y,len=Math.sqrt(dx*dx+dy*dy)||1;
        links.push({type:"couple",id:`cp-${key}`,
          x1:a.x+dx/len*R,y1:a.y+dy/len*R,
          x2:b.x-dx/len*R,y2:b.y-dy/len*R,
          midX:(a.x+b.x)/2,midY:(a.y+b.y)/2,
          p1id:p.id,p2id:cid});
      }
    });
  });

  // T-shapes — strictly one per unique parentIds key
  const famMap=new Map();
  data.forEach(c=>{
    if(!c.parentIds.length)return;
    const key=[...c.parentIds].sort((a,b)=>a-b).join("-");
    if(!famMap.has(key))famMap.set(key,{pids:[...c.parentIds].sort((a,b)=>a-b),children:[]});
    famMap.get(key).children.push(c);
  });

  famMap.forEach(({pids,children})=>{
    const vk=children.filter(c=>pos[c.id]);
    if(!vk.length)return;

    const patPid=pids.find(pid=>patriarchs.has(pid));
    const wifPid=patPid!=null?pids.find(pid=>pid!==patPid):null;

    let stemX,stemTopY;
    if(patPid!=null&&wifPid!=null&&pos[wifPid]){
      // Fan: T from wife's bottom
      stemX=pos[wifPid].x;
      stemTopY=pos[wifPid].y+R;
    }else if(pids.length===2&&pos[pids[0]]&&pos[pids[1]]){
      // Normal couple: T from midpoint
      const p1=pos[pids[0]],p2=pos[pids[1]];
      stemX=(p1.x+p2.x)/2;
      stemTopY=Math.max(p1.y,p2.y)+R;
    }else{
      if(!pos[pids[0]])return;
      stemX=pos[pids[0]].x;
      stemTopY=pos[pids[0]].y+R;
    }

    const kidY=pos[vk[0].id].y;
    const midY=stemTopY+(kidY-R-stemTopY)*0.5;
    const famId=pids.join("-");

    links.push({type:"stem",id:`stem-${famId}`,x:stemX,y1:stemTopY,y2:midY});
    const xs=vk.map(c=>pos[c.id].x);
    links.push({type:"hbar",id:`hbar-${famId}`,
      x1:vk.length>1?Math.min(...xs):stemX,
      x2:vk.length>1?Math.max(...xs):stemX,y:midY});
    vk.forEach(c=>links.push({type:"branch",id:`br-${c.id}`,x:pos[c.id].x,y1:midY,y2:pos[c.id].y-R}));
  });
  return links;
}

// ══════════════════════════════════════════════
//  SPINNER
// ══════════════════════════════════════════════
function Spinner({text="Chargement..."}){
  return(
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-[#06141B] to-[#11212D] gap-4">
      <div className="w-9 h-9 border-[3px] border-[#253745] border-t-[#9BA8AB] rounded-full animate-spin"/>
      <span className="text-[#4A5C6A] text-sm font-serif">{text}</span>
    </div>
  );
}

// ══════════════════════════════════════════════
//  MEMBER FORM
// ══════════════════════════════════════════════
function MemberForm({config,data,onSave,onClose}){
  const{type,targetId}=config;
  const src=type==="edit"?data.find(p=>p.id===targetId):null;
  const[f,setF]=useState({prenom:src?.prenom||"",nom:src?.nom||"",naissance:src?.naissance||"",deces:src?.deces||"",bio:src?.bio||"",genre:src?.genre||"M",photo:src?.photo||null});
  const[saving,setSaving]=useState(false);
  const[generating,setGenerating]=useState(false);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const canSave=f.prenom.trim()&&f.nom.trim()&&f.naissance;
  const fileRef=useRef(null);

  const handlePhoto=e=>{
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();r.onload=ev=>set("photo",ev.target?.result);r.readAsDataURL(file);
  };
  const handleGenerateImage=async()=>{
    if(!f.prenom||!f.nom)return alert("Veuillez entrer un prénom et un nom.");
    setGenerating(true);
    const prompt=`${f.genre==="M"?"A man":"A woman"} named ${f.prenom} ${f.nom}, realistic portrait, vintage style, neutral background.`;
    const img=await generateMemberImage(prompt);
    if(img)set("photo",img);
    setGenerating(false);
  };
  const handleSave=async()=>{
    if(!canSave)return;setSaving(true);
    await onSave({...f,deces:f.deces||null});setSaving(false);
  };

  const titles={"add-conjoint":"💑 Ajouter un(e) conjoint(e)","add-child":"👶 Ajouter un enfant","add-parent":"👴 Ajouter un parent","edit":"✏️ Modifier"};

  return(
    <div onClick={onClose} className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} onClick={e=>e.stopPropagation()}
        className="bg-gradient-to-br from-[#06141B] to-[#11212D] border border-[#253745] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-[#CCD0CF] mb-6" style={{fontFamily:"'Playfair Display',serif"}}>{titles[type]}</h2>

        {/* Photo */}
        <div className="flex items-center gap-4 mb-6">
          <div onClick={()=>fileRef.current?.click()}
            className={`w-16 h-16 ${f.genre==="M"?"rounded-lg":"rounded-full"} bg-[#11212D] border-2 border-dashed border-[#4A5C6A] flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0 group relative`}>
            {f.photo?<img src={f.photo} alt="" className="w-full h-full object-cover"/>:<Camera className="text-[#4A5C6A] group-hover:text-[#9BA8AB]" size={24}/>}
            {generating&&<div className="absolute inset-0 bg-black/50 flex items-center justify-center"><RefreshCw className="animate-spin text-white" size={20}/></div>}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>Photo de profil</span>
            <div className="flex gap-2">
              <button onClick={()=>fileRef.current?.click()} className="px-3 py-1 bg-[#253745] border border-[#4A5C6A] rounded-md text-[10px] text-[#9BA8AB] hover:text-white transition-colors">Importer</button>
              <button onClick={handleGenerateImage} disabled={generating} className="px-3 py-1 bg-[#4A8FBF]/20 border border-[#4A8FBF]/40 rounded-md text-[10px] text-[#4A8FBF] hover:bg-[#4A8FBF]/30 transition-colors flex items-center gap-1">
                <Bot size={12}/> IA Générer
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden"/>
        </div>

        {/* Names */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[["Prénom *","prenom"],["Nom *","nom"]].map(([lb,k])=>(
            <div key={k} className="flex flex-col gap-1">
              <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">{lb}</label>
              <input value={f[k]} onChange={e=>set(k,e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none"/>
            </div>
          ))}
        </div>

        {/* Genre */}
        <div className="mb-4">
          <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans mb-1 block">Genre *</label>
          <div className="flex gap-2">
            {[["M","🟦 Homme","#4A8FBF"],["F","🔴 Femme","#BF4A6A"]].map(([v,lb,col])=>(
              <button key={v} onClick={()=>set("genre",v)}
                className="flex-1 py-2 rounded-lg text-xs transition-all border"
                style={{borderColor:f.genre===v?col:"#253745",color:f.genre===v?col:"#4A5C6A",backgroundColor:f.genre===v?`${col}18`:"#11212D"}}>
                {lb}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">Naissance *</label>
            <input type="date" value={f.naissance} onChange={e=>set("naissance",e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none"/>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans">Décès</label>
            <input type="date" value={f.deces} onChange={e=>set("deces",e.target.value)} className="bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none"/>
          </div>
        </div>

        {/* Bio */}
        <div className="mb-6">
          <label className="text-[10px] text-[#4A5C6A] uppercase tracking-wider font-sans mb-1 block">Biographie</label>
          <textarea value={f.bio} onChange={e=>set("bio",e.target.value)} placeholder="Quelques mots..."
            className="w-full bg-[#11212D] border border-[#253745] rounded-lg p-2 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none min-h-[80px] resize-none"/>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[#11212D] border border-[#253745] text-[#4A5C6A] text-sm hover:text-white transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={!canSave||saving}
            className={`flex-[2] py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${canSave?"bg-[#4A8FBF]/20 border border-[#4A8FBF] text-[#CCD0CF] hover:bg-[#4A8FBF]/30":"bg-[#11212D] border border-[#253745] text-[#4A5C6A] cursor-not-allowed"}`}
            style={{fontFamily:"'Playfair Display',serif"}}>
            {saving?<RefreshCw className="animate-spin" size={16}/>:<Save size={16}/>}
            {saving?"Enregistrement...":"Enregistrer"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  NODE
// ══════════════════════════════════════════════
function PersonNode({person,p,isSelected,isDragging,onClick}){
  const fem=isFem(person),col=fem?C.female:C.male,colL=fem?C.femaleL:C.maleL;
  const dead=!!person.deces,{x,y}=p;
  return(
    <g transform={`translate(${x},${y})`} onClick={onClick} className="cursor-pointer" style={{opacity:isDragging?0.65:1}}>
      {isSelected&&(fem?<circle r={R+9} fill={`${col}15`} stroke={`${col}35`} strokeWidth={1}/>:<rect x={-R-9} y={-R-9} width={NW+18} height={NH+18} rx={7} fill={`${col}15`} stroke={`${col}35`} strokeWidth={1}/>)}
      {fem?<circle r={R+1} cy={3} fill="rgba(0,0,0,0.28)"/>:<rect x={-R+1} y={-R+3} width={NW} height={NH} rx={5} fill="rgba(0,0,0,0.28)"/>}
      {fem?<circle r={R} fill={dead?C.c2:colL} stroke={isSelected?col:`${col}80`} strokeWidth={isSelected?2.5:1.5} className="transition-all duration-200"/>
         :<rect x={-R} y={-R} width={NW} height={NH} rx={5} fill={dead?C.c2:colL} stroke={isSelected?col:`${col}80`} strokeWidth={isSelected?2.5:1.5} className="transition-all duration-200"/>}
      {person.photo&&(<><clipPath id={`cl-${person.id}`}>{fem?<circle r={R-2}/>:<rect x={-R+2} y={-R+2} width={NW-4} height={NH-4} rx={4}/>}</clipPath><image href={person.photo} x={-R+2} y={-R+2} width={NW-4} height={NH-4} clipPath={`url(#cl-${person.id})`} preserveAspectRatio="xMidYMid slice" style={{opacity:dead?0.45:1}}/></>)}
      {!person.photo&&<text textAnchor="middle" dominantBaseline="central" fill={dead?C.c4:col} fontSize="13" fontWeight="700" style={{fontFamily:"'Playfair Display',serif",userSelect:"none"}}>{initials(person)}</text>}
      {dead&&<text x={R-6} y={-R+9} fontSize="9" fill={C.c4} style={{userSelect:"none"}}>✝</text>}
      <text y={R+14} textAnchor="middle" fill={isSelected?C.c6:C.c4} fontSize="9" style={{fontFamily:"'Crimson Text',serif",userSelect:"none"}}>{person.prenom}</text>
    </g>
  );
}

// ══════════════════════════════════════════════
//  PANEL
// ══════════════════════════════════════════════
function PersonPanel({person,data,isAdmin,onClose,onAddConjoint,onAddParent,onEdit,onDelete}){
  const fem=isFem(person),col=fem?C.female:C.male;
  const dead=!!person.deces,age=calcAge(person.naissance,person.deces);
  const conjoints=person.conjointIds.map(id=>data.find(p=>p.id===id)).filter(Boolean);
  const parents=person.parentIds.map(id=>data.find(p=>p.id===id)).filter(Boolean);
  const children=data.filter(p=>p.parentIds.includes(person.id));

  const handleSpeak=()=>{
    const text=`${person.prenom} ${person.nom}. ${person.bio||""}`;
    generateSpeech(text);
  };

  return(
    <motion.div initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}}
      className="fixed top-0 right-0 w-72 h-screen bg-gradient-to-b from-[#06141B] to-[#11212D] border-l-2 border-[#253745] z-[100] flex flex-col shadow-2xl">
      <div className="p-4 border-b border-[#253745] flex-shrink-0">
        <button onClick={onClose} className="float-right text-[#4A5C6A] hover:text-white transition-colors"><X size={20}/></button>
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 ${fem?"rounded-full":"rounded-lg"} bg-[#11212D] border-2 flex items-center justify-center overflow-hidden flex-shrink-0`} style={{borderColor:col}}>
            {person.photo?<img src={person.photo} className={`w-full h-full object-cover${dead?" opacity-50":""}`}/>:<span className="text-sm font-bold" style={{color:col,fontFamily:"'Playfair Display',serif"}}>{initials(person)}</span>}
          </div>
          <div>
            <div className="font-bold text-[#CCD0CF] leading-tight flex items-center gap-2" style={{fontFamily:"'Playfair Display',serif"}}>
              {person.prenom}
              <button onClick={handleSpeak} className="text-[#4A5C6A] hover:text-[#4A8FBF] transition-colors"><Volume2 size={14}/></button>
            </div>
            <div className="text-xs" style={{color:col,fontFamily:"'Crimson Text',serif"}}>{person.nom}</div>
            {dead&&<div className="text-[9px] text-[#4A5C6A] mt-1">✝ Décédé(e) · {age} ans</div>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[["🎂","Naissance",fmtDate(person.naissance)],[dead?"⚰️":"⏳",dead?"Décès":"Âge",dead?fmtDate(person.deces):`${age} ans`]].map(([ic,lb,vl])=>(
            <div key={lb} className="bg-[#11212D] border border-[#253745] rounded-xl p-2.5">
              <div className="text-sm mb-1">{ic}</div>
              <div className="text-[8px] text-[#4A5C6A] uppercase tracking-widest font-sans mb-0.5">{lb}</div>
              <div className="text-[11px] text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>{vl}</div>
            </div>
          ))}
        </div>

        {person.bio&&<div>
          <label className="text-[9px] text-[#4A5C6A] uppercase tracking-widest font-sans mb-1.5 block">Biographie</label>
          <p className="text-xs text-[#9BA8AB] leading-relaxed" style={{fontFamily:"'Crimson Text',serif"}}>{person.bio}</p>
        </div>}

        {[[`💑 Conjoint(e)${conjoints.length>1?"s":""}`,conjoints],["👨‍👩‍👧 Parents",parents],[`👶 Enfants (${children.length})`,children]].filter(([,m])=>m.length>0).map(([lb,members])=>(
          <div key={lb}>
            <label className="text-[9px] text-[#4A5C6A] uppercase tracking-widest font-sans mb-2 block">{lb}</label>
            <div className="flex flex-wrap gap-1.5">
              {members.map(m=>(<span key={m.id} className={`px-2.5 py-1 rounded-full text-[10px] border ${isFem(m)?"bg-[#BF4A6A]/10 border-[#BF4A6A]/30 text-[#BF4A6A]":"bg-[#4A8FBF]/10 border-[#4A8FBF]/30 text-[#4A8FBF]"}`} style={{fontFamily:"'Crimson Text',serif"}}>{m.prenom} {m.nom}</span>))}
            </div>
          </div>
        ))}

        {isAdmin&&<div className="pt-4 border-t border-[#253745] space-y-2">
          <label className="text-[9px] text-[#4A5C6A] uppercase tracking-widest font-sans block">⚙️ Administration</label>
          <div className="bg-[#82c582]/10 border border-[#82c582]/30 rounded-lg p-2.5 text-[10px] text-[#82c582]" style={{fontFamily:"'Crimson Text',serif"}}>
            💡 Cliquez <b>+</b> sur un lien de couple pour ajouter un enfant à cette famille précise
          </div>
          <AdminBtn onClick={onAddConjoint} icon={<UserPlus size={14}/>} text="Ajouter conjoint(e)" color="#9BA8AB"/>
          <AdminBtn onClick={onAddParent}   icon={<Users size={14}/>}    text="Ajouter parent"       color="#a89bd4"/>
          <AdminBtn onClick={onEdit}        icon={<Edit2 size={14}/>}    text="Modifier"             color="#4A8FBF"/>
          <AdminBtn onClick={onDelete}      icon={<Trash2 size={14}/>}   text="Supprimer"            color="#BF4A4A" danger/>
        </div>}
      </div>
    </motion.div>
  );
}

function AdminBtn({onClick,icon,text,color,danger}){
  return(
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all border ${danger?"bg-red-500/5 border-red-500/20 text-red-500 hover:bg-red-500/10":"bg-[#11212D] border-[#253745] hover:bg-[#253745]"}`}
      style={{color:!danger?color:undefined,fontFamily:"'Crimson Text',serif"}}>
      {icon} {text}
    </button>
  );
}

// ══════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════
function LoginScreen({onLogin}){
  const[pwd,setPwd]=useState(""), [err,setErr]=useState(false), [shake,setShake]=useState(false);
  const go=()=>{
    if(pwd===FAMILY_PWD){onLogin("family");return;}
    if(pwd===ADMIN_PWD){onLogin("admin");return;}
    setErr(true);setShake(true);setTimeout(()=>setShake(false),500);
  };
  return(
    <div className="min-h-screen bg-gradient-to-br from-[#06141B] via-[#11212D] to-[#253745] flex items-center justify-center p-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
      `}</style>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}
        className="bg-gradient-to-br from-[#06141B]/90 to-[#11212D]/90 backdrop-blur-xl border border-[#253745] rounded-3xl p-10 w-full max-w-xs text-center shadow-2xl"
        style={{animation:shake?"shake 0.45s ease-out":undefined}}>
        <div className="text-6xl mb-4" style={{animation:"float 4s ease-in-out infinite"}}>🌳</div>
        <h1 className="font-bold text-[#CCD0CF] text-2xl mb-1" style={{fontFamily:"'Playfair Display',serif"}}>Arbre Familial</h1>
        <p className="text-[#4A5C6A] text-sm italic mb-8" style={{fontFamily:"'Crimson Text',serif"}}>Espace privé de la famille</p>
        <div className="space-y-4">
          <input type="password" value={pwd} placeholder="Mot de passe"
            onChange={e=>{setPwd(e.target.value);setErr(false);}} onKeyDown={e=>e.key==="Enter"&&go()}
            className="w-full bg-[#11212D] border border-[#253745] rounded-xl px-4 py-3 text-sm text-[#CCD0CF] focus:border-[#4A8FBF] outline-none transition-all placeholder:text-[#4A5C6A]"/>
          {err&&<p className="text-red-500 text-[10px] font-sans">Mot de passe incorrect</p>}
          <button onClick={go} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#253745] to-[#4A5C6A] border border-[#4A5C6A] text-[#CCD0CF] font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all" style={{fontFamily:"'Playfair Display',serif"}}>Entrer →</button>
        </div>
        <div className="mt-8 flex justify-center gap-6">
          {[["Homme",false],["Femme",true]].map(([lb,f])=>(
            <div key={lb} className="flex items-center gap-2">
              <div className={`w-3 h-3 ${f?"rounded-full":"rounded-sm"} border`} style={{backgroundColor:`${f?C.female:C.male}30`,borderColor:f?C.female:C.male}}/>
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
export default function App(){
  const[mode,setMode]=useState(null);
  const[data,setData]=useState([]);
  const[loading,setLoading]=useState(false);
  const[selected,setSelected]=useState(null);
  const[form,setForm]=useState(null);
  const[tf,setTf]=useState({x:0,y:0,scale:1});
  const[panDrag,setPanDrag]=useState(null);
  const[svgW,setSvgW]=useState(window.innerWidth);
  const[offsets,setOffsets]=useState({});
  const subtreeDragRef=useRef(null);
  const svgRef=useRef(null);

  const basePos=computeLayout(data);
  const finalPos={};
  Object.keys(basePos).forEach(id=>{
    const nid=Number(id),off=offsets[nid]||{dx:0,dy:0};
    finalPos[nid]={x:basePos[nid].x+off.dx,y:basePos[nid].y+off.dy};
  });
  const links=buildLinks(data,finalPos);
  const selPerson=data.find(p=>p.id===selected);
  const isAdmin=mode==="admin";
  const panelOpen=!!selPerson;

  useEffect(()=>{
    if(!mode)return;
    setLoading(true);
    apiGet().then(d=>{setData(d);setLoading(false);}).catch(()=>setLoading(false));
  },[mode]);

  useEffect(()=>{
    const upd=()=>setSvgW(window.innerWidth);
    window.addEventListener("resize",upd);
    return()=>window.removeEventListener("resize",upd);
  },[]);

  const onWheel=useCallback(e=>{
    e.preventDefault();
    setTf(t=>({...t,scale:Math.min(3,Math.max(0.15,t.scale*(e.deltaY<0?1.1:0.91)))}));
  },[]);
  useEffect(()=>{
    const el=svgRef.current;
    if(el)el.addEventListener("wheel",onWheel,{passive:false});
    return()=>el?.removeEventListener("wheel",onWheel);
  },[onWheel]);

  const toSvg=useCallback((cx,cy)=>{
    const ox=(svgW-(panelOpen?280:0))/2;
    return{sx:(cx-ox-tf.x)/tf.scale,sy:(cy-90-tf.y)/tf.scale};
  },[svgW,panelOpen,tf]);

  const onMD=useCallback(e=>{
    if(isAdmin&&e.target.dataset.fanwife){
      const wifId=Number(e.target.dataset.fanwife);
      const subtree=subtreeOf(wifId,data);
      const{sx,sy}=toSvg(e.clientX,e.clientY);
      subtreeDragRef.current={wifId,subtree,sx0:sx,sy0:sy,moved:false,baseOff:{...offsets}};
      e.stopPropagation();return;
    }
    if(e.target.closest("[data-node]"))return;
    setPanDrag({sx:e.clientX-tf.x,sy:e.clientY-tf.y});
  },[isAdmin,data,offsets,toSvg,tf]);

  const onMM=useCallback(e=>{
    if(subtreeDragRef.current){
      const{sx,sy}=toSvg(e.clientX,e.clientY);
      const dx=sx-subtreeDragRef.current.sx0,dy=sy-subtreeDragRef.current.sy0;
      if(Math.abs(dx)>2||Math.abs(dy)>2)subtreeDragRef.current.moved=true;
      const next={...subtreeDragRef.current.baseOff};
      subtreeDragRef.current.subtree.forEach(id=>{
        const b=subtreeDragRef.current.baseOff[id]||{dx:0,dy:0};
        next[id]={dx:b.dx+dx,dy:b.dy+dy};
      });
      setOffsets(next);return;
    }
    if(panDrag)setTf(t=>({...t,x:e.clientX-panDrag.sx,y:e.clientY-panDrag.sy}));
  },[panDrag,toSvg]);

  const onMU=useCallback(()=>{subtreeDragRef.current=null;setPanDrag(null);},[]);

  const handleSave=async fd=>{
    if(!form)return;
    const{type,targetId,parentIds}=form;
    if(type==="edit"){
      const u={...data.find(p=>p.id===targetId),...fd};
      await apiUpdate(u);setData(d=>d.map(p=>p.id===targetId?u:p));
    }else if(type==="add-conjoint"){
      const nid=nextId(data);
      const newM={id:nid,...fd,parentIds:[],conjointIds:[targetId]};
      await apiAdd(newM);
      const t=data.find(p=>p.id===targetId);
      const ut={...t,conjointIds:[...t.conjointIds,nid]};
      await apiUpdate(ut);
      setData(d=>[...d.map(p=>p.id===targetId?ut:p),newM]);
    }else if(type==="add-child"){
      const nid=nextId(data);
      const newM={id:nid,...fd,parentIds,conjointIds:[]};
      await apiAdd(newM);setData(d=>[...d,newM]);
    }else if(type==="add-parent"){
      const nid=nextId(data);
      const newM={id:nid,...fd,parentIds:[],conjointIds:[]};
      await apiAdd(newM);
      const t=data.find(p=>p.id===targetId);
      const ut={...t,parentIds:[...t.parentIds,nid]};
      await apiUpdate(ut);
      setData(d=>[...d.map(p=>p.id===targetId?ut:p),newM]);
    }
    setForm(null);
  };

  const handleDelete=async id=>{
    if(!window.confirm("Supprimer ce membre ?"))return;
    await apiDelete(id);
    setData(d=>d.filter(p=>p.id!==id).map(p=>({
      ...p,
      conjointIds:p.conjointIds.filter(c=>c!==id),
      parentIds:p.parentIds.filter(c=>c!==id),
    })));
    setSelected(null);
  };

  const handleLinkClick=(e,link)=>{
    if(!isAdmin)return;
    if(subtreeDragRef.current?.moved)return;
    e.stopPropagation();
    setForm({type:"add-child",targetId:null,parentIds:[link.p1id,link.p2id]});
  };

  if(!mode)return<LoginScreen onLogin={setMode}/>;
  if(loading)return<Spinner text="Chargement de l'arbre..."/>;

  const cx_val=(svgW-(panelOpen?280:0))/2;
  const draggingSubtree=subtreeDragRef.current?.subtree;

  return(
    <div className="h-screen bg-gradient-to-br from-[#06141B] via-[#11212D] to-[#253745] overflow-hidden flex flex-col relative">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital@0;1&display=swap');`}</style>

      {/* Header */}
      <div className="h-14 bg-[#06141B]/90 backdrop-blur-xl border-b border-[#253745] flex items-center justify-between px-6 flex-shrink-0 z-50">
        <div className="flex items-center gap-4">
          <span className="text-xl">🌳</span>
          <h1 className="font-bold text-[#CCD0CF] text-base" style={{fontFamily:"'Playfair Display',serif"}}>Arbre Familial</h1>
          <span className="text-[10px] text-[#4A5C6A] uppercase tracking-widest font-sans">{data.length} membres</span>
          {isAdmin&&<span className="bg-[#82c582]/10 border border-[#82c582]/30 text-[#82c582] text-[8px] px-2 py-0.5 rounded-full font-sans tracking-widest uppercase">Admin</span>}
        </div>
        <div className="flex gap-2 items-center">
          {isAdmin&&Object.keys(offsets).length>0&&(
            <button onClick={()=>setOffsets({})} className="h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-sans uppercase tracking-widest hover:bg-red-500/20 transition-colors">Positions</button>
          )}
          <div className="flex bg-[#11212D] border border-[#253745] rounded-lg p-0.5">
            <button onClick={()=>setTf(t=>({...t,scale:Math.max(0.15,t.scale-0.15)}))} className="w-8 h-8 flex items-center justify-center text-[#9BA8AB] hover:text-white transition-colors"><ZoomOut size={16}/></button>
            <button onClick={()=>setTf(t=>({...t,scale:Math.min(3,t.scale+0.15)}))} className="w-8 h-8 flex items-center justify-center text-[#9BA8AB] hover:text-white transition-colors"><ZoomIn size={16}/></button>
          </div>
          <button onClick={()=>setTf({x:0,y:0,scale:1})} className="h-8 px-3 rounded-lg bg-[#11212D] border border-[#253745] text-[#9BA8AB] text-[10px] font-sans uppercase tracking-widest hover:text-white transition-colors">Centrer</button>
          <button onClick={()=>{setMode(null);setSelected(null);setData([]);setOffsets({});}} className="h-8 px-3 rounded-lg bg-[#11212D] border border-[#253745] text-[#9BA8AB] text-[10px] font-sans uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"><LogOut size={12}/> Quitter</button>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg ref={svgRef}
        className={`flex-1 ${subtreeDragRef.current||panDrag?"cursor-grabbing":"cursor-grab"}`}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
        <g transform={`translate(${cx_val+tf.x},${90+tf.y}) scale(${tf.scale})`}>

          {links.map(l=>{
            if(l.type==="fan"){
              const active=subtreeDragRef.current?.wifId===l.wifId;
              return(<g key={l.id}>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="transparent" strokeWidth="22" data-fanwife={l.wifId} className={isAdmin?"cursor-grab":""}/>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={active?C.c6:C.link} strokeWidth={active?2.4:1.6} opacity={active?0.95:0.5} className="pointer-events-none"/>
                {isAdmin&&!active&&<g onClick={e=>handleLinkClick(e,l)} className="cursor-pointer">
                  <circle cx={l.midX} cy={l.midY} r={11} fill={C.c2} stroke="#82c582" strokeWidth="1.3"/>
                  <text x={l.midX} y={l.midY} textAnchor="middle" dominantBaseline="central" fill="#82c582" fontSize="16" fontWeight="bold" className="select-none pointer-events-none">+</text>
                </g>}
                {isAdmin&&<circle cx={l.x2} cy={l.y2} r={7} fill={active?`${C.c6}22`:C.c2} stroke={active?C.c6:C.c4} strokeWidth="1" data-fanwife={l.wifId} className="cursor-grab"/>}
              </g>);
            }
            if(l.type==="couple"){
              return(<g key={l.id}>
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={C.link} strokeWidth="1.8" strokeDasharray="5,3" opacity="0.55"/>
                {isAdmin&&<g onClick={e=>handleLinkClick(e,l)} className="cursor-pointer">
                  <circle cx={l.midX} cy={l.midY} r={11} fill={C.c2} stroke="#82c582" strokeWidth="1.3"/>
                  <text x={l.midX} y={l.midY} textAnchor="middle" dominantBaseline="central" fill="#82c582" fontSize="16" fontWeight="bold" className="select-none pointer-events-none">+</text>
                </g>}
              </g>);
            }
            if(l.type==="stem") return<line key={l.id} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={C.link} strokeWidth="1.6" opacity="0.4"/>;
            if(l.type==="hbar") return<line key={l.id} x1={l.x1} y1={l.y} x2={l.x2} y2={l.y} stroke={C.link} strokeWidth="1.6" opacity="0.4"/>;
            if(l.type==="branch") return<line key={l.id} x1={l.x} y1={l.y1} x2={l.x} y2={l.y2} stroke={C.link} strokeWidth="1.6" opacity="0.4"/>;
            return null;
          })}

          {data.map(person=>{
            const p=finalPos[person.id];if(!p)return null;
            return(<g key={person.id} data-node="1">
              <PersonNode person={person} p={p} isSelected={selected===person.id}
                isDragging={draggingSubtree?.has(person.id)||false}
                onClick={()=>{if(subtreeDragRef.current?.moved)return;setSelected(s=>s===person.id?null:person.id);}}/>
            </g>);
          })}
        </g>
      </svg>

      {/* Side panel */}
      <AnimatePresence>
        {selPerson&&<PersonPanel person={selPerson} data={data} isAdmin={isAdmin}
          onClose={()=>setSelected(null)}
          onAddConjoint={()=>setForm({type:"add-conjoint",targetId:selPerson.id,parentIds:[]})}
          onAddParent={()=>setForm({type:"add-parent",targetId:selPerson.id,parentIds:[]})}
          onEdit={()=>setForm({type:"edit",targetId:selPerson.id,parentIds:[]})}
          onDelete={()=>handleDelete(selPerson.id)}/>}
      </AnimatePresence>

      {form&&<MemberForm config={form} data={data} onSave={handleSave} onClose={()=>setForm(null)}/>}

      {/* Legend */}
      <div className="fixed bottom-6 left-6 bg-[#06141B]/90 backdrop-blur-xl border border-[#253745] rounded-2xl p-4 z-50 shadow-2xl">
        <div className="text-[8px] text-[#4A5C6A] uppercase tracking-[0.2em] font-sans mb-4">Légende</div>
        <div className="space-y-3">
          {[["Homme",false],["Femme",true]].map(([lb,f])=>(
            <div key={lb} className="flex items-center gap-3">
              <div className={`w-3 h-3 ${f?"rounded-full":"rounded-sm"} border`} style={{backgroundColor:`${f?C.female:C.male}25`,borderColor:f?C.female:C.male}}/>
              <span className="text-[10px] text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>{lb}</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <div className="w-4 h-0 border-t border-dashed border-[#9BA8AB]/40"/>
            <span className="text-[10px] text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>1-2 conjoints</span>
          </div>
          <div className="flex items-center gap-3">
            <svg width="16" height="12"><line x1="8" y1="0" x2="0" y2="12" stroke={C.link} strokeWidth="1.5" opacity="0.5"/><line x1="8" y1="0" x2="16" y2="12" stroke={C.link} strokeWidth="1.5" opacity="0.5"/></svg>
            <span className="text-[10px] text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>3+ conjoints (fan)</span>
          </div>
          {isAdmin&&(<>
            <div className="flex items-center gap-3 pt-2 border-t border-[#253745]">
              <div className="w-4 h-4 rounded-full bg-[#11212D] border border-[#82c582] flex items-center justify-center text-[9px] text-[#82c582] font-bold">+</div>
              <span className="text-[10px] text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>→ ajouter enfant</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full bg-[#11212D] border border-[#4A5C6A]"/>
              <span className="text-[10px] text-[#9BA8AB]" style={{fontFamily:"'Crimson Text',serif"}}>→ glisser lignée fan</span>
            </div>
          </>)}
        </div>
      </div>

      {/* ChatBot */}
      <ChatBot familyData={data}/>
    </div>
  );
}