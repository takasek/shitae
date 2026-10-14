import http from 'node:http';
import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';
const dir='/private/tmp/shitae-18-http-01a1384b';
const names=JSON.parse(readFileSync(dir+'/manifest.json','utf8')).map(m=>m.name);
const routes=new Map(names.map(n=>['/'+n+'.html',readFileSync(dir+'/'+n+'.html')]));
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 appendFileSync(dir+'/requests.jsonl',JSON.stringify({at:new Date().toISOString(),method:req.method,path})+'\n');
 const body=routes.get(path);
 if(req.method!=='GET'||!body){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body);
});
server.listen(0,'127.0.0.1',()=>{const port=server.address().port;writeFileSync(dir+'/address.json',JSON.stringify({port,pid:process.pid})+'\n');console.log('http://127.0.0.1:'+port+'/trials.html');});
function stop(){server.close(()=>{console.log('server closed');process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
