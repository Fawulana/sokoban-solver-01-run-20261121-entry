import f from"node:fs";
let{MAKEFUN_INPUT_DIR:I="/input",MAKEFUN_OUTPUT_DIR:O="/output"}=process.env;
for(let id of f.readdirSync(I)){let m="";
try{
let a=f.readFileSync(I+"/"+id+"/level.txt","utf8").trim().split("\n"),w=a[0].length+2,D=[-w,w,-1,1],s="#".repeat(w),g=s+"#"+a.join("##")+"#"+s,G=[],B=[],p=0;
for(let i=g.length;i--;){let c=g[i];"@+".includes(c)&&(p=i),"$*".includes(c)&&B.push(i),".*+".includes(c)&&G.push(i)}
function W(s,t,B){let v={[s]:""},q=[s];
for(let c of q)for(let d=4;d--;){let x=c+D[d];
if(g[x]!="#"&&!B.includes(x)&&!(x in v)){v[x]=v[c]+"udlr"[d];q.push(x)}}
return v[t]}
function S(C,G,B,E){let m={},q=G.map(g=>(m[g]=0,g)),U=[],K={};
for(let y of q)for(let k=4;k--;){let x=y+D[k^1],z=x+D[k^1];
if(!C.includes(x)||m[x]+1||z!=E&&!C.includes(z))continue;m[x]=m[y]+1;q.push(x)}
let H=b=>b.reduce((s,x)=>s+(m[x]??1e9),0),h0=H(B);
let k=B+"|"+E;K[k]=[0,E,B,""];(U[h0]??=[]).push([0,k]);
let F=0,X=0;
for(;;){while(!U[F]?.length)if(++F>999)return null;
let st=K[U[F].pop()[1]];
let[gg,pl,bs,mv]=st;
if(bs.every(x=>G.includes(x)))return[mv,pl,bs];
if(++X>1e5)return null;
for(let i=B.length;i--;){let b=bs[i];
for(let d=4;d--;){let t=b+D[d];
if(!C.includes(t)||bs.includes(t))continue;
let u=b+D[d^1];
if(u!=E&&!C.includes(u)||bs.includes(u))continue;
let nb=bs.with(i,t).sort();
let hh=H(nb);if(hh>=1e9)continue;
let nk=nb+"|"+b,ng=gg+1,pv=K[nk];
if(pv?.[0]<=ng)continue;
let w=W(pl,u,bs);if(w==null)continue;
K[nk]=[ng,b,nb,mv+w+"udlr"[d]];(U[ng+hh]??=[]).push([ng,nk])}}}}
let H=p/w|0,vs=[],o=[];
for(let i of B){if(vs[i])continue;
let C=[],q=[i],D2=-1,E=-1;vs[i]=1;
for(let c of q){C.push(c);
for(let d=4;d--;){let x=c+D[d];
if(g[x]=="#"||vs[x])continue;
if((x/w|0)==H){D2<0&&(D2=c,E=x)}else{vs[x]=1;q.push(x)}}}
if(D2<0)throw 0;
o.push([C,C.filter(y=>G.includes(y)),C.filter(y=>B.includes(y)),E])}
let z=o.map(x=>S(...x));
if(z.some(x=>!x))throw 0;
let pl=p,bt=B;
for(let i in o){let w2=W(pl,o[i][3],bt);
if(w2==null)throw 0;
m+=w2+z[i][0];bt=bt.filter(y=>!o[i][2].includes(y)).concat(z[i][2]);pl=z[i][1]}
}catch{}
f.mkdirSync(O+"/"+id,{recursive:!0});
f.writeFileSync(O+"/"+id+"/solution.txt",m)}
