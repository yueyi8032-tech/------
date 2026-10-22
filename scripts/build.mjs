import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';

const vendor=new URL('../dist/vendor/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('provenance.json',vendor),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of manifest.files){
  const destination=new URL(file.path,vendor);
  try{
    const existing=await readFile(destination);
    if(existing.length===file.bytes&&hash(existing)===file.sha256){console.log(`Verified ${file.path}`);continue;}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const source=file.path==='hand_landmarker.task'?manifest.modelSource:
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${manifest.version}/${file.path}`;
  let bytes;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(source,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error(`HTTP ${response.status} for ${file.path}`);
      bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new Error(`Integrity check failed: ${file.path}`);
      break;
    }catch(error){if(attempt===3)throw error;await new Promise(resolve=>setTimeout(resolve,2000*attempt));}
  }
  await mkdir(new URL('.',destination),{recursive:true});
  await writeFile(destination,bytes);
  console.log(`Downloaded and verified ${file.path}`);
}
console.log('Ready to publish dist/.');
