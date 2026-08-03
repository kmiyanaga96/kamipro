// 汎用: ハーネスを「自分自身の子プロセス」として fork し、独立タスクを並列実行する（2026-08-02）。
//
// ── なぜ子プロセスか ──
//   ①`tools/` のハーネスは冒頭で config（GEAR/サブ/敵/ATK/override）をモジュールトップレベルに構築する。
//     **子は同じスクリプトを頭から実行する**ので config セットアップがそのまま再現される＝E2 の前提が壊れない。
//   ②REPO_STANDARDS §6 **E8「長時間ジョブは1条件=1プロセス」**（同一プロセスで条件を反復すると顕著に遅くなる）と整合。
//   ③node は単一スレッド＝逐次だとコアを1つしか使わない。prefix 間・ルート間は**完全に独立**なので素直に割れる。
//
// ⚠**結果不変**: 各タスクは決定的な純関数（同一 config・同一入力→同一出力）なので、並列化しても値は動かない。
//   親は**宣言順に整列して**返すため、順序依存の集計（sort/tie-break）も逐次時と一致する。
//
// 使い方（ハーネス側）:
//   const task = pmapTask();
//   if(task){ const payload = await pmapRecv(); process.send(run(task.kind, payload)); process.exit(0); }
//   const results = await parallelMap(import.meta.url, 'beam', prefixes);
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// 親側: payloads[i] を1タスクとして子へ配り、結果を**同じ添字**で返す。
export async function parallelMap(scriptUrl, kind, payloads, { limit, onDone } = {}){
  const script = scriptUrl.startsWith('file:') ? fileURLToPath(scriptUrl) : scriptUrl;
  const count = payloads.length;
  const lim = Math.max(1, Math.min(limit ?? os.cpus().length, count || 1));
  const out = new Array(count);
  if(count === 0) return out;
  let next = 0;
  await new Promise((resolve, reject) => {
    let running = 0, done = 0;
    const pump = () => {
      while(running < lim && next < count){
        const i = next++; running++;
        const ch = fork(script, ['--pmap-task', kind, String(i)], { stdio:['ignore','inherit','inherit','ipc'] });
        ch.on('message', m => { out[i] = m; });
        ch.on('exit', code => {
          running--; done++;
          if(code !== 0 && out[i] === undefined){ reject(new Error(`${kind}#${i} が exit ${code} で落ちた`)); return; }
          if(onDone) onDone(i, out[i]);
          if(done === count) resolve(); else pump();
        });
        ch.on('error', reject);
        ch.send(payloads[i]);
      }
    };
    pump();
  });
  return out;
}

// 子側: 自分が担当するタスク（{kind,index}）を返す。親プロセスなら null。
export function pmapTask(){
  const i = process.argv.indexOf('--pmap-task');
  return i < 0 ? null : { kind: process.argv[i+1], index: Number(process.argv[i+2]) };
}

// 子側: 親から payload を1つ受け取る。
export function pmapRecv(){
  return new Promise(res => process.once('message', res));
}

export const PMAP_CORES = os.cpus().length;
