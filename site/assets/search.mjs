export const SYNONYMS = [
  ['机油','发动机油','润滑油','oil'], ['电瓶','蓄电池','电池','battery'],
  ['火嘴','火花塞','spark plug'], ['冷却液','防冻液','冷却剂'],
  ['刹车','制动','brake'], ['刹车片','制动摩擦片','制动衬块'],
  ['刹车油','制动液','制动油'], ['空调不凉','空调不制冷','制冷'],
  ['波箱','变速箱','变速器','gearbox'], ['双离合','pdk'],
  ['空调','制冷','冷气','kongtiao','ac'], ['避震','减震','减振','悬架'],
  ['轮胎','车轮','胎压','tire'], ['敞篷','软篷','活动顶篷','车顶','roof'],
  ['方向盘','转向盘'], ['异响','噪音','噪声'], ['打不着火','启动','起动'],
  ['皮带','传动带'], ['雨刷','刮水器','雨刮'], ['保险丝','熔断器'],
  ['大灯','前照灯'], ['尾灯','后灯'], ['后视镜','外后视镜'],
  ['汽油泵','燃油泵'], ['氧传感器','氧气传感器'], ['节气门','节流阀'],
  ['发动机','引擎','engine'], ['手刹','驻车制动'], ['拆装','拆卸和安装'],
];
export const normalize = text => String(text).toLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '');
export function relatedTerms(query) {
  const q = normalize(query);
  if (!q) return [];
  const exact=SYNONYMS.filter(group=>group.some(term=>normalize(term)===q));
  if(exact.length)return [...new Set(exact.flat().filter(term=>normalize(term)!==q))].slice(0,6);
  // Preserve surrounding words: 刹车盘 → 制动盘, 换电瓶 → 换蓄电池.
  const matches=SYNONYMS.flatMap(group=>group.filter(term=>/[\u3400-\u9fff]/.test(term) && q.includes(normalize(term))).map(term=>({group,term})))
    .sort((a,b)=>b.term.length-a.term.length);
  if(!matches.length)return [];
  const {group,term}=matches[0];
  return group.filter(other=>other!==term).map(other=>q.replace(normalize(term),other)).slice(0,6);
}
export function buildIndex(catalog) {
  const modules = new Map(catalog.modules.map(m => [m.id, m.name]));
  return catalog.documents.map(doc => ({...doc, moduleName: modules.get(doc.module) || '',
    _title: normalize(doc.title), _code: normalize(doc.code),
    _module: normalize(modules.get(doc.module) || '')}));
}
function oneEdit(a, b) {
  if (Math.abs(a.length-b.length)>1) return false;
  let i=0,j=0,errors=0;
  while(i<a.length && j<b.length) {
    if(a[i]===b[j]) {i++;j++;continue;}
    if(++errors>1) return false;
    if(a.length>=b.length)i++;
    if(b.length>=a.length)j++;
  }
  return errors + (i<a.length || j<b.length ? 1:0) <= 1;
}
function fuzzyContains(text, q) {
  if(q.length<2 || q.length>12) return false;
  // Two-character terms allow substitution, but not one-character matches.
  const sizes = q.length===2 ? [2] : [q.length-1,q.length,q.length+1];
  for(const size of sizes) for(let i=0;i<=text.length-size;i++) {
    if(oneEdit(text.slice(i,i+size),q)) return true;
  }
  return false;
}
export function searchDocuments(index, query, module='all') {
  const tokens = String(query).trim().replace(/\bwm\s+(?=[a-z0-9])/gi,'wm').split(/\s+/).map(normalize).filter(Boolean);
  const filtered = index.filter(d => module==='all' || d.module===module);
  if(!tokens.length) return filtered.map(doc => ({doc,score:0,match:'browse'}));
  const expansions=new Map(tokens.map(token=>[token,relatedTerms(token).map(normalize)]));
  const rows=[];
  for(const doc of filtered) {
    let score=0, valid=true, match='title';
    for(const token of tokens) {
      const code=token.replace(/^wm/, '');
      if(code && doc._code===code) score+=150;
      else if(code && /^[a-z0-9]+$/.test(code) && doc._code.includes(code)) score+=110;
      else if(doc._title.includes(token)) score+=90;
      else {
        const aliases=expansions.get(token);
        if(aliases.some(a=>doc._title.includes(a))) {score+=65;match='synonym';}
        else if(doc._module.includes(token)) {score+=35;match='module';}
        else {valid=false;break;}
      }
    }
    if(valid) rows.push({doc,score,match});
  }
  // Typo tolerance is a fallback, so exact results aren't buried by weak guesses.
  if(!rows.length && tokens.length===1) {
    for(const doc of filtered) if(fuzzyContains(doc._title,tokens[0])) rows.push({doc,score:15,match:'fuzzy'});
  }
  return rows.sort((a,b)=>b.score-a.score || a.doc.start-b.doc.start);
}
