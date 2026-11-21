import*as f from"node:fs";
const IN=process.env.MAKEFUN_INPUT_DIR||"/input",OU=process.env.MAKEFUN_OUTPUT_DIR||"/output",LT="udlr",IF=1e9;
function P(t){const r=t.split("\n"),w0=r[0].length,w=w0+2;
const h="#".repeat(w),g=h+"#"+r.map(s=>s.padEnd(w0,"#")).join("##")+"#"+h;
const N=g.length,G=[],B=[],F=[];let p=-1;
for(let i=0;i<N;i++){const c=g[i];if(c!="#"){F.push(i);if(".*+".includes(c))G.push(i);if("$*".includes(c))B.push(i);if("@+".includes(c))p=i}}
const D=[-w,w,-1,1],n=[];for(let i=0;i<N;i++)n.push(D.map(o=>g[i+o]=="#"?-1:i+o));
return{w,G,B,p,n,F}}
function W(n,f,t,B){if(f==t)return"";const p=[],q=[f];p[f]=-2;
for(const c of q){if(c==t)break;for(let d=0;d<4;d++){const x=n[c][d];if(x>=0&&!B.includes(x)&&p[x]==null){p[x]=c*4+d;q.push(x)}}}
if(p[t]==null)return null;let m="",c=t;while(c!=f){const v=p[c];m=LT[v&3]+m;c=v>>2}return m}
function S(v,C,G,B,E){const nB=B.length;if(!nB)return["",E,[]];const n=v.n;
const mn=[],q=[...G];let s;
for(const g of G)mn[g]=0;
for(const y of q)for(let k=0;k<4;k++){const x=n[y][k^1];if(x<0||!C.includes(x)||mn[x]!=null||(s=n[x][k^1])<0||s!=E&&!C.includes(s))continue;mn[x]=mn[y]+1;q.push(x)}
const H=b=>b.reduce((s,x)=>mn[x]==null?IF:s+mn[x],0);
const U=[];let F=0,X=0;const K=new Map();
const b0=B.slice(),h0=H(b0);if(h0>=IF)return null;
const k0=b0+"|"+E;K.set(k0,[0,"",-1,-1,E,b0,""]);(U[h0]=U[h0]||[]).push([0,k0]);
for(;;){for(;!(U[F]&&U[F].length);F++)if(F>999)return null;const y=U[F].pop(),gg=y[0],k=y[1],st=K.get(k);if(!st||st[0]!=gg)continue;
const pl=st[4],bs=st[5];
if(bs.every(x=>G.includes(x)))return[st[6],st[2]<0?E:st[2],bs];
if(++X>1e5)return null;
for(let i=0;i<nB;i++){const b=bs[i];for(let d=0;d<4;d++){const t=n[b][d];if(t<0||!C.includes(t)||bs.includes(t))continue;
const s=n[b][d^1];if(s<0||s!=E&&!C.includes(s)||bs.includes(s))continue;
const nb=bs.slice();nb[i]=t;nb.sort((a,b)=>a-b);
const hh=H(nb);if(hh>=IF)continue;const nk=nb+"|"+b,ng=gg+1,pv=K.get(nk);
if(pv&&pv[0]<=ng)continue;const w=W(n,pl,s,bs);if(w==null)continue;
K.set(nk,[ng,k,b,d,b,nb,st[6]+w+LT[d]]);(U[ng+hh]=U[ng+hh]||[]).push([ng,nk])}}}}
function R(v){const H=v.p/v.w|0,s=[],o=[];
for(const i of v.F){if((i/v.w|0)==H||s[i])continue;const C=[],q=[i];s[i]=1;let D=-1,E=-1;
for(const c of q){C.push(c);for(let d=0;d<4;d++){const x=v.n[c][d];if(x<0||s[x])continue;if((x/v.w|0)==H){D<0&&(D=c,E=x)}else{s[x]=1;q.push(x)}}}
if(D<0)return null;o.push([C,v.G.filter(c=>C.includes(c)),v.B.filter(c=>C.includes(c)),E])}return o}
function V(v){const r=R(v),H=v.p/v.w|0;
if(!r||!r.length||[...v.B,...v.G].some(c=>(c/v.w|0)==H)){const s=S(v,v.F,v.G,v.B,v.p);return s?s[0]:""}
const s=r.map(x=>S(v,x[0],x[1],x[2],x[3]));if(s.some(x=>!x))return"";
let m="",pl=v.p,bt=v.B.slice();
for(let ri=0;ri<r.length;ri++){const x=r[ri],sl=s[ri],w=W(v.n,pl,x[3],bt);if(w==null)return"";m+=w+sl[0];bt=bt.filter(y=>!x[2].includes(y)).concat(sl[2]);pl=sl[1]}
return m}
for(const id of f.readdirSync(IN)){let m="",d=OU+"/"+id;try{m=V(P(f.readFileSync(IN+"/"+id+"/level.txt","utf8")))}catch{m=""}f.mkdirSync(d,{recursive:true});f.writeFileSync(d+"/solution.txt",m+"\n")}
