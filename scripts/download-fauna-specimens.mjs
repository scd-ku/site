/**
 * Download responsibly licensed animal reference photos before Astro builds.
 * Photo is drawn only inside the moving creature when a cursor overlaps it.
 *
 * Chicken: Simplybrittney, "Mille Fleur d'Uccle Bantam Hen running.jpg",
 * https://commons.wikimedia.org/wiki/File:Mille_Fleur_d%27Uccle_Bantam_Hen_running.jpg
 * CC0 1.0; no attribution required (provided in source for transparency).
 *
 * Japanese tree frog: Warehadokuro,
 * "Japanese tree frog (Hyla japonica), green.jpg"
 * https://commons.wikimedia.org/wiki/File:Japanese_tree_frog_(Hyla_japonica),_green.jpg
 * CC BY-SA 4.0; author and license credited visibly in site footer.
 * Both photographs are clipped by our original vector silhouettes.
 */
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const out=path.join(process.cwd(),'public','fauna');
await mkdir(out,{recursive:true});
const items=[
  {name:"Mille Fleur d'Uccle Bantam Hen running.jpg",dest:'chicken.jpg'},
  {name:'Japanese tree frog (Hyla japonica), green.jpg',dest:'japanese-tree-frog.jpg'}
];
for(const f of items){
  const filename=f.name.replace(/ /g,'_');
  const hash=createHash('md5').update(filename).digest('hex');
  const url='https://upload.wikimedia.org/wikipedia/commons/'+hash[0]+'/'+hash.slice(0,2)+'/'+encodeURIComponent(filename);
  const thumb='https://upload.wikimedia.org/wikipedia/commons/thumb/'+hash[0]+'/'+hash.slice(0,2)+'/'+encodeURIComponent(filename)+'/640px-'+encodeURIComponent(filename);
  const dest=path.join(out,f.dest);
  try{
    const buf=await readFile(dest);
    if(buf.length>5000&&buf[0]===0xff&&buf[1]===0xd8){
      console.log('Using cached licensed fauna photo '+f.dest);
      continue;
    }
  }catch{}
  let downloaded=false;
  for(const candidate of [thumb,url]){
    try{
      const response=await fetch(candidate,{
        headers:{'User-Agent':'SCD-KU-Lab-Web/1.0 (Academic use, Wikimedia Commons cited; photo cache)'},
        signal:AbortSignal.timeout(16000)
      });
      if(!response.ok)throw Error('HTTP '+response.status);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length<5000||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Not JPEG');
      const temp=dest+'.tmp';
      await writeFile(temp,bytes);
      await rename(temp,dest);
      downloaded=true;
      console.log('Photo cached: '+f.dest+' ('+bytes.length+' bytes)');
      break;
    }catch(e){console.warn('Fauna photo URL unavailable: '+String(e));}
  }
  if(!downloaded)console.warn('Photo '+f.dest+' not cached; site may use Wikimedia file URL fallback.');
}
