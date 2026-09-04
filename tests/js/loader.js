const fs=require('fs'), path=require('path'), vm=require('vm');
const SRC=require('path').join(__dirname,'..','..','amd','src');
const cache={};
function load(name){
  if(cache[name]) return cache[name];
  const file=path.join(SRC, name.replace('mod_contentcreator/','')+'.js');
  const code=fs.readFileSync(file,'utf8');
  let result;
  const sandbox={
    define:(deps,fn)=>{ result=fn.apply(null,(deps||[]).map(load)); },
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Set, Map,
    window:{}, document:{addEventListener(){}}, M:{cfg:{wwwroot:''}}, require:()=>{}, fetch:()=>{}
  };
  sandbox.global=sandbox; sandbox.self=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {filename:file});
  cache[name]=result;
  return result;
}
module.exports={load};
