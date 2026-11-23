/* Paint recipe solver: finds tube combinations (1-3 paints) whose Mixbox mix best matches a target colour.
   Mixbox (c) Secret Weapons, CC BY-NC 4.0 — non-commercial use. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.makeMixer=factory})(this,function(mixbox){
 const rgbOf=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const hexOf=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
 function lab(rgb){const v=rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});
  const X=(v[0]*.4124+v[1]*.3576+v[2]*.1805)/.95047,Y=v[0]*.2126+v[1]*.7152+v[2]*.0722,Z=(v[0]*.0193+v[1]*.1192+v[2]*.9505)/1.08883;
  const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;return [116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))]}
 function de2000(a,b){const [L1,a1,b1]=a,[L2,a2,b2]=b,rad=Math.PI/180;
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2,G=.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
  const a1p=(1+G)*a1,a2p=(1+G)*a2,C1p=Math.hypot(a1p,b1),C2p=Math.hypot(a2p,b2);
  const h=(x,y)=>{if(!x&&!y)return 0;const t=Math.atan2(y,x)/rad;return t<0?t+360:t},h1=h(a1p,b1),h2=h(a2p,b2);
  const dL=L2-L1,dC=C2p-C1p;let dh=0;if(C1p*C2p){dh=h2-h1;if(dh>180)dh-=360;else if(dh<-180)dh+=360}
  const dH=2*Math.sqrt(C1p*C2p)*Math.sin(dh*rad/2),Lb=(L1+L2)/2,Cbp=(C1p+C2p)/2;
  let hb=h1+h2;if(C1p*C2p){hb=Math.abs(h1-h2)>180?(h1+h2+360)/2:(h1+h2)/2}
  const T=1-.17*Math.cos((hb-30)*rad)+.24*Math.cos(2*hb*rad)+.32*Math.cos((3*hb+6)*rad)-.2*Math.cos((4*hb-63)*rad);
  const dTh=30*Math.exp(-(((hb-275)/25)**2)),Rc=2*Math.sqrt(Cbp**7/(Cbp**7+25**7));
  const Sl=1+.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2),Sc=1+.045*Cbp,Sh=1+.015*Cbp*T,Rt=-Math.sin(2*dTh*rad)*Rc;
  return Math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh))}
 const N=mixbox.LATENT_SIZE;
 function prepare(paints){return paints.map(p=>({...p,z:mixbox.rgbToLatent(rgbOf(p.mix))}))}
 function evalMix(ps,cs,T){const z=new Array(N).fill(0);let s=0;cs.forEach(c=>s+=c);
  for(let i=0;i<ps.length;i++){const w=cs[i]/s,zi=ps[i].z;for(let k=0;k<N;k++)z[k]+=w*zi[k]}
  const rgb=mixbox.latentToRgb(z);return {rgb,de:de2000(T,lab(rgb))}}
 function opt2(a,b,T){let best={de:1e9};for(let i=0;i<=10;i++){const t=i/10,r=evalMix([a,b],[1-t,t],T);if(r.de<best.de)best={...r,t}}
  let lo=Math.max(0,best.t-.1),hi=Math.min(1,best.t+.1);
  for(let it=0;it<10;it++){const m1=lo+(hi-lo)/3,m2=hi-(hi-lo)/3,r1=evalMix([a,b],[1-m1,m1],T),r2=evalMix([a,b],[1-m2,m2],T);
   if(r1.de<r2.de){hi=m2;if(r1.de<best.de)best={...r1,t:m1}}else{lo=m1;if(r2.de<best.de)best={...r2,t:m2}}}
  return {ps:[a,b],cs:[1-best.t,best.t],rgb:best.rgb,de:best.de}}
 function opt3(a,b,c,T){const ps=[a,b,c];let best={de:1e9};
  for(let i=0;i<=10;i++)for(let j=0;j<=10-i;j++){const cs=[i/10,j/10,(10-i-j)/10];if(cs.some(x=>x===0))continue;const r=evalMix(ps,cs,T);if(r.de<best.de)best={...r,cs}}
  if(best.de===1e9)return null;
  for(const step of [.04,.02,.01,.005]){let moved=true,guard=0;while(moved&&guard++<20){moved=false;
   for(let p=0;p<3;p++)for(let q=0;q<3;q++){if(p===q)continue;const cs=best.cs.slice();cs[p]+=step;cs[q]-=step;if(cs[q]<=0)continue;
    const r=evalMix(ps,cs,T);if(r.de<best.de-1e-6){best={...r,cs};moved=true}}}}
  return {ps,cs:best.cs,rgb:best.rgb,de:best.de}}
 function parts(r){const raw=r.cs.map((c,i)=>c/r.ps[i].strength),mn=Math.min(...raw);
  return raw.map(v=>{const x=v/mn;return x<5?Math.round(x*2)/2:Math.round(x)})}
 function solve(targetHex,prepared,opt={}){const T=lab(rgbOf(targetHex)),ps=prepared.filter(p=>!p.exclude);if(!ps.length)return [];
  const res=[];
  ps.forEach(p=>{const r=evalMix([p],[1],T);res.push({ps:[p],cs:[1],rgb:r.rgb,de:r.de})});
  const pairs=[];for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)pairs.push(opt2(ps[i],ps[j],T));
  pairs.sort((a,b)=>a.de-b.de);res.push(...pairs.slice(0,30));
  const singles=res.slice(0,ps.length).sort((a,b)=>a.de-b.de);
  const cand=[];const add=p=>{if(!cand.includes(p)&&cand.length<(opt.cand||14))cand.push(p)};
  pairs.slice(0,10).forEach(r=>r.ps.forEach(add));singles.slice(0,6).forEach(r=>add(r.ps[0]));
  ps.filter(p=>/White/.test(p.name)&&p.family==='Whites').slice(0,1).forEach(add);
  for(let i=0;i<cand.length;i++)for(let j=i+1;j<cand.length;j++)for(let k=j+1;k<cand.length;k++){const r=opt3(cand[i],cand[j],cand[k],T);if(r)res.push(r)}
  const pen=opt.penalty??.6;
  const seen=new Set(),out=[];
  res.sort((a,b)=>(a.de+pen*(a.ps.length-1))-(b.de+pen*(b.ps.length-1)));
  for(const r of res){const key=r.ps.map(p=>p.no).sort().join('+');if(seen.has(key))continue;seen.add(key);
   const pt=parts(r);out.push({paints:r.ps.map((p,i)=>({no:p.no,name:p.name,parts:pt[i],hex:p.mix})).sort((x,y)=>y.parts-x.parts),hex:hexOf(r.rgb),de:r.de});
   if(out.length>=(opt.top||3))break}
  return out}
 return {solve,prepare,de2000,lab,rgbOf,hexOf}
});
