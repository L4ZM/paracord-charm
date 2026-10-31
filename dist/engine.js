/* Browser-local geometry and export engine. Millimetres throughout. */
(function(root){'use strict';
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const hex=c=>'#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
function removeExterior(data,w,h,tolerance,chosen){
 const out=new Uint8ClampedArray(data),hist=new Map();
 if(!chosen){for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>1&&x<w-2&&y>1&&y<h-2)continue;let i=(y*w+x)*4;if(data[i+3]<128)continue;let k=(data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4);let a=hist.get(k)||[0,0,0,0];a[0]++;for(let j=0;j<3;j++)a[j+1]+=data[i+j];hist.set(k,a);}let best=[0,255,255,255];for(const a of hist.values())if(a[0]>best[0])best=a;chosen=best[0]?best.slice(1).map(v=>v/best[0]):[255,255,255];}
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;const match=i=>{let k=i*4;return data[k+3]<128||Math.hypot(data[k]-chosen[0],data[k+1]-chosen[1],data[k+2]-chosen[2])<=tolerance;};
 const add=i=>{if(!seen[i]&&match(i)){seen[i]=1;q[tail++]=i;}};for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}while(head<tail){let i=q[head++],x=i%w,y=(i/w)|0;out[i*4+3]=0;if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}return {data:out,bg:chosen};
}
function quantize(data,count){
 const hist=new Map();for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;const k=(data[i]>>3)*1024+(data[i+1]>>3)*32+(data[i+2]>>3);let a=hist.get(k)||[0,0,0,0];a[0]++;for(let j=0;j<3;j++)a[j+1]+=data[i+j];hist.set(k,a);}
 const pts=[...hist.values()].map(a=>({n:a[0],c:a.slice(1).map(v=>v/a[0])})).sort((a,b)=>b.n-a.n);if(!pts.length)return [];
 const centers=[pts[0].c.slice()];while(centers.length<count&&centers.length<pts.length){let best=null,score=-1;for(const p of pts){let d=Math.min(...centers.map(c=>c.reduce((s,v,j)=>s+(v-p.c[j])**2,0)))*Math.sqrt(p.n);if(d>score){score=d;best=p.c;}}centers.push(best.slice());}
 for(let k=0;k<14;k++){const sums=centers.map(()=>[0,0,0,0]);for(const p of pts){let idx=nearest(p.c,centers),s=sums[idx];s[0]+=p.n;for(let j=0;j<3;j++)s[j+1]+=p.c[j]*p.n;}sums.forEach((s,i)=>{if(s[0])centers[i]=s.slice(1).map(v=>v/s[0]);});}
 return centers.sort((a,b)=>(a[0]*.2126+a[1]*.7152+a[2]*.0722)-(b[0]*.2126+b[1]*.7152+b[2]*.0722)).map(hex);
}
function nearest(c,p){let idx=0,dist=Infinity;for(let i=0;i<p.length;i++){let d=p[i].reduce((s,v,j)=>s+(v-c[j])**2,0);if(d<dist){dist=d;idx=i;}}return idx;}
function labels(data,palette){let p=palette.map(rgb),a=new Int8Array(data.length/4).fill(-1);for(let i=0;i<a.length;i++)if(data[i*4+3]>=128)a[i]=nearest([data[i*4],data[i*4+1],data[i*4+2]],p);return a;}
function components(a,w,h,min=0){let seen=new Uint8Array(a.length),q=new Int32Array(a.length),groups=[];for(let i=0;i<a.length;i++){if(a[i]<0||seen[i])continue;let head=0,tail=0;q[tail++]=i;seen[i]=1;while(head<tail){const k=q[head++],x=k%w,y=(k/w)|0;const add=j=>{if(!seen[j]&&a[j]>=0){seen[j]=1;q[tail++]=j;}};if(x)add(k-1);if(x<w-1)add(k+1);if(y)add(k-w);if(y<h-1)add(k+w);}if(tail<min){for(let j=0;j<tail;j++)a[q[j]]=-1;}else groups.push(tail);}return groups.sort((a,b)=>b-a);}
// Suppress diagonal-only contact: these point contacts produce nonmanifold solids.
function fixDiagonals(a,w,h){let changed=0;for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){let i=y*w+x,A=a[i]>=0,B=a[i+1]>=0,C=a[i+w]>=0,D=a[i+w+1]>=0;if(A&&D&&!B&&!C){a[i+1]=a[i];changed++;}else if(B&&C&&!A&&!D){a[i]=a[i+1];changed++;}}return changed;}
function validateHeights(palette,layer){if(palette.length<1)throw Error('La imagen no tiene zonas visibles. Ajusta el fondo o carga otro archivo.');let heights=palette.map(p=>p.height);for(const z of heights){if(!Number.isFinite(z)||z<.8||z>12)throw Error('Usa alturas entre 0.8 y 12 mm.');if(Math.abs(z/layer-Math.round(z/layer))>1e-5)throw Error('Cada altura debe ser múltiplo de la altura de capa.');}if(new Set(heights).size!==heights.length)throw Error('Asigna una altura distinta a cada color.');return heights.slice().sort((a,b)=>a-b);}
// Shared XY deformation for every Z plane and every export band. Relax only
// degree-two contour vertices; preserve junctions and check all cell triangles.
function smoothContours(field,w,h,strength=.85){
 const stride=w+1,xy=new Float64Array(stride*(h+1)*2),neighbors=new Map();
 for(let y=0;y<=h;y++)for(let x=0;x<=w;x++){let i=(y*stride+x)*2;xy[i]=x;xy[i+1]=y;}
 const link=(a,b)=>{if(!neighbors.has(a))neighbors.set(a,new Set());if(!neighbors.has(b))neighbors.set(b,new Set());neighbors.get(a).add(b);neighbors.get(b).add(a);};
 const val=(x,y)=>x<0||y<0||x>=w||y>=h?0:field[y*w+x];
 for(let y=0;y<=h;y++)for(let x=0;x<w;x++)if(val(x,y-1)!==val(x,y))link(y*stride+x,y*stride+x+1);
 for(let y=0;y<h;y++)for(let x=0;x<=w;x++)if(val(x-1,y)!==val(x,y))link(y*stride+x,(y+1)*stride+x);
 const movable=[...neighbors].filter(([,n])=>n.size===2).map(([i,n])=>[i,...n]);
 const limit=.45*Math.max(0,Math.min(1,strength));
 for(let pass=0;pass<8&&limit>0;pass++){let next=[];for(const [i,a,b] of movable){let ox=i%stride,oy=(i/stride)|0;next.push([i,Math.max(ox-limit,Math.min(ox+limit,xy[i*2]*.35+(xy[a*2]+xy[b*2])*.325)),Math.max(oy-limit,Math.min(oy+limit,xy[i*2+1]*.35+(xy[a*2+1]+xy[b*2+1])*.325))]);}for(const [i,x,y] of next){xy[i*2]=x;xy[i*2+1]=y;}}
 const area=(a,b,c)=>(xy[b*2]-xy[a*2])*(xy[c*2+1]-xy[a*2+1])-(xy[b*2+1]-xy[a*2+1])*(xy[c*2]-xy[a*2]);
 // Guard narrow details against flipped/zero-area faces after relaxation.
 for(let pass=0;pass<8;pass++){let bad=new Set();for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=y*stride+x,b=a+1,d=a+stride,c=d+1;if(area(a,b,c)<.015||area(a,c,d)<.015){bad.add(a);bad.add(b);bad.add(c);bad.add(d);}}if(!bad.size)break;for(const i of bad){xy[i*2]=i%stride;xy[i*2+1]=(i/stride)|0;}}
 return xy;
}
function buildMesh(field,w,h,pitch,levels,band=null,contours=null){
 const positions=[],faces=[],vertexMap=new Map(),faceColors=[];
 const vertex=(x,y,k)=>{const key=(k*(h+1)+y)*(w+1)+x;let id=vertexMap.get(key);if(id!==undefined)return id;id=positions.length/3;vertexMap.set(key,id);const q=(y*(w+1)+x)*2;positions.push((contours?contours[q]:x)*pitch,(contours?contours[q+1]:y)*pitch,levels[k]);return id;};
 const quad=(a,b,c,d,color)=>{faces.push(a,b,c,a,c,d);faceColors.push(color,color);};
 const value=(x,y)=>x<0||y<0||x>=w||y>=h?0:field[y*w+x];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let top=value(x,y);if(!top||(band!==null&&top<band+1))continue;
  let lo=band===null?0:band,hi=band===null?top:band+1,col=hi-1;
  quad(vertex(x,y,hi),vertex(x+1,y,hi),vertex(x+1,y+1,hi),vertex(x,y+1,hi),col);
  quad(vertex(x,y,lo),vertex(x,y+1,lo),vertex(x+1,y+1,lo),vertex(x+1,y,lo),band===null?0:col);
  const sides=[{n:value(x,y-1),p:[[x,y],[x+1,y]]},{n:value(x+1,y),p:[[x+1,y],[x+1,y+1]]},{n:value(x,y+1),p:[[x+1,y+1],[x,y+1]]},{n:value(x-1,y),p:[[x,y+1],[x,y]]}];
  for(const s of sides){let bottom=band===null?s.n:((s.n>=hi)?hi:lo);for(let k=Math.max(lo,bottom);k<hi;k++){let [[ax,ay],[bx,by]]=s.p;quad(vertex(ax,ay,k),vertex(bx,by,k),vertex(bx,by,k+1),vertex(ax,ay,k+1),k);}}
 }
 return {positions:new Float32Array(positions),faces:new Uint32Array(faces),colors:new Uint8Array(faceColors)};
}
function stl(mesh){const {positions:p,faces:f}=mesh;const b=new ArrayBuffer(84+f.length/3*50),v=new DataView(b);new Uint8Array(b,0,80).set(new TextEncoder().encode('Paracord Charm | millimeters | layered relief'));v.setUint32(80,f.length/3,true);let o=84;for(let i=0;i<f.length;i+=3){let a=f[i]*3,c=f[i+1]*3,d=f[i+2]*3;let ux=p[c]-p[a],uy=p[c+1]-p[a+1],uz=p[c+2]-p[a+2],vx=p[d]-p[a],vy=p[d+1]-p[a+1],vz=p[d+2]-p[a+2];let n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx],len=Math.hypot(...n)||1;for(let j=0;j<3;j++)v.setFloat32(o+j*4,n[j]/len,true);o+=12;for(const idx of [a,c,d])for(let j=0;j<3;j++){v.setFloat32(o,p[idx+j],true);o+=4;}v.setUint16(o,0,true);o+=2;}return new Blob([b],{type:'application/sla'});}
const esc=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(a){let c=0xffffffff;for(const b of a)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(entries){const enc=new TextEncoder(),chunks=[],central=[];let offset=0;for(const [name,text] of entries){let n=enc.encode(name),data=typeof text==='string'?enc.encode(text):text,crc=crc32(data);const a=new Uint8Array(30+n.length),v=new DataView(a.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);a.set(n,30);chunks.push(a,data);const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=a.length+data.length;}
 const size=central.reduce((s,a)=>s+a.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'model/3mf'});}
function threeMF(meshes,palette,layer,target,guide){
 let objs=[],parts=[],components=[];for(let k=0;k<meshes.length;k++){const m=meshes[k],id=k+2;let v=[],t=[];for(let i=0;i<m.positions.length;i+=3)v.push(`<vertex x="${m.positions[i].toFixed(5)}" y="${m.positions[i+1].toFixed(5)}" z="${m.positions[i+2].toFixed(5)}"/>`);for(let i=0;i<m.faces.length;i+=3)t.push(`<triangle v1="${m.faces[i]}" v2="${m.faces[i+1]}" v3="${m.faces[i+2]}"/>`);objs.push(`<object id="${id}" type="model" name="Tramo ${k+1}" pid="1" pindex="${k}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`);components.push(`<component objectid="${id}"/>`);parts.push(`<part id="${id}" subtype="normal_part"><metadata key="name" value="${esc(palette[k].name)} — ${palette[k].height.toFixed(2)} mm"/><metadata key="extruder" value="${k+1}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/></part>`);}
 const rootId=meshes.length+2;const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">Paracord Charm</metadata><metadata name="Application">Paracord Charm</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Description">Relieve por alturas; seleccionar impresora y comprobar filamentos.</metadata><resources><basematerials id="1">${palette.map(p=>`<base name="${esc(p.name)}" displaycolor="${p.color.toUpperCase()}FF"/>`).join('')}</basematerials>${objs.join('')}<object id="${rootId}" type="model" name="Paracord Charm"><components>${components.join('')}</components></object></resources><build><item objectid="${rootId}"/></build></model>`;
 const config=`<?xml version="1.0" encoding="UTF-8"?><config><object id="${rootId}"><metadata key="name" value="Paracord Charm"/><metadata key="extruder" value="1"/>${parts.join('')}</object><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Paracord Charm"/><metadata key="locked" value="false"/><model_instance><metadata key="object_id" value="${rootId}"/><metadata key="instance_id" value="0"/></model_instance></plate></config>`;
 const settings={layer_height:String(layer),initial_layer_print_height:String(layer),filament_colour:palette.map(p=>p.color.toUpperCase()),filament_type:palette.map(()=>'PLA'),filament_settings_id:palette.map((p,i)=>`Paracord color ${i+1}`),filament_diameter:palette.map(()=>'1.75')};
 return zip([['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/><Default Extension="txt" ContentType="text/plain"/></Types>'],['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'],['3D/3dmodel.model',model],['Metadata/model_settings.config',config],['Metadata/project_settings.config',JSON.stringify(settings)],['Metadata/Paracord_instrucciones.txt',guide+`\nDestino seleccionado: ${target}.\n`]]);
}
root.CharmEngine={rgb,hex,removeExterior,quantize,labels,components,fixDiagonals,validateHeights,smoothContours,buildMesh,stl,threeMF,zip};if(typeof module!=='undefined')module.exports=root.CharmEngine;
})(typeof window!=='undefined'?window:globalThis);
