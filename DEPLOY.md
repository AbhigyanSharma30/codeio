Deployment guide — quick options

This repo contains a Node/Express backend (server) and a React client (client).
Below are simple deployment options. Pick one and follow the steps.

Option 1 — Single container (server serves client) via Docker (recommended for simplicity)
- This repo includes `server/Dockerfile` which builds the React client and runs the server.
- Build and run locally to smoke-test:

  ```powershell
  # from repo root
  docker build -f server/Dockerfile -t collab-editor:latest .
  docker run -p 3001:3001 --env MONGODB_URI=<your-mongodb-uri> --env NODE_ENV=production collab-editor:latest
  ```

- The app will serve the client at `http://localhost:3001` (server also listens for WebSocket on same port).
- For production, push the image to your registry and run on your provider (Render, Fly, AWS ECS, etc.).

Render-specific (GitHub + Render) — single-container deploy
1. Commit and push your repo to GitHub.
2. On Render (https://dashboard.render.com):
  - Click "New" → "Web Service" → "Deploy from GitHub" and select your repository.
  - If you add the provided `render.yaml` to the repo root, Render can use it to configure the service automatically. The included `render.yaml` points Render to use `server/Dockerfile` and exposes port 3001.
  - In the Render service settings, set the following environment variables (do NOT put secrets in `render.yaml`):
    - `MONGODB_URI` — MongoDB connection string
    - `CLIENT_URL` — (optional) your deployed client origin, e.g. `https://your-service.onrender.com`
    - `PORT` — (optional) default `3001`
    - `FIREBASE_SERVICE_ACCOUNT` — (recommended) JSON string of your Firebase service account credentials. Alternatively set `GOOGLE_APPLICATION_CREDENTIALS` on the host and Render will pick it up.
  - Deploy. Render will build the Docker image and run the container.
3. After deployment, Render will give you a public URL (https). Use that as your API and WS base URL:
  - API: `https://your-render-service.onrender.com`
  - WebSocket: `wss://your-render-service.onrender.com`

Notes about the single-container approach on Render:
- The `server` will serve the pre-built React `client/build` when `NODE_ENV=production`. This keeps one origin for both API and WS (no CORS or mixed-scheme issues).
- Make sure the `MONGODB_URI` is set in the Render dashboard; otherwise the server will still run but persistence won't work.
- For secure WebSocket (wss) keep TLS enabled (Render provides TLS automatically) and use `wss://` in your client env.

Important env vars for server
- `PORT` (optional) — default 3001
- `MONGODB_URI` — MongoDB connection string (if you want persistence)
- `CLIENT_URL` — optional comma-separated allowed client origins (e.g. https://myapp.example.com)
 - `FIREBASE_SERVICE_ACCOUNT` — JSON string of Firebase service account credentials (or configure `GOOGLE_APPLICATION_CREDENTIALS` on the host).

Option 2 — Deploy server and client separately
- Server: Render, Fly.io, DigitalOcean App Platform, Railway (all support WebSockets). Use `node server.js` start command.
- Client: Vercel or Netlify (static site). Configure client to point to server APIs & WS via environment variables.

Example: Deploy server to Render
1. Create a new Web Service on Render.
2. Connect your GitHub repo and select the `server` folder.
3. Build command: `npm install && npm run build` (if using Docker skip this). Start command: `node server.js`.
4. Set environment variables on Render: `MONGODB_URI`, `CLIENT_URL` (your deployed client URL), `PORT` (optional).
5. Render supports WebSockets; use the provided service URL for `REACT_APP_API_URL` and `REACT_APP_WS_URL` in your client.

Client
- Deploy client on Vercel/Netlify. Set environment variables in the project config:
  - `REACT_APP_API_URL` → e.g. `https://your-render-server.onrender.com`
  - `REACT_APP_WS_URL` → e.g. `wss://your-render-server.onrender.com`

Security
- Use `wss://` + `https://` in production.
- Add `CLIENT_URL` to server `process.env.CLIENT_URL` or configure CORS whitelist.
- Protect production endpoints with authentication and consider rate-limiting / quotas for the execution endpoint.

If you want me to:
- Add CI/Deploy scripts for a chosen provider (Render, Fly, Vercel).
- Create a ready-to-deploy Docker image and a sample `render.yaml` or Fly.toml.
- Or I can deploy this for you if you give me the provider and repo access details (not recommended here).

Which provider do you prefer? I can add provider-specific files next (Docker, Fly.toml, or Render YAML).