import {clamp} from './core.mjs';
export class FlowerRenderer{
  constructor(canvas,garden){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.garden=garden;this.sprites=[];this.masks=[];this.ready=false;this.resize();}
  resize(){this.dpr=Math.min(devicePixelRatio||1,1.65);this.canvas.width=Math.round(innerWidth*this.dpr);this.canvas.height=Math.round(innerHeight*this.dpr);this.canvas.style.width=innerWidth+'px';this.canvas.style.height=innerHeight+'px';}
  async load(loadedImage){
    const im=loadedImage??new Image();if(!loadedImage){im.src='./assets/flowers-v2.png';await im.decode();}
    for(let row=0;row<2;row++)for(let col=0;col<3;col++){
      const c=document.createElement('canvas');c.width=c.height=320;const ctx=c.getContext('2d',{willReadFrequently:true});
      const cellW=im.width/3,cellH=im.height/2,inset=cellW/16;
      // Soften contrast in the original artwork without replacing the flowers.
      ctx.filter='saturate(0.6) contrast(0.82) brightness(1.08)';
      ctx.drawImage(im,col*cellW+inset,row*cellH+inset,cellW-inset*2,cellH-inset*2,0,0,320,320);
      ctx.filter='none';
      this.sprites.push(c);this.masks.push(ctx.getImageData(0,0,320,320).data);
    }
    this.garden.alphaHit=(f,u,v)=>{
      const x=clamp(Math.floor(u*320),0,319),y=clamp(Math.floor(v*320),0,319),i=(y*320+x)*4+3;
      return this.masks[f.kind+(f.bloom>.45?3:0)][i]>100;
    };this.ready=true;
  }
  flower(f,s,alpha=1){
    const c=this.ctx;c.save();c.translate(s.x,s.y);c.rotate(s.angle);c.globalAlpha=alpha;
    const size=s.r*2;
    c.drawImage(this.sprites[f.kind],-s.r,-s.r,size,size);
    if(f.bloom>.005){c.globalAlpha=alpha*f.bloom;c.drawImage(this.sprites[f.kind+3],-s.r,-s.r,size,size);}
    c.restore();
  }
  draw(){
    const c=this.ctx,g=this.garden;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#e8e3dc';c.fillRect(0,0,g.width,g.height);
    if(!this.ready)return;
    for(const f of g.flowers)if(!f.hidden&&!f.held)this.flower(f,f.screen);
    if(g.hover&&!g.held&&g.cursor){
      const s=g.hover.screen;c.beginPath();c.ellipse(s.x,s.y,s.r*.7,s.r*.68,s.angle,0,Math.PI*2);
      c.strokeStyle='rgba(96,89,82,.37)';c.lineWidth=.8;c.setLineDash([2,5]);c.stroke();c.setLineDash([]);
    }
    if(g.held){
      const f=g.held,p=g.heldPoint;c.save();c.shadowColor='rgba(74,51,55,.14)';c.shadowBlur=12;c.shadowOffsetX=3;c.shadowOffsetY=6;
      this.flower(f,{x:p.x,y:p.y,r:f.r*1.12,angle:f.angle+Math.sin(g.time*1.2)*.04});c.restore();
    }
    for(const p of g.particles){
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);
      const flap=.38+Math.abs(Math.sin(p.age*3+p.phase))*.62;c.scale(flap,1);
      c.globalAlpha=Math.min(1,(p.life-p.age)/1.1);const r=p.size;
      const gradient=c.createLinearGradient(-r,-r,r,r);gradient.addColorStop(0,p.kind===1?'#fffdf5':'#fff3f2');gradient.addColorStop(.5,p.kind===1?'#eee5d8':'#edc6cc');gradient.addColorStop(1,p.kind===1?'#cfbfb0':'#cfa4ad');c.fillStyle=gradient;
      c.beginPath();c.moveTo(0,r*.92);c.bezierCurveTo(-r*1.1,r*.12,-r,-r*.85,-r*.35,-r*.93);c.bezierCurveTo(-r*.1,-r*1.14,r*.26,-r*.7,r*.55,-r*.95);c.bezierCurveTo(r*1.2,-r*.2,r*.78,r*.52,0,r*.92);c.fill();
      c.strokeStyle='rgba(255,255,255,.3)';c.lineWidth=.6;c.beginPath();c.moveTo(0,r*.75);c.quadraticCurveTo(-r*.18,0,0,-r*.65);c.stroke();c.restore();
    }
    if(g.cursor){
      const p=g.cursor;c.save();c.beginPath();c.arc(p.x,p.y,g.held?6:4.5,0,Math.PI*2);c.fillStyle='#615650';c.fill();c.strokeStyle='#fffdfa';c.lineWidth=1.8;c.stroke();
      c.beginPath();c.arc(p.x,p.y,g.held?14:11,0,Math.PI*2);c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=1;c.stroke();c.restore();
    }
  }
}
