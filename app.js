const $ = (id) => document.getElementById(id);
let selectedFile = null;
let analysis = null;
let currentStep = 0;
let toastTimer = null;

const fileInput = $('fileInput');
const downloadNameInput = $('downloadName');
function updateDownloadNameHint() {
  const isHuff = selectedFile && /\\.huff$/i.test(selectedFile.name);
  $('nameExtension').textContent = isHuff ? 'original file' : '.huff';
  $('downloadNameHint').textContent = isHuff
    ? 'For decompression, enter the name for your restored file. Leave blank to use a suggested name.'
    : 'The .huff extension is added automatically when you compress. Leave blank to use the original file name.';
}
downloadNameInput.addEventListener('input', () => {
  downloadNameInput.classList.toggle('has-value', downloadNameInput.value.trim().length > 0);
});
const dropzone = $('dropzone');
fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  const f = e.dataTransfer.files[0]; if (f) setFile(f);
});
function setFile(file) {
  selectedFile = file || null;
  analysis = null;
  $('analyzeBtn').disabled = !file;
  $('compressBtn').disabled = !file;
  $('decompressBtn').disabled = !file || !/\.huff$/i.test(file.name);
  $('fileTitle').innerHTML = file ? escapeHtml(file.name) : 'Drop a file here, or <u>browse</u>';
  $('fileSub').textContent = file ? `${formatBytes(file.size)} · Ready to process` : 'Any file type · Maximum 20 MB';
  $('fileChip').hidden = !file;
  $('fileChip').textContent = file ? `${formatBytes(file.size)} selected` : '';
  $('results').hidden = true;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatBytes(n) {
  if (n === 0) return '0 B';
  const units = ['B','KB','MB','GB']; const i = Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);
  return `${(n/Math.pow(1024,i)).toFixed(i===0?0:2)} ${units[i]}`;
}
function showToast(message, error=false) {
  const t=$('toast'); t.textContent=message; t.className='toast show'+(error?' error':'');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className='toast',5000);
}
function byteLabel(c) {
  if (c===32) return 'SPACE'; if(c===9)return 'TAB'; if(c===10)return 'LF'; if(c===13)return 'CR';
  return c>=33&&c<=126?String.fromCharCode(c):'0x'+c.toString(16).toUpperCase().padStart(2,'0');
}
function buildHuffman(bytes) {
  const freq=Array(256).fill(0); for(const b of bytes)freq[b]++;
  let id=1, name=1;
  const nodes=[];
  const less=(a,b)=>a.freq-b.freq || a.minSymbol-b.minSymbol || a.id-b.id;
  const heap=[];
  function push(n){heap.push(n);let i=heap.length-1;while(i){let p=(i-1)>>1;if(less(heap[p],n)<=0)break;heap[i]=heap[p];i=p;}heap[i]=n;}
  function pop(){const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let l=i*2+1,r=l+1,s=i;if(l<heap.length&&less(heap[l],last)<0)s=l;if(r<heap.length&&less(heap[r],s===i?last:heap[s])<0)s=r;if(s===i)break;heap[i]=heap[s];i=s;}heap[i]=last;}return out;}
  for(let i=0;i<256;i++)if(freq[i]){const n={id:id++,symbol:i,label:byteLabel(i),freq:freq[i],minSymbol:i,left:null,right:null};nodes.push(n);push(n);}
  const merges=[];
  while(heap.length>1){const left=pop(),right=pop(),parent={id:id++,symbol:null,label:'N'+name++,freq:left.freq+right.freq,minSymbol:Math.min(left.minSymbol,right.minSymbol),left,right};nodes.push(parent);merges.push({step:merges.length+1,left,right,parent});push(parent);}
  const root=heap.length?pop():null, codes=Array(256).fill('');
  function walk(n,path){if(!n)return;if(n.symbol!==null){codes[n.symbol]=path||'0';return;}walk(n.left,path+'0');walk(n.right,path+'1');}walk(root,'');
  const frequencies=[];for(let i=0;i<256;i++)if(freq[i])frequencies.push({symbol:byteLabel(i),byte:i,frequency:freq[i],code:codes[i],codeLength:codes[i].length});
  return {totalBytes:bytes.length,uniqueCount:frequencies.length,frequencies,merges,root,freq,codes};
}
function encodeHuff(bytes, a){const out=new Uint8Array(4+256*8+Math.ceil(bytes.reduce((n,b)=>n+a.codes[b].length,0)/8));out.set([72,70,90,49],0);let p=4;for(let i=0;i<256;i++){let v=BigInt(a.freq[i]);for(let b=0;b<8;b++){out[p++]=Number(v&255n);v>>=8n;}}let cur=0,bits=0;for(const b of bytes)for(const ch of a.codes[b]){cur=(cur<<1)|(ch==='1'?1:0);bits++;if(bits===8){out[p++]=cur;cur=0;bits=0;}}if(bits)out[p++]=cur<<(8-bits);return out.slice(0,p);}
function decodeHuff(data){if(data.length<2052||String.fromCharCode(...data.slice(0,4))!=='HFZ1')throw new Error('Invalid HuffZip file.');let p=4,freq=Array(256).fill(0),total=0;for(let i=0;i<256;i++){let v=0n;for(let b=0;b<8;b++)v|=BigInt(data[p++])<<(8n*BigInt(b));freq[i]=Number(v);total+=freq[i];}/* Rebuild the tree directly from stored frequencies. */
 let id=1,name=1,heap=[];const less=(a,b)=>a.freq-b.freq||a.minSymbol-b.minSymbol||a.id-b.id;function push(n){heap.push(n);let i=heap.length-1;while(i){let q=(i-1)>>1;if(less(heap[q],n)<=0)break;heap[i]=heap[q];i=q;}heap[i]=n;}function pop(){const o=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let l=i*2+1,r=l+1,s=i;if(l<heap.length&&less(heap[l],last)<0)s=l;if(r<heap.length&&less(heap[r],s===i?last:heap[s])<0)s=r;if(s===i)break;heap[i]=heap[s];i=s;}heap[i]=last;}return o;}for(let i=0;i<256;i++)if(freq[i])push({id:id++,symbol:i,label:byteLabel(i),freq:freq[i],minSymbol:i,left:null,right:null});while(heap.length>1){let l=pop(),r=pop();push({id:id++,symbol:null,label:'N'+name++,freq:l.freq+r.freq,minSymbol:Math.min(l.minSymbol,r.minSymbol),left:l,right:r});}let root=heap.length?pop():null;const out=new Uint8Array(total);if(!total)return out;if(root&&!root.left&&!root.right){out.fill(root.symbol);return out;}let written=0,cur=root;for(;p<data.length&&written<total;p++){for(let b=7;b>=0&&written<total;b--){cur=((data[p]>>b)&1)?cur.right:cur.left;if(!cur)throw new Error('Invalid compressed data.');if(cur.symbol!==null){out[written++]=cur.symbol;cur=root;}}}if(written!==total)throw new Error('Compressed data ended unexpectedly.');return out;}
function downloadBytes(bytes,name){const blob=new Blob([bytes],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function sendFile(action) {
 if(!selectedFile){showToast('Choose a file first.',true);return null;}
 const button=action==='analyze'?$('analyzeBtn'):action==='compress'?$('compressBtn'):$('decompressBtn');const old=button.innerHTML;button.disabled=true;button.classList.add('loading');button.innerHTML='<span>Working…</span>';
 try {const bytes=new Uint8Array(await selectedFile.arrayBuffer());if(bytes.length>20*1024*1024)throw new Error('Maximum file size is 20 MB for this demo.');
  if(action==='decompress'){const result=decodeHuff(bytes);let name=selectedFile.name.replace(/\.huff$/i,'')||'restored.bin';downloadBytes(result,name);return {ok:true,name};}
  const a=buildHuffman(bytes);if(action==='analyze')return {...a,ok:true};
  const compressed=encodeHuff(bytes,a);let name=($('downloadName')?.value||downloadNameInput?.value||'').trim()||selectedFile.name.replace(/\.[^.]*$/,'')+'.huff';name=name.replace(/[^A-Za-z0-9._ -]/g,'_');if(!/\.huff$/i.test(name))name+='.huff';downloadBytes(compressed,name);return {ok:true,name,compressedSize:compressed.length};
 }catch(e){showToast(e.message||'Something went wrong.',true);return null;}finally{button.disabled=false;button.classList.remove('loading');button.innerHTML=old;}
}
$('analyzeBtn').addEventListener('click', async () => {
  const data = await sendFile('analyze'); if (!data) return;
  analysis=data; currentStep=0; renderAnalysis(); $('results').hidden=false;
  $('results').scrollIntoView({behavior:'smooth',block:'start'});
  showToast('Frequency analysis complete. Step through the tree construction.');
});
$('compressBtn').addEventListener('click', async () => {
  const data=await sendFile('compress'); if(!data)return;
  showToast(`Compressed file ready: ${data.name}`);
  // The file was downloaded directly by the browser.
});
$('decompressBtn').addEventListener('click', async () => {
  const data=await sendFile('decompress'); if(!data)return;
  showToast('Original file restored and ready to download.');
  // The file was downloaded directly by the browser.
});
$('prevBtn').addEventListener('click',()=>{if(currentStep>0){currentStep--;renderStep();}});
$('nextBtn').addEventListener('click',()=>{if(analysis && currentStep<analysis.merges.length){currentStep++;renderStep();}});
$('showAllBtn').addEventListener('click',()=>{if(analysis){currentStep=analysis.merges.length;renderStep();}});
function renderAnalysis() {
  $('totalChars').textContent=`${analysis.totalBytes.toLocaleString()} BYTES`;
  $('uniqueCount').textContent=analysis.uniqueCount.toLocaleString();
  $('totalBytes').textContent=formatBytes(analysis.totalBytes);
  $('mergeCount').textContent=analysis.merges.length.toLocaleString();
  $('frequencyBody').innerHTML=analysis.frequencies.map(f=>`<tr><td><span class="symbol-chip">${escapeHtml(f.symbol)}</span></td><td class="mono">${f.byte}</td><td class="frequency-cell">${f.frequency.toLocaleString()}</td><td><div class="frequency-bar"><i style="width:${analysis.totalBytes?Math.max(2,100*f.frequency/analysis.totalBytes):0}%"></i></div><span class="relative-value">${analysis.totalBytes?(100*f.frequency/analysis.totalBytes).toFixed(2):'0.00'}%</span></td></tr>`).join('') || '<tr><td colspan="4">This file is empty; there are no frequencies to display.</td></tr>';
  $('codesBody').innerHTML=analysis.frequencies.map(f=>`<tr><td><span class="symbol-chip">${escapeHtml(f.symbol)}</span></td><td>${f.frequency.toLocaleString()}</td><td><code class="huff-code">${f.code || '—'}</code></td><td>${f.codeLength}</td></tr>`).join('') || '<tr><td colspan="4">No codes for an empty file.</td></tr>';
  $('successNote').hidden=false;
  renderStep();
}
function renderStep() {
  if(!analysis)return;
  const total=analysis.merges.length;
  const step=currentStep;
  $('prevBtn').disabled=step===0;
  $('nextBtn').disabled=step>=total;
  $('progressFill').style.width=(total?100*step/total:100)+'%';
  $('progressText').textContent=total?`Step ${step} of ${total}`:'No merges required';
  $('stepBadge').textContent=step===0?'START':step===total?'COMPLETE':`STEP ${step}`;
  if(step===0) {
    $('stepTitle').textContent='Initial leaf nodes';
    $('stepDescription').textContent=total ? 'Every distinct byte starts as a leaf node. At each step, the two available nodes with the lowest frequencies are selected.' : analysis.uniqueCount===0 ? 'The file is empty, so no tree nodes are needed.' : 'Only one distinct symbol is present, so the tree is a single leaf and no merge is needed.';
    $('mergeEquation').innerHTML=analysis.frequencies.slice(0,8).map(f=>`<span class="eq-node">${escapeHtml(f.symbol)} · ${f.frequency}</span>`).join('')+(analysis.frequencies.length>8?'<span class="eq-node">…</span>':'');
  } else {
    const m=analysis.merges[step-1];
    $('stepTitle').textContent=`Combine the two minimum nodes`;
    $('stepDescription').textContent=`Select ${m.left.label} (${m.left.freq}) and ${m.right.label} (${m.right.freq}). Add their frequencies to create a new parent node. The new node returns to the set of available nodes.`;
    $('mergeEquation').innerHTML=`<span class="eq-node">${escapeHtml(m.left.label)} · ${m.left.freq}</span><span class="eq-plus">+</span><span class="eq-node">${escapeHtml(m.right.label)} · ${m.right.freq}</span><span class="eq-equals">=</span><span class="eq-node eq-result">${escapeHtml(m.parent.label)} · ${m.parent.freq}</span>`;
  }
  $('treeTitle').textContent=step===total?'Final Huffman tree':step===0?'Initial nodes':`Tree after merge ${step}`;
  $('treeSubtitle').textContent=step===total?'All minimum-frequency combinations are complete. Follow the 0/1 paths to read each code.':'Highlighted nodes show the current merge; the remaining branches show the tree built so far.';
  drawTree(step);
}
function buildVisibleTree(step) {
  if (!analysis || !analysis.root) return null;
  if (step >= analysis.merges.length) return analysis.root;
  const byId = new Map();
  function collect(n) {
    if (!n) return;
    byId.set(n.id, n);
    collect(n.left); collect(n.right);
  }
  collect(analysis.root);
  const available = new Set();
  analysis.frequencies.forEach(f => {
    const leaf = findLeafBySymbol(analysis.root, f.byte);
    if (leaf) available.add(leaf.id);
  });
  for (let i = 0; i < step; i++) {
    const m = analysis.merges[i];
    available.delete(m.left.id);
    available.delete(m.right.id);
    available.add(m.parent.id);
  }
  return {forest: [...available].map(id => byId.get(id)).filter(Boolean)};
}
function findLeafBySymbol(n, symbol) {
  if (!n) return null;
  if (n.symbol === symbol) return n;
  return findLeafBySymbol(n.left, symbol) || findLeafBySymbol(n.right, symbol);
}
function findNodeById(root,id){if(!root)return null;if(root.id===id)return root;return findNodeById(root.left,id)||findNodeById(root.right,id);}
function drawTree(step) {
  const canvas=$('treeCanvas');
  if(!analysis.root) {canvas.innerHTML='<div class="tree-empty">The file is empty, so there is no tree to draw.</div>';return;}
  if(analysis.uniqueCount===1 && analysis.merges.length===0) {
    canvas.innerHTML=''; const root=analysis.root;
    const n=document.createElement('div');n.className='single-tree-node leaf-node';n.innerHTML=`<strong>${escapeHtml(root.label)}</strong><span>${root.freq}</span>`;canvas.appendChild(n);return;
  }
  const visible=buildVisibleTree(step);
  let roots=visible && visible.forest ? visible.forest : [visible || analysis.root];
  roots=roots.filter(Boolean);
  if(!roots.length){canvas.innerHTML='<div class="tree-empty">No nodes to display.</div>';return;}
  const layout={nodes:[],edges:[],width:Math.max(760,roots.length*150),height:Math.max(260, (analysis.uniqueCount>12?520:360))};
  let cursor=28;
  const leafGap=82, levelGap=82, nodeW=68, nodeH=54;
  function leafCount(n){return !n.left&&!n.right?1:leafCount(n.left)+leafCount(n.right);}
  function place(n,depth) {
    if(!n)return {x:0,y:0};
    let x;
    if(!n.left&&!n.right){x=cursor;cursor+=leafGap;}
    else {const l=place(n.left,depth+1),r=place(n.right,depth+1);x=(l.x+r.x)/2;}
    const y=34+depth*levelGap;
    layout.nodes.push({n,x,y});
    if(n.left)layout.edges.push({x1:x,y1:y+nodeH/2,x2:layout.nodes.find(v=>v.n===n.left).x,y2:y+levelGap-nodeH/2,bit:'0'});
    if(n.right)layout.edges.push({x1:x,y1:y+nodeH/2,x2:layout.nodes.find(v=>v.n===n.right).x,y2:y+levelGap-nodeH/2,bit:'1'});
    return {x,y};
  }
  // Place each separate forest root side by side.
  roots.forEach((r,i)=>{place(r,0);cursor+=24;});
  layout.width=Math.max(layout.width,cursor+20);
  const maxDepth=Math.max(...layout.nodes.map(v=>v.y));
  layout.height=Math.max(200,maxDepth+nodeH+35);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${layout.width} ${layout.height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Huffman tree visualization');svg.classList.add('tree-svg');
  layout.edges.forEach(e=>{
    const line=document.createElementNS(ns,'line');line.setAttribute('x1',e.x1);line.setAttribute('y1',e.y1);line.setAttribute('x2',e.x2);line.setAttribute('y2',e.y2);line.setAttribute('class','tree-edge');svg.appendChild(line);
    const t=document.createElementNS(ns,'text');t.setAttribute('x',(e.x1+e.x2)/2+(e.bit==='0'?-11:11));t.setAttribute('y',(e.y1+e.y2)/2);t.setAttribute('class','edge-bit');t.textContent=e.bit;svg.appendChild(t);
  });
  layout.nodes.forEach(({n,x,y})=>{
    const g=document.createElementNS(ns,'g');g.setAttribute('transform',`translate(${x},${y})`);g.setAttribute('class',`tree-node ${n.symbol!==null?'leaf-node':'internal-node'} ${n.preview?'preview-node':''}`);
    const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',-nodeW/2);rect.setAttribute('y',-nodeH/2);rect.setAttribute('width',nodeW);rect.setAttribute('height',nodeH);rect.setAttribute('rx',12);g.appendChild(rect);
    const label=document.createElementNS(ns,'text');label.setAttribute('x',0);label.setAttribute('y',-2);label.setAttribute('class','node-label');label.textContent=n.label;g.appendChild(label);
    const freq=document.createElementNS(ns,'text');freq.setAttribute('x',0);freq.setAttribute('y',16);freq.setAttribute('class','node-frequency');freq.textContent=n.freq;g.appendChild(freq);
    svg.appendChild(g);
  });
  canvas.innerHTML='';canvas.appendChild(svg);
  if(step<analysis.merges.length) {
    const hint=document.createElement('div');hint.className='tree-hint';hint.textContent=`Showing ${roots.length} available node${roots.length===1?'':'s'} after ${step} merge${step===1?'':'s'}. Continue to combine the next two minimum-frequency nodes.`;canvas.appendChild(hint);
  }
}
