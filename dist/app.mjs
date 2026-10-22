import {Garden,HandInterpreter,handFeatures,clamp} from './core.mjs';
import {FlowerRenderer} from './render.mjs';
const $=id=>document.getElementById(id),canvas=$('garden'),video=$('video');
const garden=new Garden(innerWidth,innerHeight),renderer=new FlowerRenderer(canvas,garden),hand=new HandInterpreter();
let mode='welcome',stream=null,tracker=null,starting=false,cameraEpoch=0,lastVideoTime=-1,lastInference=0,frameTime=performance.now(),rawHand=null,lastHint='',errorTimer;
let mousePoint={x:innerWidth/2,y:innerHeight/2},mouseDown=false,space=false,lastMouse=null,calibrationStage=-1,calibrationStart=null,initialized=false;
function hint(text){if(text!==lastHint){$('hintText').textContent=text;lastHint=text;}}
function notify(text){$('error').textContent=text;$('error').hidden=false;clearTimeout(errorTimer);errorTimer=setTimeout(()=>{$('error').hidden=true;},9000);}
function setMode(next){mode=next;document.body.dataset.mode=mode;}
function dismissIntro(){$('intro').hidden=true;}
function cameraControls(active){$('cameraToggle').classList.toggle('active-camera',active);$('cameraToggle').setAttribute('aria-label',active?'关闭摄像头':'开启摄像头');$('cameraToggle').title=active?'关闭摄像头':'开启摄像头';}
function stopCamera(){
  cameraEpoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;hand.reset();rawHand=null;garden.cancel();garden.cursor=null;
  $('cameraPreview').hidden=true;cameraControls(false);starting=false;$('startCamera').disabled=false;$('startCamera').querySelector('span').textContent='开启手势体验';
  if(mode==='camera')setMode('mouse');hint('移动开花 · 按住拿起 · 松开散瓣');
}
async function startCamera(){
  if(starting)return;
  if(!navigator.mediaDevices?.getUserMedia){notify('当前打开方式无法使用摄像头。请在浏览器中打开此页面的 HTTPS 地址，或使用本机预览地址。你也可以先用鼠标体验。');return;}
  starting=true;const epoch=++cameraEpoch;$('startCamera').disabled=true;$('startCamera').querySelector('span').textContent='正在准备手势识别…';hint('正在准备摄像头与手势识别…');
  let incoming;
  try{
    incoming=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:false});
    if(epoch!==cameraEpoch){incoming.getTracks().forEach(t=>t.stop());return;}
    stream=incoming;video.srcObject=stream;await video.play();
    if(!tracker){
      const {FilesetResolver,HandLandmarker}=await import('./vendor/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
      const options={baseOptions:{modelAssetPath:new URL('./vendor/hand_landmarker.task',import.meta.url).href,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.65,minHandPresenceConfidence:.65,minTrackingConfidence:.65};
      try{tracker=await HandLandmarker.createFromOptions(files,options);}catch{options.baseOptions.delegate='CPU';tracker=await HandLandmarker.createFromOptions(files,options);}
    }
    if(epoch!==cameraEpoch){incoming.getTracks().forEach(t=>t.stop());return;}
    setMode('camera');dismissIntro();hand.reset();lastVideoTime=-1;lastInference=0;
    video.style.aspectRatio=`${video.videoWidth}/${video.videoHeight}`;$('handOverlay').style.aspectRatio=video.style.aspectRatio;
    $('handOverlay').width=video.videoWidth;$('handOverlay').height=video.videoHeight;
    $('cameraPreview').hidden=!$('previewToggle').checked;cameraControls(true);hint('让整只手进入镜头，光点就是你的落点');
    stream.getVideoTracks()[0].onended=()=>{stopCamera();notify('摄像头连接已断开，可以重新开启，或继续使用鼠标。');};
  }catch(error){
    incoming?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;cameraControls(false);
    const name=error?.name;notify(name==='NotAllowedError'?'摄像头未获授权。允许浏览器访问摄像头后可重试，也可以先用鼠标体验。':name==='NotFoundError'?'没有检测到摄像头，请连接摄像头后重试。':'手势识别暂时未能启动，请刷新后重试。也可以先用鼠标体验。');
    hint('可重新开启摄像头，或先用鼠标体验');
  }finally{starting=false;$('startCamera').disabled=false;$('startCamera').querySelector('span').textContent='开启手势体验';}
}
function drawHand(lm){
  const c=$('handOverlay'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!lm)return;
  const point=p=>({x:(hand.mirror?1-p.x:p.x)*c.width,y:p.y*c.height});
  ctx.strokeStyle='rgba(249,241,232,.72)';ctx.lineWidth=2.2;
  const chains=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
  for(const chain of chains){ctx.beginPath();chain.forEach((i,j)=>{const p=point(lm[i]);j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();}
  for(const i of [4,8]){const p=point(lm[i]);ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle='#f1dbce';ctx.fill();}
}
function updateHint(input){
  if(mode!=='camera')return;
  $('trackingDot').classList.toggle('tracked',!!input.tracked);
  $('trackingLabel').textContent=input.tracked?'指尖已定位':'寻找你的手';
  if(!input.tracked){hint('让整只手回到镜头里');return;}
  if(garden.held)hint('花在指尖 · 松开，让花瓣乘风');
  else if(input.mode==='pinch')hint('将光点移到花上，再轻轻捏合');
  else if(input.mode==='palm')hint('花境已醒 · 张掌轻扫，春风经过');
  else if(input.mode==='point')hint('食指所至，花开成径');
  else hint('食指开花 · 捏合摘花 · 张掌迎风');
}
function frame(now){
  const dt=Math.min((now-frameTime)/1000,.05);frameTime=now;
  if(mode==='camera'&&tracker&&video.readyState>=2&&video.currentTime!==lastVideoTime&&now-lastInference>=32&&!document.hidden){
    lastVideoTime=video.currentTime;lastInference=now;
    try{
      const result=tracker.detectForVideo(video,now);rawHand=result.landmarks?.[0]??null;
      const input=hand.read(rawHand,now,innerWidth,innerHeight,video.videoWidth/video.videoHeight);
      if(calibrationStage<0)garden.apply(input);else garden.cursor=input.point??null;
      if(!$('cameraPreview').hidden)drawHand(rawHand);updateHint(input);
    }catch{stopCamera();notify('手势识别中断，已切换为鼠标体验。可再次开启摄像头。');}
  }
  if(initialized){garden.tick(dt);renderer.draw();}
  requestAnimationFrame(frame);
}
garden.onEvent=event=>{if(mode==='mouse')hint(event==='pick'?'拿住了 · 移动鼠标，再松开':'花瓣乘风而去 · 继续与另一朵相遇');};
function mouseInput(p,down=false,up=false){
  const now=performance.now(),dt=lastMouse?Math.max(.008,(now-lastMouse.t)/1000):.033;
  const velocity=lastMouse?{x:(p.x-lastMouse.x)/dt,y:(p.y-lastMouse.y)/dt}:{x:0,y:0};
  garden.apply({mode:mouseDown?'pinch':space?'palm':'point',point:p,palm:p,velocity,down,up,tracked:true});
  lastMouse={...p,t:now};mousePoint=p;
}
canvas.addEventListener('pointermove',e=>{if(mode==='mouse')mouseInput({x:e.clientX,y:e.clientY});});
canvas.addEventListener('pointerdown',e=>{if(mode!=='mouse'||e.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);mouseDown=true;mouseInput({x:e.clientX,y:e.clientY},true,false);});
canvas.addEventListener('pointerup',e=>{if(mode!=='mouse'||!mouseDown)return;mouseDown=false;mouseInput({x:e.clientX,y:e.clientY},false,true);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener('pointercancel',()=>{mouseDown=false;garden.cancel();});
canvas.addEventListener('pointerleave',()=>{if(mode==='mouse'&&!mouseDown){garden.cursor=null;garden.hover=null;garden.previous=null;lastMouse=null;}});
function releaseInputs(){mouseDown=false;space=false;lastMouse=null;garden.cancel();garden.previous=null;}
addEventListener('blur',releaseInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInputs();hand.reset();}});
addEventListener('keydown',e=>{if(e.target.closest('input,button,a'))return;if(mode==='mouse'&&e.code==='Space'){e.preventDefault();space=true;mouseInput(mousePoint);}if(e.code==='KeyR')garden.reset();if(e.code==='Escape'){['help','settings'].forEach(id=>$(id).hidden=true);cancelCalibration();}});
addEventListener('keyup',e=>{if(e.code==='Space'){space=false;if(mode==='mouse')mouseInput(mousePoint);}});
let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{garden.resize(innerWidth,innerHeight);renderer.resize();hand.reset();},120);});
$('startCamera').addEventListener('click',startCamera);
$('cameraToggle').addEventListener('click',()=>{if(mode==='camera')stopCamera();else startCamera();});
$('startMouse').addEventListener('click',()=>{stopCamera();setMode('mouse');dismissIntro();canvas.focus({preventScroll:true});hint('移动开花 · 按住拿起 · 松开散瓣');});
$('reset').addEventListener('click',()=>{garden.reset();hand.reset();hint(mode==='camera'?'春天重新开始，伸出食指试试':'移动开花 · 按住拿起 · 松开散瓣');});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('当前浏览器不支持全屏，请使用浏览器的全屏功能。');}});
for(const panel of ['help','settings']){$(panel+'Toggle').addEventListener('click',()=>{const show=$(panel).hidden;['help','settings'].forEach(id=>$(id).hidden=true);$(panel).hidden=!show;});}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).hidden=true));
$('mirror').addEventListener('change',()=>{hand.mirror=$('mirror').checked;hand.calibration={x0:0,y0:0,x1:1,y1:1};hand.reset();garden.cancel();video.classList.toggle('unmirrored',!hand.mirror);});
$('previewToggle').addEventListener('change',()=>{$('cameraPreview').hidden=mode!=='camera'||!$('previewToggle').checked;});
$('hidePreview').addEventListener('click',()=>{$('previewToggle').checked=false;$('cameraPreview').hidden=true;});
function cancelCalibration(){calibrationStage=-1;calibrationStart=null;$('calibration').hidden=true;hand.reset();garden.cancel();}
$('calibrate').addEventListener('click',()=>{if(mode!=='camera'){notify('先开启摄像头，再校准手指活动范围。');return;}$('settings').hidden=true;calibrationStage=0;garden.cancel();$('calibrationTitle').textContent='把食指移到舒适范围的左上角';$('calibrationHint').textContent='保持食指伸直，按空格或点击记录。';$('recordCalibration').textContent='记录左上角';$('calibration').hidden=false;});
function recordCalibration(){
  if(calibrationStage<0)return;
  if(!rawHand||!handFeatures(rawHand,video.videoWidth/video.videoHeight)?.point){notify('请先伸出食指并保持在镜头内，再记录位置。');return;}
  const p={x:hand.mirror?1-rawHand[8].x:rawHand[8].x,y:rawHand[8].y};
  if(calibrationStage===0){calibrationStart=p;calibrationStage=1;$('calibrationTitle').textContent='现在，把食指移到舒适范围的右下角';$('recordCalibration').textContent='记录右下角并完成';}
  else if(p.x-calibrationStart.x<.25||p.y-calibrationStart.y<.25){notify('两次位置太近，或方向相反。请向右下移动食指，让活动范围更大一些。');}
  else{hand.calibration={x0:calibrationStart.x,y0:calibrationStart.y,x1:p.x,y1:p.y};cancelCalibration();notify('定位已校准。指尖光点现在覆盖你选择的活动范围。');}
}
$('recordCalibration').addEventListener('click',recordCalibration);$('cancelCalibration').addEventListener('click',cancelCalibration);
addEventListener('keydown',e=>{if(calibrationStage>=0&&e.code==='Space'&&!e.repeat){e.preventDefault();recordCalibration();}});
$('clearCalibration').addEventListener('click',()=>{hand.calibration={x0:0,y0:0,x1:1,y1:1};hand.reset();notify('已恢复默认定位。');});
addEventListener('pagehide',()=>{stopCamera();tracker?.close();tracker=null;});
try{await renderer.load();initialized=true;garden.tick(0);renderer.draw();$('loading').style.opacity='0';setTimeout(()=>{$('loading').hidden=true;},650);}
catch{$('loading').hidden=true;notify('花朵素材未能载入，请刷新页面重试。');}
requestAnimationFrame(frame);
// Read-only state surface for local smoke checks; never supplies fake camera results.
window.__garden={get state(){return{mode,count:garden.flowers.length,bloomed:garden.flowers.filter(f=>f.target===1).length,held:garden.held?.id??null,petals:garden.particles.length,ready:initialized};}};
