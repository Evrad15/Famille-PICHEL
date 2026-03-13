import { useState, useRef, useEffect, useCallback } from "react";
import SEED from './data/famille.json';

// ══════════════════════════════════════════════
//  CONFIG & PALETTE
// ══════════════════════════════════════════════
const FAMILY_PWD = "famille2026";
const ADMIN_PWD  = "admin2026";
const C = {
  c1: "#06141B", c2: "#11212D", c3: "#253745",
  c4: "#4A5C6A", c5: "#9BA8AB", c6: "#CCD0CF",
  male:   "#4A8FBF",   // blue  – carré
  female: "#BF4A6A",   // red   – cercle
  maleL:  "#4A8FBF33",
  femaleL:"#BF4A6A33",
  link:   "#4A5C6A",
  couple: "#9BA8AB55",
};

const NODE_W = 52, NODE_H = 52;
const H_GAP  = 130;
const V_GAP  = 160;

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
const loadData  = () => { try { const d=JSON.parse(localStorage.getItem("arbre_v3")); return d?.length?d:SEED; } catch{ return SEED; }};
const saveData  = d  => localStorage.setItem("arbre_v3", JSON.stringify(d));
const nextId    = d  => Math.max(0,...d.map(p=>p.id))+1;
const initials  = p  => `${p.prenom[0]}${p.nom[0]}`.toUpperCase();
const fmtDate   = s  => s?new Date(s).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"—";
const isFemale  = p  => p.genre==="F";

function calcAge(birth,death){
  const e=death?new Date(death):new Date(), b=new Date(birth);
  let a=e.getFullYear()-b.getFullYear();
  const m=e.getMonth()-b.getMonth();
  if(m<0||(m===0&&e.getDate()<b.getDate()))a--;
  return a;
}

function getGen(id,data,memo={}){
  if(id in memo)return memo[id];
  const p=data.find(x=>x.id===id);
  if(!p||!p.parentIds.length)return(memo[id]=0);
  memo[id]=1+Math.max(...p.parentIds.map(pid=>getGen(pid,data,memo)));
  return memo[id];
}

// ══════════════════════════════════════════════
//  AUTO-LAYOUT  (horizontal spread per gen)
// ══════════════════════════════════════════════
function computeLayout(data){
  if(!data.length)return{};
  const memo={},genOf={};
  data.forEach(p=>{genOf[p.id]=getGen(p.id,data,memo);});
  const byGen={};
  data.forEach(p=>{(byGen[genOf[p.id]]=byGen[genOf[p.id]]||[]).push(p);});

  const pos={};
  Object.keys(byGen).sort((a,b)=>+a-+b).forEach(g=>{
    const people=byGen[g],gn=+g;
    const ordered=[],seen=new Set();
    const sorted=[...people].sort((a,b)=>{
      const ak=a.parentIds.slice().sort().join(","), bk=b.parentIds.slice().sort().join(",");
      return ak.localeCompare(bk);
    });
    sorted.forEach(p=>{
      if(seen.has(p.id))return;
      seen.add(p.id);ordered.push(p);
      if(p.conjointId){const c=people.find(x=>x.id===p.conjointId);if(c&&!seen.has(c.id)){seen.add(c.id);ordered.push(c);}}
    });
    const w=(ordered.length-1)*H_GAP;
    ordered.forEach((p,i)=>{pos[p.id]={x:i*H_GAP-w/2,y:gn*V_GAP};});
  });

  // nudge parents over children
  for(let iter=0;iter<3;iter++){
    Object.keys(byGen).sort((a,b)=>+b-+a).forEach(g=>{
      byGen[+g].forEach(p=>{
        const kids=data.filter(c=>c.parentIds.includes(p.id)).filter(c=>pos[c.id]);
        if(!kids.length||!pos[p.id])return;
        const avg=kids.reduce((s,c)=>s+pos[c.id].x,0)/kids.length;
        pos[p.id]={...pos[p.id],x:pos[p.id].x*0.3+avg*0.7};
      });
    });
  }
  return pos;
}

// ══════════════════════════════════════════════
//  ORTHOGONAL LINKS  (family-tree style)
// ══════════════════════════════════════════════
function buildLinks(data,pos){
  const links=[];
  const half=NODE_W/2;

  data.forEach(p=>{
    // couple horizontal bar
    if(p.conjointId&&p.id<p.conjointId){
      const a=pos[p.id],b=pos[p.conjointId];
      if(a&&b){
        const ax=a.x+(isFemale(p)?0:half), bx=b.x-(isFemale(data.find(x=>x.id===p.conjointId))?0:half);
        links.push({type:"couple",id:`c${p.id}`,x1:a.x,y1:a.y,x2:b.x,y2:b.y});
      }
    }

    // child vertical line
    if(p.parentIds.length){
      const cp=pos[p.id]; if(!cp)return;
      const p1=pos[p.parentIds[0]], p2=p.parentIds[1]?pos[p.parentIds[1]]:null;
      const px=(p1&&p2)?(p1.x+p2.x)/2:p1?.x;
      const py=(p1&&p2)?Math.max(p1.y,p2.y):p1?.y;
      if(px!==undefined&&py!==undefined){
        const midY=py+NODE_H/2+(cp.y-py-NODE_H/2)/2;
        links.push({type:"child",id:`ch${p.id}`,sx:px,sy:py+NODE_H/2,cx:cp.x,cy:cp.y-NODE_H/2,midY});
      }
    }
  });
  return links;
}

// ══════════════════════════════════════════════
//  SHARED INPUT STYLE
// ══════════════════════════════════════════════
const IS = {
  width:"100%",padding:"9px 12px",borderRadius:8,boxSizing:"border-box",
  background:C.c2,border:`1px solid ${C.c3}`,color:C.c6,
  fontSize:13,fontFamily:"'Crimson Text',serif",
};
const LS = {display:"block",fontSize:9,color:C.c4,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4,fontFamily:"sans-serif"};

// ══════════════════════════════════════════════
//  MEMBER FORM
// ══════════════════════════════════════════════
function MemberForm({config,data,onSave,onClose}){
  const {type,targetId}=config;
  const src=type==="edit"?data.find(p=>p.id===targetId):null;
  const [f,setF]=useState({
    prenom:src?.prenom||"",nom:src?.nom||"",
    naissance:src?.naissance||"",deces:src?.deces||"",
    bio:src?.bio||"",genre:src?.genre||"M",photo:src?.photo||null,
  });
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const canSave=f.prenom.trim()&&f.nom.trim()&&f.naissance;
  const fileRef=useRef();

  const handlePhoto=e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>set("photo",ev.target.result);
    reader.readAsDataURL(file);
  };

  const titles={
    "add-conjoint":"💑 Ajouter un(e) conjoint(e)",
    "add-child":   "👶 Ajouter un enfant",
    "add-parent":  "👴 Ajouter un parent",
    "edit":        "✏️ Modifier ce membre",
  };

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:`linear-gradient(160deg,${C.c1},${C.c2})`,border:`1px solid ${C.c3}`,borderRadius:18,padding:"26px 26px 22px",width:420,maxWidth:"92vw",boxShadow:"0 40px 80px rgba(0,0,0,0.7)",animation:"fadeUp 0.2s ease-out",maxHeight:"90vh",overflowY:"auto"}}>
        <h2 style={{margin:"0 0 20px",color:C.c6,fontSize:17,fontFamily:"'Playfair Display',serif"}}>{titles[type]}</h2>

        {/* Photo */}
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div onClick={()=>fileRef.current.click()} style={{width:64,height:64,borderRadius:type==="add-child"||f.genre==="M"?8:"50%",background:C.c2,border:`2px dashed ${C.c4}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",flexShrink:0,transition:"border-color 0.2s"}}>
            {f.photo
              ?<img src={f.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              :<span style={{fontSize:22}}>📷</span>}
          </div>
          <div>
            <div style={{color:C.c5,fontSize:12,fontFamily:"'Crimson Text',serif",marginBottom:4}}>Photo de profil</div>
            <button onClick={()=>fileRef.current.click()} style={{padding:"5px 12px",borderRadius:7,background:C.c3,border:`1px solid ${C.c4}`,color:C.c5,cursor:"pointer",fontSize:11,fontFamily:"sans-serif"}}>Importer</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>
        </div>

        {/* Name row */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          {[["Prénom *","prenom"],["Nom *","nom"]].map(([lb,k])=>(
            <div key={k}><label style={LS}>{lb}</label><input value={f[k]} onChange={e=>set(k,e.target.value)} style={IS}/></div>
          ))}
        </div>

        {/* Genre */}
        <div style={{marginBottom:10}}>
          <label style={LS}>Genre *</label>
          <div style={{display:"flex",gap:8}}>
            {[["M","🟦 Homme",C.male],["F","🔴 Femme",C.female]].map(([v,lb,col])=>(
              <button key={v} onClick={()=>set("genre",v)} style={{flex:1,padding:9,borderRadius:8,cursor:"pointer",border:`1.5px solid ${f.genre===v?col:C.c3}`,background:f.genre===v?`${col}18`:C.c2,color:f.genre===v?col:C.c4,fontSize:12,transition:"all 0.15s"}}>{lb}</button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={LS}>Naissance *</label><input type="date" value={f.naissance} onChange={e=>set("naissance",e.target.value)} style={IS}/></div>
          <div><label style={LS}>Décès</label><input type="date" value={f.deces} onChange={e=>set("deces",e.target.value)} style={IS}/></div>
        </div>

        {/* Bio */}
        <div style={{marginBottom:18}}>
          <label style={LS}>Biographie</label>
          <textarea value={f.bio} onChange={e=>set("bio",e.target.value)} placeholder="Quelques mots..." style={{...IS,resize:"vertical",minHeight:64}}/>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:10,borderRadius:9,background:C.c2,border:`1px solid ${C.c3}`,color:C.c4,cursor:"pointer",fontSize:13}}>Annuler</button>
          <button onClick={()=>{if(!canSave)return;onSave({...f,deces:f.deces||null});}} style={{flex:2,padding:10,borderRadius:9,background:canSave?`${C.c4}22`:C.c2,border:`1px solid ${canSave?C.c5:C.c3}`,color:canSave?C.c6:C.c4,cursor:canSave?"pointer":"default",fontSize:14,fontFamily:"'Playfair Display',serif",transition:"all 0.15s"}}>✓ Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  NODE SHAPE
// ══════════════════════════════════════════════
function PersonNode({person,pos,isSelected,onClick}){
  const female=isFemale(person);
  const color=female?C.female:C.male;
  const colorL=female?C.femaleL:C.maleL;
  const isDead=!!person.deces;
  const r=NODE_W/2;
  const {x,y}=pos;

  return(
    <g transform={`translate(${x},${y})`} onClick={onClick} style={{cursor:"pointer"}}>
      {/* Selection glow */}
      {isSelected&&(female
        ?<circle r={r+8} fill={`${color}18`} stroke={`${color}40`} strokeWidth={1}/>
        :<rect x={-r-8} y={-r-8} width={NODE_W+16} height={NODE_H+16} rx={6} fill={`${color}18`} stroke={`${color}40`} strokeWidth={1}/>
      )}

      {/* Shadow */}
      {female
        ?<circle r={r+1} cy={3} fill="rgba(0,0,0,0.3)"/>
        :<rect x={-r+1} y={-r+3} width={NODE_W} height={NODE_H} rx={4} fill="rgba(0,0,0,0.3)"/>
      }

      {/* Main shape */}
      {female
        ?<circle r={r} fill={isDead?C.c2:colorL} stroke={isSelected?color:`${color}88`} strokeWidth={isSelected?2.5:1.5} style={{transition:"all 0.2s"}}/>
        :<rect x={-r} y={-r} width={NODE_W} height={NODE_H} rx={4} fill={isDead?C.c2:colorL} stroke={isSelected?color:`${color}88`} strokeWidth={isSelected?2.5:1.5} style={{transition:"all 0.2s"}}/>
      }

      {/* Photo or initials */}
      {person.photo?(
        <clipPath id={`clip-${person.id}`}>
          {female?<circle r={r-2}/>:<rect x={-r+2} y={-r+2} width={NODE_W-4} height={NODE_H-4} rx={3}/>}
        </clipPath>
      ):null}
      {person.photo
        ?<image href={person.photo} x={-r+2} y={-r+2} width={NODE_W-4} height={NODE_H-4} clipPath={`url(#clip-${person.id})`} preserveAspectRatio="xMidYMid slice" style={{opacity:isDead?0.5:1}}/>
        :<text textAnchor="middle" dominantBaseline="central" fill={isDead?C.c4:color} fontSize="13" fontWeight="700" fontFamily="'Playfair Display',serif" style={{userSelect:"none"}}>{initials(person)}</text>
      }

      {/* Dead cross */}
      {isDead&&<text x={r-5} y={-r+8} fontSize="9" fill={C.c4} style={{userSelect:"none"}}>✝</text>}

      {/* Name below */}
      <text y={r+13} textAnchor="middle" fill={isSelected?C.c6:C.c4} fontSize="9" fontFamily="'Crimson Text',serif" style={{userSelect:"none",transition:"fill 0.2s"}}>
        {person.prenom}
      </text>
    </g>
  );
}

// ══════════════════════════════════════════════
//  RIGHT PANEL
// ══════════════════════════════════════════════
function PersonPanel({person,data,isAdmin,onClose,onAddConjoint,onAddChild,onAddParent,onEdit,onDelete}){
  const female=isFemale(person);
  const color=female?C.female:C.male;
  const isDead=!!person.deces;
  const age=calcAge(person.naissance,person.deces);
  const conjoint=person.conjointId?data.find(p=>p.id===person.conjointId):null;
  const parents=person.parentIds.map(id=>data.find(p=>p.id===id)).filter(Boolean);
  const children=data.filter(p=>p.parentIds.includes(person.id));

  return(
    <div style={{position:"fixed",top:0,right:0,width:280,height:"100vh",background:`linear-gradient(180deg,${C.c1},${C.c2})`,borderLeft:`2px solid ${color}25`,zIndex:100,display:"flex",flexDirection:"column",boxShadow:"-12px 0 40px rgba(0,0,0,0.6)",animation:"slideIn 0.25s ease-out"}}>
      {/* Top */}
      <div style={{padding:"16px",borderBottom:`1px solid ${C.c3}`,flexShrink:0}}>
        <button onClick={onClose} style={{float:"right",background:"none",border:"none",color:C.c4,cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>✕</button>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Avatar */}
          <div style={{width:52,height:52,borderRadius:female?"50%":6,background:isDead?C.c2:`${color}18`,border:`2px solid ${color}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
            {person.photo
              ?<img src={person.photo} style={{width:"100%",height:"100%",objectFit:"cover",opacity:isDead?0.5:1}}/>
              :<span style={{fontSize:14,fontWeight:700,color,fontFamily:"'Playfair Display',serif"}}>{initials(person)}</span>
            }
          </div>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700,color:C.c6,lineHeight:1.2}}>{person.prenom}</div>
            <div style={{color,fontSize:12,fontFamily:"'Crimson Text',serif"}}>{person.nom}</div>
            {isDead&&<div style={{color:C.c4,fontSize:9,marginTop:1}}>✝ Décédé(e) · {age} ans</div>}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 16px"}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
          {[
            ["🎂","Naissance",fmtDate(person.naissance)],
            [isDead?"⚰️":"⏳",isDead?"Décès":"Âge",isDead?fmtDate(person.deces):`${age} ans`],
          ].map(([ic,lb,vl])=>(
            <div key={lb} style={{background:C.c2,border:`1px solid ${C.c3}`,borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:13}}>{ic}</div>
              <div style={{fontSize:8,color:C.c4,textTransform:"uppercase",letterSpacing:1,margin:"2px 0",fontFamily:"sans-serif"}}>{lb}</div>
              <div style={{fontSize:11,color:C.c5,fontFamily:"'Crimson Text',serif"}}>{vl}</div>
            </div>
          ))}
        </div>

        {/* Bio */}
        {person.bio&&(
          <div style={{marginBottom:14}}>
            <div style={LS}>Biographie</div>
            <p style={{color:C.c5,fontSize:12,lineHeight:1.7,fontFamily:"'Crimson Text',serif",margin:0}}>{person.bio}</p>
          </div>
        )}

        {/* Family */}
        {[["💑 Conjoint(e)",[conjoint].filter(Boolean)],["👨‍👩‍👧 Parents",parents],[`👶 Enfants (${children.length})`,children]].filter(([,m])=>m.length>0).map(([lb,members])=>(
          <div key={lb} style={{marginBottom:10}}>
            <div style={LS}>{lb}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {members.map(m=>(
                <span key={m.id} style={{background:`${isFemale(m)?C.female:C.male}15`,border:`1px solid ${isFemale(m)?C.female:C.male}30`,borderRadius:12,padding:"2px 8px",fontSize:11,color:C.c5,fontFamily:"'Crimson Text',serif"}}>
                  {m.prenom} {m.nom}
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* Admin */}
        {isAdmin&&(
          <div style={{marginTop:16,paddingTop:12,borderTop:`1px solid ${C.c3}`}}>
            <div style={LS}>⚙️ Administration</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {!person.conjointId&&<AB onClick={onAddConjoint} ico="💑" txt="Ajouter conjoint(e)" c={C.c5}/>}
              <AB onClick={onAddChild}  ico="👶" txt="Ajouter un enfant"   c="#82c582"/>
              <AB onClick={onAddParent} ico="👴" txt="Ajouter un parent"   c="#a89bd4"/>
              <AB onClick={onEdit}      ico="✏️" txt="Modifier"            c={C.male}/>
              <AB onClick={onDelete}    ico="🗑" txt="Supprimer"           c="#BF4A4A" danger/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AB({onClick,ico,txt,c,danger}){
  return(
    <button onClick={onClick} style={{width:"100%",padding:"8px 12px",borderRadius:8,cursor:"pointer",background:danger?`rgba(191,74,74,0.07)`:`${c}12`,border:`1px solid ${danger?"rgba(191,74,74,0.2)":`${c}28`}`,color:danger?"#BF4A4A":c,fontSize:12,textAlign:"left",fontFamily:"'Crimson Text',serif",display:"flex",alignItems:"center",gap:7,transition:"all 0.13s"}}>
      <span>{ico}</span>{txt}
    </button>
  );
}

// ══════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════
function LoginScreen({onLogin}){
  const [pwd,setPwd]=useState("");
  const [err,setErr]=useState(false);
  const [shake,setShake]=useState(false);

  const tryLogin=()=>{
    if(pwd===FAMILY_PWD){onLogin("family");return;}
    if(pwd===ADMIN_PWD){onLogin("admin");return;}
    setErr(true);setShake(true);setTimeout(()=>setShake(false),500);
  };

  return(
    <div style={{minHeight:"100vh",background:`linear-gradient(145deg,${C.c1} 0%,${C.c2} 50%,${C.c3} 100%)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        input:focus,textarea:focus{outline:none}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${C.c4};border-radius:3px}
      `}</style>

      <div style={{animation:"fadeUp 0.6s ease-out",background:`linear-gradient(160deg,${C.c1}ee,${C.c2}ee)`,backdropFilter:"blur(20px)",border:`1px solid ${C.c3}`,borderRadius:20,padding:"48px 40px",width:320,textAlign:"center",boxShadow:"0 40px 80px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:52,animation:"float 4s ease-in-out infinite",marginBottom:10}}>🌳</div>
        <h1 style={{fontFamily:"'Playfair Display',serif",color:C.c6,fontSize:26,margin:"0 0 6px",fontWeight:700}}>Arbre Familial</h1>
        <p style={{color:C.c4,fontSize:13,margin:"0 0 32px",fontFamily:"'Crimson Text',serif",fontStyle:"italic"}}>Espace privé de la famille</p>

        <div style={{animation:shake?"shake 0.45s ease-out":"none"}}>
          <input type="password" value={pwd} placeholder="Mot de passe"
            onChange={e=>{setPwd(e.target.value);setErr(false);}}
            onKeyDown={e=>e.key==="Enter"&&tryLogin()}
            style={{...IS,fontSize:14,padding:"12px 16px",marginBottom:err?6:14,borderRadius:10}}/>
          {err&&<p style={{color:"#BF4A4A",fontSize:12,margin:"0 0 14px",fontFamily:"sans-serif"}}>Mot de passe incorrect</p>}
        </div>

        <button onClick={tryLogin} style={{width:"100%",padding:12,borderRadius:10,background:`linear-gradient(135deg,${C.c3},${C.c4})`,border:`1px solid ${C.c4}`,color:C.c6,fontSize:14,cursor:"pointer",fontFamily:"'Playfair Display',serif",letterSpacing:0.5,transition:"all 0.2s"}}>
          Entrer →
        </button>

        {/* Legend */}
        <div style={{marginTop:28,display:"flex",justifyContent:"center",gap:20}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:14,height:14,borderRadius:2,background:`${C.male}30`,border:`1.5px solid ${C.male}`,flexShrink:0}}/>
            <span style={{fontSize:10,color:C.c4,fontFamily:"sans-serif"}}>Homme</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:14,height:14,borderRadius:"50%",background:`${C.female}30`,border:`1.5px solid ${C.female}`,flexShrink:0}}/>
            <span style={{fontSize:10,color:C.c4,fontFamily:"sans-serif"}}>Femme</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════
export default function App(){
  const [mode,setMode]=useState(null);
  const [data,setData]=useState(loadData);
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState(null);
  const [tf,setTf]=useState({x:0,y:0,scale:1});
  const [drag,setDrag]=useState(null);
  const [svgW,setSvgW]=useState(window.innerWidth);
  const svgRef=useRef(null);

  const pos=computeLayout(data);
  const links=buildLinks(data,pos);
  const selPerson=data.find(p=>p.id===selected);
  const isAdmin=mode==="admin";
  const panelOpen=!!selPerson;

  useEffect(()=>{
    const upd=()=>setSvgW(window.innerWidth);
    window.addEventListener("resize",upd);
    return()=>window.removeEventListener("resize",upd);
  },[]);

  useEffect(()=>{saveData(data);},[data]);

  const onWheel=useCallback(e=>{
    e.preventDefault();
    const f=e.deltaY<0?1.1:0.91;
    setTf(t=>({...t,scale:Math.min(3,Math.max(0.15,t.scale*f))}));
  },[]);
  useEffect(()=>{
    const el=svgRef.current;
    if(el)el.addEventListener("wheel",onWheel,{passive:false});
    return()=>el?.removeEventListener("wheel",onWheel);
  },[onWheel]);

  const onMD=e=>{if(e.target.closest("g[data-node]"))return;setDrag({sx:e.clientX-tf.x,sy:e.clientY-tf.y});};
  const onMM=e=>{if(drag)setTf(t=>({...t,x:e.clientX-drag.sx,y:e.clientY-drag.sy}));};
  const onMU=()=>setDrag(null);

  // CRUD
  const handleSave=fd=>{
    if(!form)return;
    const {type,targetId,parentIds}=form;
    if(type==="edit"){
      setData(d=>d.map(p=>p.id===targetId?{...p,...fd}:p));
    } else if(type==="add-conjoint"){
      const nid=nextId(data);
      setData(d=>[...d.map(p=>p.id===targetId?{...p,conjointId:nid}:p),{id:nid,...fd,parentIds:[],conjointId:targetId}]);
    } else if(type==="add-child"){
      const nid=nextId(data);
      setData(d=>[...d,{id:nid,...fd,parentIds,conjointId:null}]);
    } else if(type==="add-parent"){
      const nid=nextId(data);
      setData(d=>[...d.map(p=>p.id===targetId?{...p,parentIds:[...p.parentIds,nid]}:p),{id:nid,...fd,parentIds:[],conjointId:null}]);
    }
    setForm(null);
  };

  const handleDelete=id=>{
    if(!window.confirm("Supprimer ce membre ?"))return;
    setData(d=>d.filter(p=>p.id!==id).map(p=>({...p,conjointId:p.conjointId===id?null:p.conjointId,parentIds:p.parentIds.filter(pid=>pid!==id)})));
    setSelected(null);
  };

  if(!mode)return <LoginScreen onLogin={setMode}/>;

  const cx=(svgW-(panelOpen?280:0))/2;
  const HEADER=50;

  return(
    <div style={{height:"100vh",background:`linear-gradient(145deg,${C.c1} 0%,${C.c2} 60%,${C.c3} 100%)`,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{height:HEADER,background:`${C.c1}ee`,backdropFilter:"blur(20px)",borderBottom:`1px solid ${C.c3}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",flexShrink:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>🌳</span>
          <span style={{fontFamily:"'Playfair Display',serif",color:C.c6,fontSize:15,fontWeight:700}}>Arbre Familial</span>
          <span style={{fontSize:9,color:C.c3,letterSpacing:2,textTransform:"uppercase"}}>{data.length} membres</span>
          {isAdmin&&<span style={{background:"rgba(130,197,130,0.1)",border:"1px solid rgba(130,197,130,0.2)",color:"#82c582",fontSize:8,padding:"2px 7px",borderRadius:8,letterSpacing:1}}>ADMIN</span>}
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          {[["−",-0.15],["+",0.15]].map(([l,d])=>(
            <button key={l} onClick={()=>setTf(t=>({...t,scale:Math.min(3,Math.max(0.15,t.scale+d))}))} style={{width:26,height:26,borderRadius:6,background:C.c2,border:`1px solid ${C.c3}`,color:C.c5,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>{l}</button>
          ))}
          <button onClick={()=>setTf({x:0,y:0,scale:1})} style={{padding:"0 10px",height:26,borderRadius:6,background:C.c2,border:`1px solid ${C.c3}`,color:C.c4,cursor:"pointer",fontSize:8,letterSpacing:1}}>RESET</button>
          <button onClick={()=>{setMode(null);setSelected(null);}} style={{padding:"0 10px",height:26,borderRadius:6,background:C.c2,border:`1px solid ${C.c3}`,color:C.c4,cursor:"pointer",fontSize:8,letterSpacing:1}}>QUITTER</button>
        </div>
      </div>

      {/* Canvas */}
      <svg ref={svgRef} style={{flex:1,cursor:drag?"grabbing":"grab",display:"block"}}
        onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
        <g transform={`translate(${cx+tf.x},${80+tf.y}) scale(${tf.scale})`}>

          {/* LINKS */}
          {links.map(l=>{
            if(l.type==="couple"){
              // Horizontal dashed bar between couple
              const dx=l.x2-l.x1, dy=l.y2-l.y1;
              const len=Math.sqrt(dx*dx+dy*dy);
              const ux=dx/len*NODE_W/2, uy=dy/len*NODE_H/2;
              return <line key={l.id}
                x1={l.x1+ux} y1={l.y1+uy} x2={l.x2-ux} y2={l.y2-uy}
                stroke={C.couple} strokeWidth="1.5" strokeDasharray="4,3"/>;
            }
            // Orthogonal child connector
            const {sx,sy,cx:ccx,cy,midY}=l;
            return <path key={l.id}
              d={`M${sx},${sy} L${sx},${midY} L${ccx},${midY} L${ccx},${cy}`}
              fill="none" stroke={C.link} strokeWidth="1.5" opacity="0.5"/>;
          })}

          {/* NODES */}
          {data.map(person=>{
            const p=pos[person.id];if(!p)return null;
            return <PersonNode key={person.id} person={person} pos={p}
              isSelected={selected===person.id}
              onClick={()=>setSelected(s=>s===person.id?null:person.id)}/>;
          })}
        </g>
      </svg>

      {/* Panel */}
      {selPerson&&(
        <PersonPanel person={selPerson} data={data} isAdmin={isAdmin}
          onClose={()=>setSelected(null)}
          onAddConjoint={()=>setForm({type:"add-conjoint",targetId:selPerson.id,parentIds:[]})}
          onAddChild={()=>{const pIds=selPerson.conjointId?[selPerson.id,selPerson.conjointId]:[selPerson.id];setForm({type:"add-child",targetId:null,parentIds:pIds});}}
          onAddParent={()=>setForm({type:"add-parent",targetId:selPerson.id,parentIds:[]})}
          onEdit={()=>setForm({type:"edit",targetId:selPerson.id,parentIds:[]})}
          onDelete={()=>handleDelete(selPerson.id)}/>
      )}

      {/* Form */}
      {form&&<MemberForm config={form} data={data} onSave={handleSave} onClose={()=>setForm(null)}/>}

      {/* Legend bottom-left */}
      <div style={{position:"fixed",bottom:14,left:14,background:`${C.c1}ee`,border:`1px solid ${C.c3}`,borderRadius:10,padding:"9px 13px",zIndex:50}}>
        <div style={{fontSize:8,color:C.c3,textTransform:"uppercase",letterSpacing:2,marginBottom:6,fontFamily:"sans-serif"}}>Légende</div>
        {[["Homme",false],["Femme",true]].map(([lb,f])=>(
          <div key={lb} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
            <div style={{width:12,height:12,borderRadius:f?"50%":2,background:`${f?C.female:C.male}25`,border:`1.5px solid ${f?C.female:C.male}`,flexShrink:0}}/>
            <span style={{color:C.c4,fontSize:10,fontFamily:"'Crimson Text',serif"}}>{lb}</span>
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:7,marginTop:2}}>
          <div style={{width:16,height:0,borderTop:`1.5px dashed ${C.c5}`,opacity:0.4}}/>
          <span style={{color:C.c4,fontSize:10,fontFamily:"'Crimson Text',serif"}}>Conjoint(e)</span>
        </div>
      </div>

      {isAdmin&&!selPerson&&(
        <div style={{position:"fixed",bottom:14,right:14,background:`${C.c1}cc`,border:`1px solid ${C.c3}`,borderRadius:8,padding:"6px 12px",fontSize:10,color:C.c4,fontFamily:"sans-serif",zIndex:50}}>
          Cliquez sur un membre pour le modifier
        </div>
      )}
    </div>
  );
}
