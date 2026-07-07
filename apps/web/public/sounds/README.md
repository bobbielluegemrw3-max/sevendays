# Daily Derby sounds

全てオーナー支給のWAV原本(リポジトリ直下 `音声ファイル/`)をffmpegでMP3化したもの。
差し替えは同名で上書き。ファイルが無い場合、演出は無音で進行する(エラーにはならない)。

| ファイル | 用途 | タイミング |
|---|---|---|
| fanfare.mp3 (16.8s) | 競馬ファンファーレ | 20:00通過の瞬間(オープニングBGM兼用) |
| gate-open.mp3 (1.8s) | ゲート開放 | T+17s(レース実走開始) |
| horse-whinny.mp3 (2.1s) | 馬のヒヒン声 | T+18.6s(ゲート直後) |
| hoofbeats.mp3 (39.6s) | 蹄音ループ | T+17〜30s(レース実走中) |
| crowd.mp3 (100.6s) | 群衆の話し声ループ(音量0.45) | T+30〜97s(ログ濁流の間ずっと) |
| own-burn.mp3 (0.9s) | 自分の馬のBURN行が出た時 | 該当行出現時(0.4s連発抑制) |
| own-good.mp3 (2.3s) | 自分の該当行(生存/マッチング等) | 該当行出現時(同上) |
| finale.mp3 (11.0s) | フィナーレ | T+97s(TODAY RACE END) |

タイムライン(17s/30s/97s)は `apps/web/lib/daily-derby.ts` の定数と対応。
音源の尺を大きく変える場合は `OPENING_STEPS`/`RACE_RUN`/`COMPLETE_AT` を再調整。
