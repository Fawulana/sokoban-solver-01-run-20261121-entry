import*as f from"node:fs";
const{MAKEFUN_INPUT_DIR:I="/input",MAKEFUN_OUTPUT_DIR:O="/output"}=process.env;
function P(t){let r=t.split("\n"),w=r[0].length+2,G=[],B=[],p=-1,n=[];
const h="#".repeat(w),g=h+"#"+r.join("##")+"#"+h;
for(let i=g.length;i--;){const c=g[i];n[i]=[-w,w,-1,1].map(o=>g[i+o]=="#"?-1:i+o);
".*+".includes(c)&&G.push(i),"$*".includes(c)&&B.push(i),"@+".includes(c)&&(p=i);}
return{w,G,B,p,n}}
function W(n,f,t,B){if(f==t)return"";const p={[f]:1},q=[f];
for(const c of q){if(c==t)break;for(let d=4;d--;){const x=n[c][d];
if(x>=0&&!B.includes(x)&&!p[x]){p[x]=c*4+d;q.push(x)}}}
if(!p[t])return null;let m="",c=t;
while(c!=f)m="udlr"[p[c]&3]+m,c=p[c]>>2;return m}
function S(n,C,G,B,E){if(!B.length)return["",E,[]];const mn=[],q=G.map(g=>(mn[g]=0,g));
for(const y of q)for(let k=4;k--;){const x=n[y][k^1],z=n[x]?.[k^1];
if(x<0||!C.includes(x)||mn[x]+1||z<0||z!=E&&!C.includes(z))continue;mn[x]=mn[y]+1;q.push(x)}
const H=b=>b.reduce((s,x)=>s+(mn[x]??1e9),0),U=[],K={},A=(f,v)=>(U[f]=U[f]||[]).push(v);let F=0,X=0;
const b0=[...B],h0=H(b0);if(h0>=1e9)return null;const k0=b0+"|"+E;
K[k0]=[0,E,b0,""];A(h0,[0,k0]);
for(;;){while(!U[F]?.length)if(++F>999)return null;
const[gg,k]=U[F].pop(),st=K[k];if(!st||st[0]!=gg)continue;
const[,pl,bs,mv]=st;if(bs.every(x=>G.includes(x)))return[mv,pl,bs];
if(++X>1e5)return null;
for(let i=B.length;i--;){const b=bs[i];for(let d=4;d--;){const t=n[b][d];
if(t<0||!C.includes(t)||bs.includes(t))continue;const u=n[b][d^1];
if(u<0||u!=E&&!C.includes(u)||bs.includes(u))continue;const nb=[...bs];nb[i]=t;nb.sort();
const hh=H(nb);if(hh>=1e9)continue;const nk=nb+"|"+b,ng=gg+1,pv=K[nk];
if(pv&&pv[0]<=ng)continue;const w=W(n,pl,u,bs);if(w==null)continue;
K[nk]=[ng,b,nb,mv+w+"udlr"[d]];A(ng+hh,[ng,nk])}}}}
function R(v){const H=v.p/v.w|0,s=[],o=[];
for(const i of v.B){if((i/v.w|0)==H||s[i])continue;const C=[],q=[i];s[i]=1;let D=-1,E=-1;
for(const c of q){C.push(c);for(let d=4;d--;){const x=v.n[c][d];
if(x<0||s[x])continue;if((x/v.w|0)==H){D<0&&(D=c,E=x)}else{s[x]=1;q.push(x)}}}
if(D<0)return null;const z=c=>C.includes(c);o.push([C,v.G.filter(z),v.B.filter(z),E])}return o}
function V(v){const r=R(v);
const s=r.map(x=>S(v.n,...x));if(s.some(x=>!x))return"";
let m="",pl=v.p,bt=[...v.B];
for(let ri in r){const x=r[ri],sl=s[ri],w=W(v.n,pl,x[3],bt);if(w==null)return"";
m+=w+sl[0];bt=[...bt.filter(y=>!x[2].includes(y)),...sl[2]];pl=sl[1]}return m}
f.readdirSync(I).forEach(id=>{let m="",d=O+"/"+id;
try{m=V(P(f.readFileSync(I+"/"+id+"/level.txt","utf8")))}catch{}
f.mkdirSync(d,{recursive:true});f.writeFileSync(d+"/solution.txt",m+"\n")})
