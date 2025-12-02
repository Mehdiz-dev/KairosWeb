import express from 'express';
import session from 'express-session';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax' }
}));

// --- Fichiers statiques du site
app.use(express.static(path.join(__dirname, 'public')));

// --- Page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});


// --- Helpers
const DISCORD_AUTH_BASE = 'https://discord.com/api/oauth2';
const DISCORD_API_BASE  = 'https://discord.com/api';

function discordAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    // need email? add 'email'. need roles? we’ll use bot flow later.
    scope: 'identify guilds'
  });
  return `${DISCORD_AUTH_BASE}/authorize?${params.toString()}`;
}

// --- Routes
app.get('/login', (_req, res) => {
  res.redirect(discordAuthUrl());
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');

  try {
    // 1) Exchange code -> token
    const tokenRes = await axios.post(
      `${DISCORD_AUTH_BASE}/token`,
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;

    // 2) Get user
    const meRes = await axios.get(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // 3) Check guild membership
    const guildsRes = await axios.get(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const isMember = guildsRes.data?.some?.(
      (g) => g.id === process.env.DISCORD_GUILD_ID
    ) || false;

    // 4) Store in session
    req.session.user = {
      ...meRes.data,      // id, username, avatar, discriminator (deprecated soon), etc.
      isMember
    };

    // 5) Redirect back to the site
    res.redirect('/');
  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    res.status(500).send('Erreur lors de la connexion.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Front-end helper: auth status
app.get('/api/auth/status', (req, res) => {
  const u = req.session.user;
  res.json({
    authenticated: !!u,
    allowed: !!u?.isMember,
    user: u ? {
      id: u.id,
      username: u.username,
      avatar: u.avatar
    } : null
  });
});

// --- Lancement en local uniquement
const port = process.env.PORT || 3000;

if (process.env.VERCEL !== '1') {
  app.listen(port, () =>
    console.log(`✅ Serveur en local sur http://localhost:${port}`)
  );
}

// --- Export pour Vercel
export default app;
