# 還沒刷

https://pekka1117.github.io/wf-grind-list/

Warframe 的手動進度清單：裝備、星圖（一般與鋼韌之道）、集團、內蘊、Helminth。刷完的自己勾，就看得到還剩什麼、還能拿多少段位經驗。

不讀遊戲、不讀帳號資料、不需要登入，也不接受遊戲或 DE 伺服器的資料檔；進度只存在瀏覽器的 localStorage，可以匯出成檔案再匯入。單一檔案，CSP `default-src 'none'` 擋掉背景連線。也可以直接用瀏覽器開 `docs/index.html`。

A manual checklist for Warframe. Tick off what you finished and see what is left. It reads neither the game nor your account.

## 開發

- `scripts/gen-data.mjs` 產生 `src/data.json`；`save.ts` 匯出檔的格式與驗證；`calc.ts` 段位經驗與完成判定；`main.ts` 渲染
- `./build.sh`：測試 → 型別檢查 → 打包成單檔。腳本以 CSP 雜湊放行，改完一定要重新 build
- 遊戲改版後：`npm run data && ./build.sh`（需要 `xz`）
- 存檔的 key 是遊戲 uniqueName 或 `gen-data.mjs` 裡的 id，不要改

## 資料來源

見 [THIRD_PARTY.md](THIRD_PARTY.md)。非官方工具，與 Digital Extremes 無關。

## 授權 · License

© 2026 PEKKA，以 [CC BY 4.0](LICENSE)（[摘要](https://creativecommons.org/licenses/by/4.0/deed.zh-hant)）授權。可以自由轉載、修改、商用，但散佈原版或改作時**必須**：

1. 標示作者 **PEKKA**，並附上原作連結（下方 repo 或網頁擇一，放在使用者看得到的地方，例如頁尾）；
2. 註明以 CC BY 4.0 授權並附授權連結；
3. 若有修改，註明已修改。

建議寫法：`基於 PEKKA 的 <a href="https://pekka1117.github.io/wf-grind-list/">wf-grind-list</a>（CC BY 4.0），已修改`

© 2026 PEKKA, licensed under [CC BY 4.0](LICENSE). You may share, adapt and use this commercially, but any redistribution or adaptation **must** credit **PEKKA** with a visible link to the original (the repo or the page below, e.g. in your footer), link the license, and say whether you changed it.

- https://github.com/PEKKA1117/wf-grind-list
- https://pekka1117.github.io/wf-grind-list/

上述授權只涵蓋本專案自己的程式與文字，遊戲名稱與資料依 [THIRD_PARTY.md](THIRD_PARTY.md)。
The license above covers this project's own code and text only; game names and data follow [THIRD_PARTY.md](THIRD_PARTY.md).
