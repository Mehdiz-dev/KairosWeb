// Gestion du menu
const dotsBtn = document.getElementById('dotsBtn');
const sideMenu = document.getElementById('sideMenu');
const backdrop = document.getElementById('menuBackdrop');

function openMenu() {
  sideMenu.classList.add('open');
  sideMenu.setAttribute('aria-hidden', 'false');
}
function closeMenu() {
  sideMenu.classList.remove('open');
  sideMenu.setAttribute('aria-hidden', 'true');
}

dotsBtn.addEventListener('click', () => {
  if (sideMenu.classList.contains('open')) closeMenu();
  else openMenu();
});
backdrop.addEventListener('click', closeMenu);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sideMenu.classList.contains('open')) closeMenu();
});
//Login Staff//
document.querySelectorAll('.btn-staff.auth-guest').forEach(btn=>{
  btn.addEventListener('click', () => { window.location.href = './login.html'; });
});
// --- Auth Discord Supabase ---
import { supabase, SUPABASE_URL } from '../supabaseClient.js'; // ou './supabaseClient.js' si placé dans /public
const $all = (sel) => Array.from(document.querySelectorAll(sel));

// Connexion via Discord
async function loginWithDiscord() {
  await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      scopes: 'identify guilds',
      redirectTo: 'http://127.0.0.1:5500/public/'
    }
  });
}

// Déconnexion
async function logout() {
  await supabase.auth.signOut();
  window.location.reload();
}

// Vérifie la session + appelle l'Edge Function (Supabase)
async function refreshAuthUI() {
  const { data: { session } } = await supabase.auth.getSession();

  // état invité
  if (!session) {
    document.body.classList.remove('is-auth');
    document.body.classList.remove('is-staff', 'is-superadmin');
    document.body.dataset.role = '';
    return;
  }

  const provider = session.user?.app_metadata?.provider;

  // --- CAS 1 : Discord (vérif guilde via Edge)
  if (provider === 'discord') {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check_guild_member`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      const { allowed, member } = json;
    
      // connecté (guilde OK) ?
      document.body.classList.toggle('is-auth', !!allowed);
      if (!allowed) {
        document.body.classList.remove('is-staff');
        alert("Accès refusé : ton compte Discord n'est pas membre du serveur.");
        return;
      }
    
      // Remplissage UI
      const $names = document.querySelectorAll('.js-userName');
      const $nicks = document.querySelectorAll('.js-userNick');
      const $avas  = document.querySelectorAll('.js-userAvatar');
    
      const displayName = member?.display_name || member?.username || 'Connecté';
      $names.forEach(el => { el.textContent = displayName; });
    
      $nicks.forEach(el => {
        if (member?.nick) { el.textContent = `(${member.nick})`; el.style.display = ''; }
        else { el.textContent = ''; el.style.display = 'none'; }
      });
    
      $avas.forEach(el => {
        if (member?.avatar_url) { el.src = member.avatar_url; el.style.display = ''; }
        else { el.style.display = 'none'; }
      });
    
      // Rôle staff/superadmin ? (via public.profiles)
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
      
        const role = prof?.role || null;
        document.body.dataset.role = role || '';
        document.body.classList.toggle('is-staff', role === 'staff' || role === 'superadmin');
        document.body.classList.toggle('is-superadmin', role === 'superadmin');
      } catch {
        document.body.classList.remove('is-staff', 'is-superadmin');
        document.body.dataset.role = '';
      }
    
    } catch (e) {
      console.warn('check_guild_member failed', e);
      document.body.classList.remove('is-auth', 'is-staff', 'is-superadmin');
      document.body.dataset.role = '';
    }
    return;
  }
  // --- CAS 2 : E-mail (staff)
  else if (provider === 'email') {
      document.body.classList.add('is-auth');
    try {
      const { data: prof } = await supabase.from('profiles').select('username, role').eq('id', session.user.id).maybeSingle();

      // badge staff UI
      const role = prof?.role || null;
      document.body.dataset.role = role || '';
      document.body.classList.toggle('is-staff', role === 'staff' || role === 'superadmin');
      document.body.classList.toggle('is-superadmin', role === 'superadmin');


      // affichage nom
      const displayName = prof?.username || session.user.email || 'Staff';
      document.querySelectorAll('.js-userName').forEach(el => { el.textContent = displayName; });
      document.querySelectorAll('.js-userNick').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
      document.querySelectorAll('.js-userAvatar').forEach(el => { el.style.display = 'none'; });
    } catch (e) {
      console.warn('profile read error (non-bloquant)', e);
      document.body.classList.remove('is-staff');
    }
    return;
  }

// Fallback (autres providers) : connecté, mais non-staff par défaut
document.body.classList.add('is-auth');
document.body.classList.remove('is-staff', 'is-superadmin');
document.body.dataset.role = '';
}


// Se met à jour dès que Supabase finalise la session après le redirect
supabase.auth.onAuthStateChange(() => {
  refreshAuthUI();
});

// Boutons
$all('.btn-discord').forEach(b => b.addEventListener('click', loginWithDiscord));
$all('.btn-logout').forEach(b => b.addEventListener('click', logout));

// Démarrage
refreshAuthUI();

// ------- ACTUS / POSTS -------

// Pagination
const PAGE_SIZE = 6;
let currentFrom = 0;
let reachedEnd = false;

// DOM
const $newsList = document.getElementById('newsList');
const $loadMore = document.getElementById('loadMoreBtn');

// Modal DOM
const $postModal    = document.getElementById('postModal');
const $postClose    = document.getElementById('postCloseBtn');
const $postBackdrop = document.getElementById('postBackdrop');
const $postTitle    = document.getElementById('postTitle');
const $postMeta     = document.getElementById('postMeta');
const $postCover    = document.getElementById('postCover');
const $postBody     = document.getElementById('postBody');

// -- Guard: cette page a-t-elle la section "actus" complète ?
const POSTS_PRESENT = $newsList && $loadMore && $postModal && $postClose && $postBackdrop && $postTitle && $postMeta && $postCover && $postBody;

// Focus pour l'accessibilité
let lastFocusEl = null;

function fmtDate(iso){
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  } catch { return ''; }
}

// ---------- Helpers excerpt + erreurs ----------
function stripMarkdown(s=''){
  return s
    .replace(/```[\s\S]*?```/g, '')       // blocs code
    .replace(/`[^`]*`/g, '')              // inline code
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')  // images
    .replace(/\[([^\]]*)]\([^)]+\)/g, '$1') // liens -> texte
    .replace(/[*_~>#-]+/g, '')            // tokens md
    .replace(/\n{2,}/g, ' ')
    .trim();
}
function makeExcerpt(post){
  if (post.excerpt && post.excerpt.trim()) return post.excerpt.trim();
  const txt = stripMarkdown(post.body_md || '');
  return txt.slice(0, 220) + (txt.length > 220 ? '…' : '');
}
function showErrorBanner(whereEl, error, context=''){
  const code = error?.code || error?.message || 'UNKNOWN';
  const msg  = `Le contenu n’a pas pu être chargé${context ? ` (${context})` : ''}. Code : ${code}`;
  const html = `<div class="error-banner">${msg}</div>`;
  whereEl.insertAdjacentHTML('afterbegin', html);
}

// ---------- Requêtes Supabase ----------
async function fetchPosts(from = 0, to = PAGE_SIZE - 1) {
  const { data, error } = await supabase
    .from('posts')
    .select('id, slug, title, excerpt, body_md, cover_url, created_at, published_at, published')
    .eq('published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('fetchPosts error', error);
    showErrorBanner($newsList, error, 'liste');
    return [];
  }
  return data || [];
}

async function fetchPostBySlug(slug) {
  const { data, error } = await supabase
    .from('posts')
    .select('id, slug, title, excerpt, body_md, cover_url, created_at, published_at, published')
    .eq('slug', slug)
    .eq('published', true)
    .limit(1)
    .single();

  if (error) {
    console.error('fetchPostBySlug error', error);
    showErrorBanner($newsList, error, `article “${slug}”`);
    return null;
  }
  return data;
}


// ---------- Rendu cartes ----------
function cardTemplate(post){
  const coverHTML = post.cover_url
    ? `<div class="card-img"><img src="${post.cover_url}" alt="${post.title}"></div>`
    : `<div class="card-img"><img src="./assets/logokairoscomplet.png" alt="${post.title}"></div>`;

  const excerpt = makeExcerpt(post);

  return `
    <article class="card" data-slug="${post.slug}" tabindex="0" role="button"
      aria-label="Ouvrir l’article : ${post.title}">
      <h3 class="card-title">${post.title}</h3>
      ${coverHTML}
      <p class="card-excerpt">${excerpt}</p>
    </article>`;
}

function renderPosts(posts){
  const html = posts.map(cardTemplate).join('');
  $newsList.insertAdjacentHTML('beforeend', html);
}

// ---------- Modal ----------
function openPostModal(post){
  lastFocusEl = document.activeElement;

  $postTitle.textContent = post.title;
  $postMeta.textContent  = fmtDate(post.created_at) || '';

  if (post.cover_url){
    $postCover.src = post.cover_url;
    $postCover.style.display = '';
  } else {
    $postCover.style.display = 'none';
  }

  // rendu markdown simplifié
  $postBody.innerHTML = (post.body_md || '')
    .split('\n\n').map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');

  $postModal.classList.add('open');
  $postModal.setAttribute('aria-hidden', 'false');

  // deep-link
  const newHash = `#post/${post.slug}`;
  if (location.hash !== newHash) history.pushState(null, '', newHash);

  setTimeout(() => $postClose.focus(), 0);
}

function closePostModal(){
  $postModal.classList.remove('open');
  $postModal.setAttribute('aria-hidden', 'true');

  if (location.hash.startsWith('#post/')) {
    history.pushState(null, '', '#');
  }
  if (lastFocusEl) lastFocusEl.focus();
}
// ------- DEFIS / CAPTAIN_CHALLENGES -------
const $defisList = document.getElementById('defisList');
const CHAL_PRESENT = !!$defisList;

function fmtRange(starts_on, ends_on){
  if (!starts_on && !ends_on) return '';
  const f = (d) => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
  if (starts_on && ends_on) return `${f(starts_on)} → ${f(ends_on)}`;
  return starts_on ? `dès ${f(starts_on)}` : `jusqu’au ${f(ends_on)}`;
}

async function fetchChallenges(){
  const { data, error } = await supabase
    .from('captain_challenges')
    .select('id, slug, title, summary, cover_url, starts_on, ends_on, published, created_at')
    .eq('published', true)
    .order('starts_on', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchChallenges error', error);
    showErrorBanner($defisList, error, 'défis');
    return [];
  }
  return data || [];
}

function challengeCardTemplate(ch){
  const coverHTML = ch.cover_url
    ? `<div class="card-img"><img src="${ch.cover_url}" alt="${ch.title}"></div>`
    : `<div class="card-img"><img src="./assets/logokairoscomplet.png" alt="${ch.title}"></div>`;

const dates = fmtRange(ch.starts_on, ch.ends_on);
const meta  = dates || '';

  const key = ch.slug || `id-${ch.id}`;

  return `
    <article class="card" data-key="${key}" tabindex="0" role="button" aria-label="Ouvrir le défi : ${ch.title}">
      <h3 class="card-title">${ch.title}</h3>
      ${coverHTML}
      ${meta ? `<p class="card-excerpt">${meta}</p>` : (ch.summary ? `<p class="card-excerpt">${ch.summary}</p>` : '')}
    </article>`;
}

function renderChallenges(list){
  $defisList.innerHTML = list.map(challengeCardTemplate).join('');
}

async function bootChallenges(){
  const list = await fetchChallenges();
  renderChallenges(list);
}
// ---------- MODALE DEFIS ----------
const $chalModal    = document.getElementById('chalModal');
const $chalClose    = document.getElementById('chalCloseBtn');
const $chalBackdrop = document.getElementById('chalBackdrop');
const $chalTitle    = document.getElementById('chalTitle');
const $chalMeta     = document.getElementById('chalMeta');
const $chalCover    = document.getElementById('chalCover');
const $chalBody     = document.getElementById('chalBody');

const CHAL_MODAL_OK = CHAL_PRESENT && $chalModal && $chalClose && $chalBackdrop && $chalTitle && $chalMeta && $chalCover && $chalBody;

let challengesCache = new Map(); // key -> object

// on remplit le cache après le fetch
const _origBootChallenges = bootChallenges;
bootChallenges = async function(){
  const list = await fetchChallenges();
  challengesCache = new Map(list.map(ch => [String(ch.slug || `id-${ch.id}`), ch]));
  renderChallenges(list);
};

function openChalModal(ch){
  $chalTitle.textContent = ch.title;
  const dates = fmtRange(ch.starts_on, ch.ends_on);
  $chalMeta.textContent = dates || '';

  if (ch.cover_url) {
    $chalCover.src = ch.cover_url;
    $chalCover.classList.remove('hidden');
  } else {
    $chalCover.removeAttribute('src');
    $chalCover.classList.add('hidden');
  }

  $chalBody.innerHTML = ch.summary ? `<p>${ch.summary}</p>` : '';

  $chalModal.classList.add('open');
  $chalModal.setAttribute('aria-hidden','false');
  setTimeout(() => $chalClose.focus(), 0);
}
function closeChalModal(){
  $chalModal.classList.remove('open');
  $chalModal.setAttribute('aria-hidden','true');
}

// Events (défis)
if (CHAL_MODAL_OK) {
  $defisList.addEventListener('click', (e)=>{
    const card = e.target.closest('.card');
    if (!card) return;
    const key = card.getAttribute('data-key');
    const ch = challengesCache.get(String(key));
    if (ch) openChalModal(ch);
  });
  $defisList.addEventListener('keydown', (e)=>{
    const isActivate = (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar');
    if (!isActivate) return;
    e.preventDefault();
    const card = e.target.closest('.card');
    if (!card) return;
    const key = card.getAttribute('data-key');
    const ch = challengesCache.get(String(key));
    if (ch) openChalModal(ch);
  });

  $chalClose.addEventListener('click', closeChalModal);
  $chalBackdrop.addEventListener('click', closeChalModal);
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && $chalModal.classList.contains('open')) closeChalModal(); });
}
// ------- GALERIE -------
const $galleryList = document.getElementById('galleryList');
const GALLERY_PRESENT = !!$galleryList;

async function fetchGallery(){
  const { data, error } = await supabase
    .from('gallery_images')
    .select('id, title, alt, img_url, published, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchGallery error', error);
    showErrorBanner($galleryList, error, 'galerie');
    return [];
  }
  return data || [];
}

function galleryCardTemplate(img, index){
  const alt = img.alt || img.title || 'Image de la galerie';
  const title = img.title ? `<h3 class="card-title">${img.title}</h3>` : '';
  return `
    <article class="card" data-index="${index}" tabindex="0" role="button" aria-label="Voir l’image en grand">
      <div class="card-img"><img src="${img.img_url}" alt="${alt}"></div>
      ${title}
    </article>`;
}
function renderGallery(items){
  $galleryList.innerHTML = items.map((img, i) => galleryCardTemplate(img, i)).join('');
}

async function bootGallery(){
  const items = await fetchGallery();
  renderGallery(items);
}
// ---------- MODALE GALERIE ----------
const $galleryModal    = document.getElementById('galleryModal');
const $galleryClose    = document.getElementById('galleryCloseBtn');
const $galleryBackdrop = document.getElementById('galleryBackdrop');
const $galleryFull     = document.getElementById('galleryFull');
const $galleryTitle    = document.getElementById('galleryTitle');
const $galleryAlt      = document.getElementById('galleryAlt');

const GALLERY_MODAL_OK = GALLERY_PRESENT && $galleryModal && $galleryClose && $galleryBackdrop && $galleryFull && $galleryTitle && $galleryAlt;

let galleryCache = []; // tableau d'images {img_url, title, alt,...}

const _origBootGallery = bootGallery;
bootGallery = async function(){
  galleryCache = await fetchGallery();
  renderGallery(galleryCache);
};

function openGalleryModal(index){
  const img = galleryCache[index];
  if (!img) return;
  $galleryFull.src   = img.img_url;
  $galleryFull.alt   = img.alt || img.title || 'Image de la galerie';
  $galleryTitle.textContent = img.title || '';
  $galleryAlt.textContent   = img.alt || '';
  $galleryModal.classList.add('open');
  $galleryModal.setAttribute('aria-hidden','false');
  setTimeout(() => $galleryClose.focus(), 0);
}
function closeGalleryModal(){
  $galleryModal.classList.remove('open');
  $galleryModal.setAttribute('aria-hidden','true');
}

// Events (galerie)
if (GALLERY_MODAL_OK) {
  $galleryList.addEventListener('click', (e)=>{
    const card = e.target.closest('.card');
    if (!card) return;
    const idx = parseInt(card.getAttribute('data-index'), 10);
    openGalleryModal(idx);
  });
  $galleryList.addEventListener('keydown', (e)=>{
    const isActivate = (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar');
    if (!isActivate) return;
    e.preventDefault();
    const card = e.target.closest('.card');
    if (!card) return;
    const idx = parseInt(card.getAttribute('data-index'), 10);
    openGalleryModal(idx);
  });

  $galleryClose.addEventListener('click', closeGalleryModal);
  $galleryBackdrop.addEventListener('click', closeGalleryModal);
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && $galleryModal.classList.contains('open')) closeGalleryModal(); });
}
// ---------- Boot ----------
async function bootPosts(){
  // première page
  const first = await fetchPosts(0, PAGE_SIZE - 1);
  renderPosts(first);
  currentFrom = first.length;

  // bouton "Charger plus"
  if (first.length === PAGE_SIZE) {
    $loadMore.classList.toggle('hidden', first.length !== PAGE_SIZE);
  }

  // deep-link direct : #post/slug
  if (location.hash.startsWith('#post/')) {
    const slug = location.hash.slice('#post/'.length);
    const post = await fetchPostBySlug(slug);
    if (post) openPostModal(post);
  }
}

if (POSTS_PRESENT) {
  // Boutons/fermetures
  $postClose.addEventListener('click', closePostModal);
  $postBackdrop.addEventListener('click', closePostModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $postModal.classList.contains('open')) closePostModal();
  });

  // ---------- Interactions cartes ----------
  $newsList.addEventListener('click', async (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const slug = card.getAttribute('data-slug');
    const post = await fetchPostBySlug(slug);
    if (post) openPostModal(post);
  });

  // ouverture au clavier (Enter/Space sur la carte)
  $newsList.addEventListener('keydown', async (e) => {
    const isActivate = (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar');
    if (!isActivate) return;
    e.preventDefault();
    const card = e.target.closest('.card');
    if (!card) return;
    const slug = card.getAttribute('data-slug');
    const post = await fetchPostBySlug(slug);
    if (post) openPostModal(post);
  });

  // ---------- Pagination ----------
  $loadMore.addEventListener('click', async () => {
    if (reachedEnd) return;
    const next = await fetchPosts(currentFrom, currentFrom + PAGE_SIZE - 1);
    renderPosts(next);
    currentFrom += next.length;
    if (next.length < PAGE_SIZE) {
      reachedEnd = true;
      $loadMore.classList.add('hidden');
    }
  });

  // ---------- Hash routing : #post/slug ----------
  window.addEventListener('hashchange', async () => {
    const m = location.hash.match(/^#post\/(.+)$/);
    if (m && m[1]) {
      const post = await fetchPostBySlug(m[1]);
      if (post) openPostModal(post);
    } else {
      closePostModal();
    }
  });

  // ---------- Boot ----------
  bootPosts();
}
//--------Challenges--------
if (CHAL_PRESENT) {
  bootChallenges();
}
//--------Gallery--------
if (GALLERY_PRESENT) {
  bootGallery();
}
