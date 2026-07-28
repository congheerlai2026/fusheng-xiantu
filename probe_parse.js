function repairJsonStr(text){if(typeof text!=="string")return text;let out="",inStr=false,escaped=false;for(let i=0;i<text.length;i++){const ch=text[i];if(escaped){out+=ch;escaped=false;continue;}if(ch==="\\"){out+=ch;escaped=true;continue;}if(ch==="\""){inStr=!inStr;out+=ch;continue;}if(inStr){if(ch==="\n"){out+="\\n";continue;}if(ch==="\r"){out+="\\r";continue;}if(ch==="\t"){out+="\\t";continue;}}out+=ch;}return out.replace(/,(\s*[}\]])/g,"$1");}
function extractBalancedJson(text){let start=-1,depth=0,inStr=false,escape=false;for(let i=0;i<text.length;i++){const ch=text[i];if(inStr){if(escape)escape=false;else if(ch==="\\")escape=true;else if(ch==="\"")inStr=false;}else{if(ch==="\"")inStr=true;else if(ch==="{"){if(depth===0)start=i;depth++;}else if(ch==="}"){if(depth>0){depth--;if(depth===0)return text.slice(start,i+1);}}}}return null;}
function robustParse(raw){const clean=(raw||"").trim();let data=null;try{data=JSON.parse(clean);}catch(e){try{data=JSON.parse(repairJsonStr(clean));}catch(e2){const bal=extractBalancedJson(clean);if(bal){try{data=JSON.parse(repairJsonStr(bal));}catch(e3){console.log("step3 error:",e3.message,"| bal=",bal.slice(0,80));}}}}if(data&&typeof data==="object")return{ok:true,sc:data.state_changes||{}};return{ok:false};}

// 案例1：末字非} + 裸换行 + 尾逗号
const bad1='{"narrative":"他笑道：\n此去经年。\n","options":["a","b",],"state_changes":{"spiritual_stones":500}}末尾中文';
console.log("案例1 ->", JSON.stringify(robustParse(bad1)));

// 案例2：末字是中文“物”（模拟第9轮）
const bad2='{"narrative":"他拔剑物","options":["战","退"],"state_changes":{"hp":-10}}物';
console.log("案例2 ->", JSON.stringify(robustParse(bad2)));

// 案例3：未转义双引号导致字符串断裂
const bad3='{"narrative":"他说"此去经年"便走","options":["追"],"state_changes":{}}';
console.log("案例3 ->", JSON.stringify(robustParse(bad3)));
