// Phase5 S5 (A案): ESM Worker。Vite が new Worker(new URL('./worker.js', import.meta.url), {type:'module'}) でバンドルする。
// app.js（エンジン＋data）を通常 import。registry はモジュール共有のため serialize/deserialize は不要。
// init では実行時設定のみ受け取り、プロパティ変更 or setter で反映する（import 束縛への直接再代入は不可）。
// ⚠ 旧 _buildWorkerCode（slice＋__FUNC__ serialize）を置き換えたもの。詳細は VITE_MIGRATION.md。
import {
  buildFormation, recalcGearK, _runRootPlan, _runRouteLS, _runBaselinePlan,
  GEAR, DMG, GEAR_K_C, setCurrentSubs, setStaticOverride, _runCalibrationProbe
} from './app.js';

self.onmessage = function(e){
  const d = e.data;
  if(d.type==='init'){
    for(const [k,v] of Object.entries(d.gearState)) GEAR[k]=v;
    if(d.enemyState){ DMG.enemy_def=d.enemyState.enemy_def; DMG.enemy_max_hp=d.enemyState.enemy_max_hp; }
    if(d.gearKC) for(const [k,v] of Object.entries(d.gearKC)) GEAR_K_C[k]=v;
    // D10(2026-07-14): dmgBase=「既定値と異なる DMG キーの自動diff」（app.js 側で DMG_DEFAULTS と比較して生成）。
    // 旧実装のキー別手動ミラー（新DMG定数の追記漏れ=C26型サイレント乖離の温床）を Object.assign 一括適用へ置換。
    if(d.dmgBase) Object.assign(DMG, d.dmgBase);
    recalcGearK();
    // サブメンバー選択を反映してから buildFormation（subAssists 由来の集約をworkerでも正しく算出）。
    if(d.currentSubs) setCurrentSubs(d.currentSubs);
    buildFormation(d.heroKey,d.kamihimeKeys);
    setStaticOverride({});               // C15: init は較正なし（各タスクが override を明示適用）
    self.postMessage({type:'ready'});
  } else if(d.type==='calibrate'){
    // C15 案(c): 1 つの静的スコア override を適用して単一ビームfullで採点（full-verify 段の1点）。
    self.postMessage({type:'calibResult', override:d.override, dmg:_runCalibrationProbe(d.override, d.n)});
  } else if(d.type==='rootBeam'){
    // 2段実行の第1段: ビームのみ。キー列を返してメイン側で重複除去する（同一ルートへの LS 重複実行の防止）。
    setStaticOverride(d.override||{});   // C15: 採用された較正 override を適用してから探索
    const r=_runRootPlan(d.prefix, d.n, (t)=>self.postMessage({type:'progress',rootId:d.rootId,t}), null, true);
    self.postMessage({type:'rootBeamResult', rootId:d.rootId, prefix:r.prefix, dmg:r.dmg, keys:r.rows.map(x=>x.keys)});
  } else if(d.type==='rootLS'){
    // 2段実行の第2段: 重複除去後の一意ルートにのみ局所探索を掛ける。
    setStaticOverride(d.override||{});
    self.postMessage({type:'rootResult', rootId:d.rootId, ..._runRouteLS(
      d.prefix, d.keys, d.n,
      (ls)=>self.postMessage({type:'lsProgress',rootId:d.rootId,...ls}))});
  } else if(d.type==='baseline'){
    setStaticOverride({});   // C16: baseline は「素直押し」=自然s（override無し）。較正overrideは分子(opt)のみに効かせ、
                             // 火力指数=最適÷素直押し が較正の火力貢献も含む「最適化の全価値」を表す（C15の分母揃えを逆転）。
    self.postMessage({type:'baselineResult', baseDmg:_runBaselinePlan(d.n,(t)=>self.postMessage({type:'progress',rootId:'baseline',t}))});
  }
};
