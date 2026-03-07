
  # App Builder

  This is a code bundle for App Builder. The original project is available at https://www.figma.com/design/1izqKkg8BXKAHbL27YLJQ1/App-Builder.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Deployment notes

  The frontend expects a cloud API for `/api/pull` and `/api/sync`.

  For a Netlify frontend deployment, set `VITE_API_BASE_URL` to the deployed API origin.

  For the backend deployment, set:
  - `DATABASE_URL`
  - `ALLOWED_ORIGINS` to your Netlify site URL and any custom domain
  - optional DB timeout variables shown in `server/.env.example`

  This codebase currently uses Supabase PostgreSQL through the backend. It does not include a Supabase Auth client in the frontend.
  
