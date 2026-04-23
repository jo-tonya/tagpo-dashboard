# tagpo-dashboard (tagpo-system)

Tagpo 事業管理システム（数値管理ダッシュボード）。案件進行管理（tagpo-projects）と同じ Supabase プロジェクトを共有し、PL・コスト・人件費・EG・支払い・入金などの数値を管理する。

- Next.js 16 / React 19 / shadcn/ui / Tailwind v4
- Supabase（`@supabase/ssr`）
- 認証は現状なし（URLを知っていれば誰でもアクセス可能）

## 開発

```bash
npm install
npm run dev
```

`http://localhost:3000` で起動。

## 環境変数

`.env.local` を作成（Vercel 側にも同じ値を設定する）:

```
NEXT_PUBLIC_SUPABASE_URL=https://mgxzcaofslwzuwkcsljy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## デプロイ

Vercel にこのリポジトリを import するだけ。Root Directory は `/`（このリポジトリ直下）。Framework Preset は Next.js。環境変数を設定して Deploy。
