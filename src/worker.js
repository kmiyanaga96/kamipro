// Phase5 S5 (A案): ESM Worker。Vite が new Worker(new URL('./worker.js', import.meta.url), {type:'module'}) でバンドルする。
// app.js（エンジン＋data）を通常 import。registry はモジュール共有のため serialize/deserialize は不要。
// init では実行時設定のみ受け取り、プロパティ変更 or setter で反映する（import 束縛への直接再代入は不可）。
// ⚠ 旧 _buildWorkerCode（slice＋__FUNC__ serialize）を置き換えたもの。詳細は VITE_MIGRATION.md。
import {
  buildFormation, recalcGearK, _runRootPlan, _runBaselinePlan,
  GEAR, DMG, GEAR_K_C, setCurrentSubs
} from './app.js';

self.onmessage = function(e){
  const d = e.data;
  if(d.type==='init'){
    for(const [k,v] of Object.entries(d.gearState)) GEAR[k]=v;
    if(d.enemyState){ DMG.enemy_def=d.enemyState.enemy_def; DMG.enemy_max_hp=d.enemyState.enemy_max_hp; }
    if(d.gearKC) for(const [k,v] of Object.entries(d.gearKC)) GEAR_K_C[k]=v;
    if(d.dmgBase){ DMG.base_atk=d.dmgBase.base_atk; DMG.affinity=d.dmgBase.affinity;
      // 英霊武器専用強化定数（applyGear が上書き済の実効値）を反映
      if(d.dmgBase.droid_react_mult!=null)        DMG.droid_react_mult=d.dmgBase.droid_react_mult;
      if(d.dmgBase.droid_react_cap!=null)         DMG.droid_react_cap =d.dmgBase.droid_react_cap;
      if(d.dmgBase.edison_burst_extra_mult!=null) DMG.edison_burst_extra_mult=d.dmgBase.edison_burst_extra_mult;
      if(d.dmgBase.edison_burst_extra_cap!=null)  DMG.edison_burst_extra_cap =d.dmgBase.edison_burst_extra_cap;
      if(d.dmgBase.betaia_mult!=null)             DMG.betaia_mult=d.dmgBase.betaia_mult;
      if(d.dmgBase.betaia_cap!=null)              DMG.betaia_cap =d.dmgBase.betaia_cap;
      if(d.dmgBase.streak_dmgup!=null)            DMG.streak_dmgup=d.dmgBase.streak_dmgup;
      if(d.dmgBase.napo_burst_cd_reduce!=null)    DMG.napo_burst_cd_reduce=d.dmgBase.napo_burst_cd_reduce; }
    recalcGearK();
    // サブメンバー選択を反映してから buildFormation（subAssists 由来の集約をworkerでも正しく算出）。
    if(d.currentSubs) setCurrentSubs(d.currentSubs);
    buildFormation(d.heroKey,d.kamihimeKeys);
    self.postMessage({type:'ready'});
  } else if(d.type==='root'){
    self.postMessage({type:'rootResult', rootId:d.rootId, ..._runRootPlan(d.prefix,d.n,(t)=>self.postMessage({type:'progress',rootId:d.rootId,t}))});
  } else if(d.type==='baseline'){
    self.postMessage({type:'baselineResult', baseDmg:_runBaselinePlan(d.n,(t)=>self.postMessage({type:'progress',rootId:'baseline',t}))});
  }
};
