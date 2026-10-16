import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {appendFileSync,writeFileSync} from 'node:fs';
export function start(root,model,log,replay){
 const p=spawn('node',['packages/cli/dist/index.js','session',model,...(replay?['--replay',replay]:[])],{cwd:root});
 const pending=[]; let seq=0;
 const rl=createInterface({input:p.stdout});
 rl.on('line',line=>{appendFileSync(log,JSON.stringify({direction:'out',value:JSON.parse(line)})+'\n');pending.shift()?.(JSON.parse(line));});
 p.stderr.on('data',b=>appendFileSync(log+'.stderr',b));
 p.on('exit',code=>appendFileSync(log,JSON.stringify({event:'exit',code,pid:p.pid})+'\n'));
 appendFileSync(log,JSON.stringify({event:'start',pid:p.pid,model,replay:replay??null})+'\n');
 return {pid:p.pid,request(value){const req={id:String(++seq),...value};appendFileSync(log,JSON.stringify({direction:'in',value:req})+'\n');return new Promise(resolve=>{pending.push(resolve);p.stdin.write(JSON.stringify(req)+'\n')});},end(){p.stdin.end();return new Promise(resolve=>p.once('exit',resolve));}};
}
export function save(path,response){if(!response.ok||!response.scenario)throw Error('export failed');writeFileSync(path,JSON.stringify(response.scenario,null,2)+'\n',{flag:'wx'});}
