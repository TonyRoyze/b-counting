# B-Counting

A fresh React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and Convex starter. The previous implementation is documented in [FEATURES.md](./FEATURES.md); its application code has been removed.

## Start the app

```sh
npm install
npm run dev
```

## Connect Convex

```sh
npx convex dev
```

Follow the CLI prompts to create or select a deployment. Set the resulting deployment URL as `VITE_CONVEX_URL` in `.env.local` (see `.env.example`). The frontend will then use the Convex provider.

## Add shadcn/ui components

The project is initialized with shadcn's New York style, Tailwind CSS v4, and the `@/` import alias. Add components with commands such as:

```sh
npx shadcn@latest add card input
```

Build with `npm run build`.
