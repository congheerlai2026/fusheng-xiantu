'use strict';
// 验证「品级显示」管线：AI 是否按要求为新出物品/功法标定 grade
const fs = require('fs'), os = require('os'), path = require('path');
function decodeBeta(code){let t=code.trim();if(!t.startsWith('FS-'))return null;let e=t.slice(3).replace(/-/g,'+').replace(/_/g,'/');while(e.length%4)e+='=';try{const d=decodeURIComponent(escape(atob(e)));const p=d.split('|');let k,b,m,i;if(p.length===5){k=p[1];b=p[2];m=p[3];i=parseInt(p[4]);}else if(p.length===4){k=p[0];b=p[1];m=p[2];i=parseInt(p[3]);}else return null;if(m==='deepseek-chat'||m==='deepseek-reasoner')m='deepseek-v4-flash';return{apiKey:k,baseURL:b,model:m,index:i};}catch(_){return null;}}
const CODE=process.argv[2];
const cfg=decodeBeta(CODE);
if(!cfg){console.error('码无法解码');process.exit(1);}
const sys=`你是一款仙侠文字RPG《浮生仙途》的主持人(GM)。请依下述格式返回一个JSON对象（只返回JSON，首字符{末字符}）。
【品级规制】功法、法宝、丹药皆标品级，由低至高：黄阶<玄阶<地阶<天阶<帝阶；每阶分 下品/中品/上品/极品。凡新出之物须标定品级，如「玄阶上品·青锋剑」「黄阶中品·聚气丹」。
【本次要求】请写一小段剧情：主角在苍梧山一处洞府中寻得一件法宝与一枚丹药，并习得一门功法残篇。务必在 items_gained 与 techniques_gained 中给出 grade 品级。
格式：
{
 "narrative":"剧情正文",
 "state_changes":{
   "items_gained":[{"name":"物品名","kind":"类别(丹药/法宝/材料/符箓)","grade":"品级如 玄阶上品","desc":"一句话简介"}],
   "techniques_gained":[{"name":"功法名","grade":"品级如 地阶上品"}]
 },
 "options":["选项1","选项2","选项3"],
 "chapter_title":"回目对仗句"
}`;
(async()=>{
  const resp=await fetch(cfg.baseURL.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+cfg.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model,messages:[{role:'system',content:sys},{role:'user',content:'我入得洞府，四下搜寻。'}],temperature:0.85,max_tokens:1200,response_format:{type:'json_object'},stream:false})});
  const j=await resp.json();
  const raw=(j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||'';
  let data;try{data=JSON.parse(raw);}catch(_){console.log('JSON解析失败：',raw.slice(0,300));process.exit(1);}
  console.log('items_gained:',JSON.stringify(data.state_changes&&data.state_changes.items_gained,null,1));
  console.log('techniques_gained:',JSON.stringify(data.state_changes&&data.state_changes.techniques_gained,null,1));
  console.log('chapter_title:',data.chapter_title);
})().catch(e=>{console.error(e);process.exit(1);});
