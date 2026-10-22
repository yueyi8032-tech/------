export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function segmentDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
  const t=n?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/n,0,1):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function random(seed=1781){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};}
export function makeFlowers(width,height){
  const rand=random(),cols=width<600?6:11,step=width/cols,rows=Math.ceil(height/(step*.81))+2;
  const out=[];
  for(let row=-1;row<rows;row++)for(let col=-1;col<=cols;col++){
    const x=(col+.5+(row%2)*.5)*step+(rand()-.5)*step*.17;
    const y=(row+.5)*step*.81+(rand()-.5)*step*.15;
    const radius=step*(.69+rand()*.1);
    // Preserve the original seeded layout while keeping all lighting aligned.
    rand();
    out.push({id:out.length,x,y,r:radius,angle:0,
      phase:rand()*Math.PI*2,kind:Math.floor(rand()*3),bloom:0,target:0,hidden:false,
      respawn:Infinity,grow:1,z:rand(),screen:{x,y,r:step*.73,angle:0}});
  }
  return out.sort((a,b)=>a.z-b.z);
}
// Invert the exact rendered transform; no global-nearest snapping across gaps.
export function hitFlower(flowers,p,alphaHit){
  for(let i=flowers.length-1;i>=0;i--){
    const f=flowers[i];if(f.hidden||f.held||f.grow<.5)continue;
    const s=f.screen??f,dx=p.x-s.x,dy=p.y-s.y,c=Math.cos(s.angle||0),sn=Math.sin(s.angle||0);
    const u=(dx*c+dy*sn)/(s.r*2)+.5,v=(-dx*sn+dy*c)/(s.r*2)+.5;
    if(u<0||v<0||u>1||v>1)continue;
    if(alphaHit?alphaHit(f,u,v):Math.hypot(u-.5,v-.5)<.405)return f;
  }return null;
}
function angle(a,b,c){
  const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y};
  return Math.acos(clamp((u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)||1),-1,1))*180/Math.PI;
}
export function handFeatures(lm,aspect=1){
  if(!lm||lm.length<21||lm.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const p=lm.map(v=>({x:v.x*aspect,y:v.y}));
  const span=Math.max(distance(p[5],p[17]),distance(p[0],p[9])*.65,.015);
  const extended=[5,9,13,17].map(m=>angle(p[m],p[m+1],p[m+3])>150&&distance(p[m+3],p[0])>distance(p[m+1],p[0])*1.12);
  const thumb=angle(p[2],p[3],p[4])>135&&distance(p[4],p[5])/span>.6;
  const spread=distance(p[8],p[12])/span>.13&&distance(p[16],p[20])/span>.13;
  return {pinch:distance(p[4],p[8])/span,
    open:extended.every(Boolean)&&thumb&&spread,
    point:extended[0]&&!extended[2]&&!extended[3],
    index:lm[8],mid:{x:(lm[4].x+lm[8].x)/2,y:(lm[4].y+lm[8].y)/2},
    palm:[0,5,9,13,17].reduce((s,i)=>({x:s.x+lm[i].x/5,y:s.y+lm[i].y/5}),{x:0,y:0})};
}
export class HandInterpreter{
  constructor(){this.reset();this.mirror=true;this.calibration={x0:0,y0:0,x1:1,y1:1};}
  reset(){this.pinched=false;this.closeSince=null;this.openSince=null;this.palmSince=null;this.pointSince=null;this.lastAt=null;this.lastSeen=null;this.cursor=null;this.lastPalm=null;}
  project(p,w,h){const c=this.calibration,x=this.mirror?1-p.x:p.x;return{x:clamp((x-c.x0)/(c.x1-c.x0),0,1)*w,y:clamp((p.y-c.y0)/(c.y1-c.y0),0,1)*h};}
  read(lm,now,width,height,aspect=1){
    const f=handFeatures(lm,aspect);if(!f)return this.missing(now);
    const dt=clamp((now-(this.lastAt??now-33))/1000,.008,.1);this.lastAt=now;this.lastSeen=now;
    let down=false,up=false;
    if(!this.pinched){
      if(f.pinch<.28){this.closeSince??=now;if(now-this.closeSince>=45){this.pinched=true;down=true;this.closeSince=null;}}
      else this.closeSince=null;
    }else{
      if(f.pinch>.46){this.openSince??=now;if(now-this.openSince>=55){this.pinched=false;up=true;this.openSince=null;}}
      else this.openSince=null;
    }
    const raw=this.project(this.pinched||f.pinch<.66?f.mid:f.index,width,height);
    if(!this.cursor)this.cursor=raw;
    const speed=distance(raw,this.cursor)/dt,tau=clamp(.045-speed*.000022,.007,.045),a=dt/(dt+tau);
    this.cursor={x:this.cursor.x+(raw.x-this.cursor.x)*a,y:this.cursor.y+(raw.y-this.cursor.y)*a};
    // A new pick uses the current pinch location, rather than a lagging filtered point.
    if(down)this.cursor=raw;
    const palm=this.project(f.palm,width,height);
    let velocity={x:0,y:0};
    if(this.lastPalm&&now-this.lastPalm.t<160)velocity={x:(palm.x-this.lastPalm.x)/dt,y:(palm.y-this.lastPalm.y)/dt};
    this.lastPalm={...palm,t:now};
    if(f.open&&!this.pinched){this.palmSince??=now;}else this.palmSince=null;
    if(f.point&&!this.pinched){this.pointSince??=now;}else this.pointSince=null;
    const mode=this.pinched?'pinch':this.palmSince!==null&&now-this.palmSince>=100?'palm':this.pointSince!==null&&now-this.pointSince>=35?'point':'idle';
    return {mode,point:{...this.cursor},palm,velocity,down,up,tracked:true};
  }
  missing(now){
    // Lost observations cannot be interpreted as an intentional finger release.
    const cancel=this.lastSeen!==null&&now-this.lastSeen>420;
    if(cancel){this.reset();return{mode:'lost',tracked:false,cancel:true};}
    return{mode:'lost',tracked:false,cancel:false};
  }
}
export class Garden{
  constructor(width,height){this.width=width;this.height=height;this.flowers=makeFlowers(width,height);this.held=null;this.particles=[];this.wind={x:0,y:0};this.previous=null;this.time=0;this.mode='idle';this.cursor=null;this.hover=null;this.alphaHit=null;this.onEvent=()=>{};this.rng=random(913);}
  resize(w,h){this.cancel();this.width=w;this.height=h;this.flowers=makeFlowers(w,h);this.previous=null;this.particles=[];}
  reset(){this.cancel();for(const f of this.flowers){f.target=0;f.hidden=false;f.grow=1;f.respawn=Infinity;}this.particles=[];this.wind={x:0,y:0};this.previous=null;this.hover=null;}
  cancel(){if(this.held){this.held.held=false;this.held=null;}this.previous=null;this.hover=null;}
  pick(p){const f=hitFlower(this.flowers,p,this.alphaHit);if(!f)return false;f.held=true;this.held=f;this.heldPoint={...p};this.hover=null;this.onEvent('pick');return true;}
  release(p){
    const f=this.held;if(!f)return;f.held=false;f.hidden=true;f.respawn=this.time+8;this.held=null;
    const origin=p??this.heldPoint;const dir=Math.abs(this.wind.x)>15?Math.sign(this.wind.x):1;
    for(let i=0;i<64;i++){
      const theta=this.rng()*Math.PI*2,rr=Math.sqrt(this.rng())*f.r*.6;
      this.particles.push({x:origin.x+Math.cos(theta)*rr,y:origin.y+Math.sin(theta)*rr,
        vx:dir*(65+this.rng()*130)+Math.cos(theta)*70+this.wind.x*.25,
        vy:-40+this.rng()*90+Math.sin(theta)*55,size:f.r*(.07+this.rng()*.13),
        age:0,life:3.3+this.rng()*2.8,angle:this.rng()*6.28,spin:(this.rng()-.5)*4,phase:this.rng()*6.28,kind:f.kind});
    }
    this.particles=this.particles.slice(-640);this.onEvent('release');
  }
  apply(input){
    if(input.cancel)this.cancel();
    if(!input.tracked){this.previous=null;this.cursor=null;this.hover=null;this.mode='lost';return;}
    this.cursor=input.point;this.mode=input.mode;
    if(input.down){this.previous=null;this.pick(input.point);}
    if(this.held&&input.point)this.heldPoint={...input.point};
    if(input.up){this.release(input.point);this.previous=null;return;}
    if(this.held||input.mode==='pinch'){this.previous=null;return;}
    this.hover=input.point?hitFlower(this.flowers,input.point,this.alphaHit):null;
    if(input.mode==='point'){
      const from=this.previous?.mode==='point'?this.previous.point:input.point;
      for(const f of this.flowers)if(!f.hidden&&segmentDistance(f.screen,from,input.point)<f.screen.r*.76+7)f.target=1;
    }else if(input.mode==='palm'){
      for(const f of this.flowers)if(!f.hidden)f.target=1;
      const vel=input.velocity??{x:0,y:0};
      this.wind.x+=clamp(vel.x,-1800,1800)*.09;this.wind.y+=clamp(vel.y,-1400,1400)*.035;
      this.wind.x=clamp(this.wind.x,-650,650);this.wind.y=clamp(this.wind.y,-220,220);
    }
    this.previous={mode:input.mode,point:input.point};
  }
  tick(dt){
    dt=Math.min(dt,.05);this.time+=dt;const t=this.time;
    this.wind.x*=Math.exp(-dt*1.8);this.wind.y*=Math.exp(-dt*2.4);
    for(const f of this.flowers){
      if(f.hidden&&t>f.respawn){f.hidden=false;f.grow=0;f.bloom=0;f.target=0;}
      f.grow=Math.min(1,f.grow+dt*.48);f.bloom+=(f.target-f.bloom)*(1-Math.exp(-dt*3));
      const wave=Math.sin(t*3+f.x*.006+f.phase),wx=this.wind.x/650,wy=this.wind.y/220;
      f.screen={x:f.x+wx*f.r*.18*wave,y:f.y+wy*f.r*.12*Math.sin(t*2+f.phase),
        r:f.r*(1+f.bloom*.08)*f.grow,angle:f.angle+wx*.035*wave};
    }
    for(const p of this.particles){p.age+=dt;p.vx+=(this.wind.x*.18-p.vx*.12)*dt;p.vy+=12*dt;p.x+=(p.vx+Math.sin(t*2+p.phase)*20)*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;}
    this.particles=this.particles.filter(p=>p.age<p.life&&p.x>-100&&p.x<this.width+100&&p.y<this.height+100);
  }
}
