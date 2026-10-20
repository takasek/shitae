export function createTrial(f){
 const t={live:f.rows.at(-1),selected:null,cutoff:null,branched:false,
 available(step,result){const r=f.rows.find(r=>r.step===step&&r.result===result);return !!r&&(!this.cutoff||r.id<=this.cutoff)},
 preview(step,result){if(!this.available(step,result))throw Error('この時点の画面は残っていません');this.selected=f.rows.find(r=>r.step===step&&r.result===result)},
 view(){return this.selected||this.live},close(){this.selected=null},
 resume(){if(!this.selected)throw Error('参照先なし');this.live=this.selected;this.selected=null},
 noop(){},
 branch(){if(this.live.step!==7||this.live.result!==1)throw Error('今回の模型は記録7・結果1からの取下げのみ');this.cutoff=this.live.id;this.live={step:15,result:1,id:16,title:'申請を取り下げる',condition:'指定なし',values:Object.fromEntries(f.branchState.sharedVariants.map(x=>[x.component,x.variant]))};this.selected=null;this.branched=true}
 };return t;
}
