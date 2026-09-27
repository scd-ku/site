# SCD KU Astro Showcase

香川大学 Science Communication Design Laboratory の公開Webアプリを、`scd-ku` GitHubアカウントから自動収集してタイル表示するAstroサイトです。

## 現在同梱しているアプリ

- 3DCAD++ — `scd-ku/cad`
- AIふせんボード — `scd-ku/aifusen`
- スライドふせん — `scd-ku/slidefusen`
- FOOD CHAIN QUEST — `scd-ku/lifegame`
- 3D天気図 — `scd-ku/3dtenkizu`
- かがり手まり 3D制作工程 — `scd-ku/kagaritemari`
- 書画カメラ++ — `scd-ku/camera`
- ことばをひらく — `scd-ku/tsumari`
- 星座早見盤 — `scd-ku/seizahayami`

これらを初期スナップショットとして同梱し、公開時には `scd-ku` のGitHub Pages対応リポジトリを再走査します。新しい公開アプリは次回ビルド時に自動追加されます。

People セクションは氏名を大きな見出し扱いにせず、役職情報と同じ静かな階層に整理したミニマル表示です。

## 仕組み

1. `scripts/sync-github.mjs` が `scd-ku` の公開リポジトリをGitHub APIから取得します。
2. GitHub Pagesまたは公開homepageを持つリポジトリだけを「アプリ」として採用します。
3. 各リポジトリの `index.html` を読み、`<title>` などから表示名を自動取得します。
4. コード中のキーワードから `AI / 3D / Astronomy / Camera / OCR ...` などのタグを自動推定します。
5. `scripts/capture-thumbnails.mjs` が公開アプリをPlaywrightで開き、実画面をタイル用JPEGとして自動撮影します。
6. Astroが静的サイトを生成し、GitHub Pagesへ公開します。

GitHub Actionsは `main` へのpush、手動実行、毎日1回の定期実行で動きます。そのため、`scd-ku` に新しい公開アプリを追加すると、次回実行時にサイト側にも自動追加されます。

## GitHubに公開する手順

### 1. 新しいリポジトリを作る

例：

```text
scd-ku/site
```

または

```text
scd-ku/scd-site
```

このZIPの中身をそのリポジトリのルートに置き、`main` にpushします。

### 2. GitHub Pagesを有効化

GitHubのリポジトリで：

```text
Settings
  → Pages
  → Source: GitHub Actions
```

を選びます。

### 3. Actionsを実行

pushすると `.github/workflows/deploy.yml` が自動実行されます。

処理内容：

```text
GitHubの公開アプリを取得
        ↓
タイトル・タグを生成
        ↓
各アプリの実画面を撮影
        ↓
Astro build
        ↓
GitHub Pagesへ公開
```

## 新しいアプリを追加するとき

通常はこのサイト側を編集する必要はありません。

`scd-ku` に新しいリポジトリを作り、GitHub Pagesを有効にすると、次回のサイト更新時に自動検出されます。

アプリのURLがGitHub Pages以外の場合は、GitHubリポジトリの **Website / homepage** に公開URLを設定してください。

## 表示名・説明・タグを手直しする場合

`src/data/overrides.mjs` にリポジトリ名ごとの上書きを書けます。

```js
myapp: {
  title: '表示タイトル',
  description: '短い説明文',
  tags: ['AI', 'Education'],
  size: 'wide'
}
```

`size` は以下の4種類です。

```text
normal
wide
 tall
large
```

上書きのない新規アプリは、HTMLやコードから自動推定します。

## About / People の編集

`src/pages/index.astro` の `#about` と `#people` を編集します。

## デザイン

- ミニマルな白黒ベース
- Projectsは12カラムの可変タイル
- タグによる絞り込み
- タイルホバーで説明が下からせり上がる
- タイルクリックで各アプリへ移動
- カーソル位置でトップの幾何学図形がわずかに変形
- アプリ上では円形カーソルが四角＋矢印へ変化
- スマートフォンではホバーを使わず説明を常時表示
- `prefers-reduced-motion` 対応

## 背景映像を入れる場合

初版は軽量なCSSモーション背景にしています。映像背景にする場合は、`public/video/hero.mp4` を追加し、`src/pages/index.astro` のhero内に `<video>` を追加してください。アプリのスクリーンショットとは独立しているため、あとから変更できます。

## ローカル開発

Node.js 22以降を推奨します。

```bash
npm install
npm run sync
npx playwright install chromium
npm run capture
npm run dev
```

ネットワークなしでも、同梱済みの4アプリのスナップショットデータとフォールバック画像表現でサイト自体は起動できます。

## 主なファイル

```text
src/pages/index.astro              トップ / About / People
src/components/AppGrid.astro       タイル・タグフィルタ・ホバー説明
src/styles/global.css              全体デザインとモーション
src/data/apps.generated.json       自動生成されたアプリ一覧
src/data/overrides.mjs             表示内容の手動上書き
scripts/sync-github.mjs            GitHubリポジトリ自動取得
scripts/capture-thumbnails.mjs     公開アプリの画面自動撮影
.github/workflows/deploy.yml        自動更新・GitHub Pages公開
```


## Design update v4

- Projects をデスクトップで3列固定の均一タイルに変更。
- Projects 見出しと各セクション見出しを小さく、font-weight 300 を基調に調整。
- Hero の “Science, Design & Communication.” を3行から2行にし、高さも圧縮。
- カーソルを円形スリットパターンへ変更。
- Hero 内の4つの幾何学形状も異なる角度・ピッチのスリットへ変更し、それぞれ逆方向を含む回転アニメーションを付与。
- カーソルのスリットと背景スリットが重なった位置では difference blend によりモワレが強調される。
- fine pointer 環境では通常カーソルを隠し、スリットカーソルを使用。

## v5: 背景・いいね・アクセス解析

- 背景色は `#FFFFFF` に統一。
- Hero背景には、水分子、葉緑体、ボルボックス、立方体、正八面体、塩化アンモニウム再結晶をイメージした輪郭SVGを配置し、それぞれ異なる周期で回転・漂流します。
- 各Projectにミニマルな線画ハートを追加。選択状態はブラウザの `localStorage` に保存します。
- Google Analytics 4 を使う場合は、GitHub repository variable `PUBLIC_GA_MEASUREMENT_ID` に `G-...` の測定IDを設定してください。
- GA4タグは利用者が「許可する」を押すまで読み込みません。許可後は、GA4標準の参照元・ページ・おおよその地域・ブラウザ/端末情報等に加え、`project_open`、`project_like`、`project_unlike` を送信します。
- `/privacy/` に「アクセス解析について」を用意し、フッターから常時参照できます。

### いいねの扱い

現段階のハートは「このブラウザでのいいね」です。Google Analyticsを許可している利用者については `project_like` イベントを集計できるため、Projectごとの反応数をGA4で確認できます。サイト上に全利用者の合計いいね数を表示する場合は、Firebase / Supabase / Google Apps Script等の永続バックエンドを追加してください。

## v10 build / deploy notes

- `src/layouts/BaseLayout.astro` の入れ子になっていた `<script>` を分離し、Astroで正しく解析できる構造に修正しました。
- GitHub Actions は Node.js 24 対応の `actions/checkout@v5` / `actions/setup-node@v5` を使用します。
- `package-lock.json` が無い状態で setup-node の npm cache が失敗しないよう、`package-manager-cache: false` を指定しています。
- Playwright/Chromium によるサムネイル撮影は失敗してもデプロイ全体を止めません。
- Pages artifact は `actions/upload-pages-artifact@v4`、deploy は `actions/deploy-pages@v5` を使用します。
- 手動で入れ替える場合は `.github/workflows/deploy.yml` を含めてリポジトリのルートを丸ごと置き換えてください。


## v17 design changes
- Hero title lowered so the second line is cropped at the black/white boundary.
- Projects spacing tightened vertically from hero, while tile-to-tile spacing is enlarged.
- Public Applications count moved to the content-band directly above the grid.
- Grid columns now support 3 / 4 / 5; default is 4.
- About English catchphrase matches People name scale; Japanese copy follows below.
- Typography uses an Avenir Next-first rounded/minimal system stack and roomier tracking.
