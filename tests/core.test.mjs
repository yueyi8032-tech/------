import test from 'node:test';
import assert from 'node:assert/strict';
import {Garden,HandInterpreter,handFeatures,hitFlower} from '../dist/core.mjs';
const flower=(id,x,y,r=40)=>({id,x,y,r,angle:0,phase:0,kind:0,bloom:0,target:0,hidden:false,respawn:Infinity,grow:1,screen:{x,y,r,angle:0}});
function garden(){const g=new Garden(600,400);g.flowers=[flower(0,100,100),flower(1,250,100),flower(2,400,100),flower(3,250,300)];return g;}
function pose(type='palm'){
 const p=Array.from({length:21},()=>({x:.5,y:.8,z:0}));p[0]={x:.5,y:.9};
 function finger(i,x,y,tx,ty){for(let j=0;j<4;j++)p[i+j]={x:x+(tx-x)*j/3,y:y+(ty-y)*j/3};}
 finger(5,.4,.65,.4,.25);finger(9,.5,.65,.5,.18);finger(13,.6,.67,.6,.23);finger(17,.69,.71,.78,.34);
 p[1]={x:.4,y:.85};p[2]={x:.32,y:.79};p[3]={x:.23,y:.7};p[4]={x:.13,y:.63};
 if(type!=='palm'){for(const i of[9,13,17]){p[i+1]={x:p[i].x,y:p[i].y-.08};p[i+2]={x:p[i].x+.03,y:p[i].y};p[i+3]={x:p[i].x+.025,y:p[i].y+.07};}p[4]={x:.36,y:.76};}
 if(type==='pinch')p[4]={x:p[8].x+.018,y:p[8].y+.01};return p;
}
test('picking uses current visible location and painter order, without nearest snapping',()=>{
 const g=garden();assert.equal(hitFlower(g.flowers,{x:100,y:100}).id,0);assert.equal(hitFlower(g.flowers,{x:170,y:100}),null);
 g.flowers.push(flower(4,100,100));assert.equal(hitFlower(g.flowers,{x:100,y:100}).id,4);assert.equal(hitFlower(g.flowers,{x:100,y:100},f=>f.id!==4).id,0);
 g.flowers[0].screen.x=150;assert.equal(hitFlower([g.flowers[0]],{x:100,y:100}),null);assert.equal(hitFlower([g.flowers[0]],{x:150,y:100}).id,0);
});
test('rotated petal hit test uses inverse of rendered transform',()=>{
 const f=flower(1,100,100);f.screen.angle=Math.PI/2;let uv;
 hitFlower([f],{x:100,y:120},(_,u,v)=>{uv={u,v};return true;});assert.ok(Math.abs(uv.u-.75)<1e-9);assert.ok(Math.abs(uv.v-.5)<1e-9);
});
test('pinch lifts one flower, tracks it, and releases petals at final location',()=>{
 const g=garden();g.apply({mode:'pinch',tracked:true,down:true,point:{x:100,y:100}});assert.equal(g.held.id,0);
 g.apply({mode:'pinch',tracked:true,point:{x:250,y:180}});assert.equal(g.held.id,0);assert.deepEqual(g.heldPoint,{x:250,y:180});
 g.apply({mode:'idle',tracked:true,up:true,point:{x:300,y:180}});assert.equal(g.held,null);assert.equal(g.particles.length,64);assert.ok(g.flowers[0].hidden);
 assert.ok(g.particles.every(p=>Math.abs(p.x-300)<40&&Math.abs(p.y-180)<40));assert.ok(g.flowers.slice(1).every(f=>!f.hidden));
});
test('empty-space pinch cannot grab later during drag',()=>{
 const g=garden();g.apply({mode:'pinch',tracked:true,down:true,point:{x:180,y:200}});g.apply({mode:'pinch',tracked:true,point:{x:100,y:100}});assert.equal(g.held,null);
});
test('fast index sweep blooms continuous path and leaves distant flowers closed',()=>{
 const g=garden();g.apply({mode:'point',tracked:true,point:{x:40,y:100}});g.apply({mode:'point',tracked:true,point:{x:450,y:100}});assert.deepEqual(g.flowers.map(f=>f.target),[1,1,1,0]);
});
test('tracking loss breaks sweep and returns held flower without scattering',()=>{
 const g=garden();g.apply({mode:'point',tracked:true,point:{x:40,y:100}});g.apply({tracked:false});g.apply({mode:'point',tracked:true,point:{x:450,y:100}});assert.equal(g.flowers[1].target,0);
 g.apply({mode:'pinch',tracked:true,down:true,point:{x:100,y:100}});g.apply({tracked:false,cancel:true});assert.equal(g.held,null);assert.equal(g.particles.length,0);assert.equal(g.flowers[0].hidden,false);
});
test('open palm blooms all and directional wind decays',()=>{
 const g=garden();g.apply({mode:'palm',tracked:true,point:{x:300,y:250},velocity:{x:-900,y:0}});assert.ok(g.flowers.every(f=>f.target===1));assert.ok(g.wind.x<0);
 const initial=Math.abs(g.wind.x);g.tick(.05);assert.ok(Math.abs(g.wind.x)<initial);assert.ok(g.flowers.some(f=>f.screen.x!==f.x));
});
test('classifier distinguishes pointing, five fingers and pinch at webcam aspect ratios',()=>{
 for(const a of[1,4/3,16/9]){assert.ok(handFeatures(pose('palm'),a).open);assert.ok(handFeatures(pose('point'),a).point);assert.ok(!handFeatures(pose('point'),a).open);assert.ok(handFeatures(pose('pinch'),a).pinch<.28);}
});
test('pinch debounces jitter; loss does not become release',()=>{
 const h=new HandInterpreter(),p=pose('pinch');assert.ok(!h.read(p,0,1000,600).down);assert.ok(h.read(p,60,1000,600).down);
 const jitter=pose('pinch');jitter[4]={x:jitter[8].x+.1,y:jitter[8].y};assert.ok(!h.read(jitter,100,1000,600).up);assert.ok(h.pinched);
 assert.ok(!h.read(null,150,1000,600).cancel);assert.ok(!h.read(null,500,1000,600).cancel);const lost=h.read(null,550,1000,600);assert.ok(lost.cancel);assert.ok(!lost.up);
 h.read(p,600,1000,600);assert.ok(h.read(p,660,1000,600).down);assert.ok(!h.read(pose('point'),700,1000,600).up);assert.ok(h.read(pose('point'),760,1000,600).up);
});
test('projection mirrors once and calibration reaches screen edges',()=>{
 const h=new HandInterpreter();assert.deepEqual(h.project({x:.2,y:.25},1000,600),{x:800,y:150});h.mirror=false;assert.deepEqual(h.project({x:.2,y:.25},1000,600),{x:200,y:150});
 h.calibration={x0:.2,y0:.1,x1:.8,y1:.9};assert.deepEqual(h.project({x:.2,y:.1},1000,600),{x:0,y:0});assert.deepEqual(h.project({x:.8,y:.9},1000,600),{x:1000,y:600});
});
test('reset clears interactions and removed flowers regrow',()=>{
 const g=garden();g.pick({x:100,y:100});g.release();for(let i=0;i<200;i++)g.tick(.05);assert.equal(g.flowers[0].hidden,false);assert.ok(g.flowers[0].grow>0);
 g.pick({x:250,y:100});g.reset();assert.equal(g.held,null);assert.equal(g.particles.length,0);assert.ok(g.flowers.every(f=>!f.hidden&&f.target===0));
});
