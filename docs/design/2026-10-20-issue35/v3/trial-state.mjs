export function createTrial(f){
 const t={live:f.rows.at(-1),selected:null,cutoff:null,branched:false,recentNoop:false,
 available(step,result){const r=f.rows.find(r=>r.step===step&&r.result===result);return !!r&&(!this.cutoff||r.id<=this.cutoff)},
 preview(step,result){if(!this.available(step,result))throw Error('この時点の画面は残っていません');this.selected=f.rows.find(r=>r.step===step&&r.result===result)},
 view(){return this.selected||this.live},close(){this.selected=null},
 resume(){if(!this.selected)throw Error('参照先なし');this.live=this.selected;this.selected=null;this.recentNoop=false},
 noop(){this.selected=null;this.recentNoop=true},
 scenarioName(){if(this.branched)return this.live.id===16?'branched.scenario.json':null;if(this.live.step===12&&this.live.result===2)return 'loaded.scenario.json';if(this.live.step===7&&this.live.result===1)return this.recentNoop?'noop.scenario.json':'resumed.scenario.json';return null},
 branch(){if(this.live.step!==7||this.live.result!==1)throw Error('今回の模型は記録7・結果1からの取下げのみ');this.cutoff=this.live.id;this.live={step:15,result:1,id:16,title:'申請を取り下げる',condition:'指定なし',values:Object.fromEntries(f.branchState.sharedVariants.map(x=>[x.component,x.variant]))};this.selected=null;this.branched=true}
 };return t;
}
