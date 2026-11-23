/**
 * Download public-domain (CC0) dorsal specimen textures for same-origin use.
 * Source photographs: NSG group, Lund University, available on Commons.
 *   Papilio xuthus: MZLU-00129145 dorsal (51008259851).jpg
 *   Pieris rapae:  MZLU-00129165 dorsal (51008850721).jpg
 * This is used by npm prebuild. Missing network access does not break builds:
 * ButterflyVisit.astro falls back to Wikimedia-hosted copies.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output=path.join(process.cwd(),'public','butterflies');
const photos=[
  {
    name:'papilio-xuthus.jpg',
    thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/MZLU-00129145_dorsal_%2851008259851%29.jpg/960px-MZLU-00129145_dorsal_%2851008259851%29.jpg',
    original:'https://upload.wikimedia.org/wikipedia/commons/b/ba/MZLU-00129145_dorsal_%2851008259851%29.jpg'
  },
  {
    name:'pieris-rapae.jpg',
    thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/MZLU-00129165_dorsal_%2851008850721%29.jpg/960px-MZLU-00129165_dorsal_%2851008850721%29.jpg',
    original:'https://upload.wikimedia.org/wikipedia/commons/1/10/MZLU-00129165_dorsal_%2851008850721%29.jpg'
  }
];
await mkdir(output,{recursive:true});
for(const photo of photos){
  const dest=path.join(output,photo.name);
  try {
    const buf=await readFile(dest);
    if(buf.length>5000&&buf[0]===0xff&&buf[1]===0xd8) {
      console.log('Using cached CC0 specimen: '+photo.name);continue;
    }
  }catch{}
  let downloaded=false;
  for(const uri of [photo.thumb,photo.original]){
    try {
      const res=await fetch(uri,{
        headers:{'User-Agent':'SCD-KU-Research-Lab-Site/1.0 (university academic web site; CC0 specimen use)'},
        signal:AbortSignal.timeout(18000)
      });
      if(!res.ok)throw new Error('HTTP '+res.status);
      const buf=Buffer.from(await res.arrayBuffer());
      if(buf.length<5000||buf[0]!==0xff||buf[1]!==0xd8)
        throw new Error('Downloaded content is not a JPEG');
      const tmp=dest+'.tmp';
      await writeFile(tmp,buf);
      await rename(tmp,dest);
      console.log('Cached '+photo.name+' ('+buf.length+' bytes, CC0)');
      downloaded=true;break;
    }catch(error){console.warn('Specimen download failed: '+photo.name+' ('+String(error)+')');}
  }
  if(!downloaded)console.warn('The runtime will use external Wikimedia URL for '+photo.name);
}
