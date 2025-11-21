// admin.js
import { supabase, SUPABASE_URL } from '../supabaseClient.js';


// -- attend la 1ère session dispo (hydratation locale + onAuthStateChange)
async function awaitSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  return new Promise((resolve) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (sess) { subscription.unsubscribe(); resolve(sess); }
    });
    setTimeout(() => { try { subscription.unsubscribe(); } catch {} resolve(null); }, 800);
  });
}

// ---- guard staff
async function requireStaff(){
  const session = await awaitSession();
  if (!session) { location.href = './login.html'; return null; }

  const { data: prof, error } = await supabase
    .from('profiles')
    .select('role,username')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) console.warn('profiles read', error);
  if (!['staff', 'superadmin'].includes(prof?.role)) { location.href = './login.html'; return null; }

  document.getElementById('who').textContent = prof.username || session.user.email;
  return session.user;
}

function slugify(s){
    return s.toLowerCase().trim()
        .replace(/[àâä]/g,'a').replace(/[éèêë]/g,'e').replace(/[îï]/g,'i').replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u').replace(/[ç]/g,'c')
        .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

async function uploadTo(bucket, file, prefix=''){
    const ext = file.name.split('.').pop();
    const path = `${prefix}${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert:false });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}

// ===== Listing / Edit / Delete =====
let editing = { post: null, chal: null, gal: null };

const TBL = { post: 'posts', chal: 'captain_challenges', gal: 'gallery_images' };

function escapeHtml(s=''){ return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[c])); }
function fmtDate(s){ try{ return new Date(s).toLocaleString(); } catch{ return s||''; } }

async function meRole(){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session) return { uid:null, role:null };
  const uid = session.user.id;
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
  return { uid, role: prof?.role || null };
}

function renderList(containerId, items, type){
  const $c = document.getElementById(containerId);
  if (!$c) return;
  if (!items || !items.length){
    $c.innerHTML = '<p class="muted">Rien ici pour le moment.</p>';
    return;
  }
  $c.innerHTML = items.map(x => `
    <div class="row" data-type="${type}" data-id="${x.id}">
      <div class="title">${escapeHtml(x.title || x.alt || '(sans titre)')}</div>
      <div class="meta">${x.published ? 'Publié' : 'Brouillon'} • ${fmtDate(x.created_at)}</div>
      <div class="actions">
        <button type="button" class="btn btn-sm edit">Éditer</button>
        <button type="button" class="btn btn-sm danger delete">Supprimer</button>
      </div>
    </div>
  `).join('');
}

async function loadPosts(uid, role){
  // mine
  {
    const { data, error } = await supabase
      .from('posts')
      .select('id,title,slug,published,created_at')
      .eq('created_by', uid)
      .order('created_at', { ascending:false });
    if (!error) renderList('postListMine', data, 'post');
  }
  // all (superadmin)
  if (role === 'superadmin'){
    const $h3 = document.querySelector('h3.superadmin-only');
    const $all = document.getElementById('postListAll');
    if ($h3) $h3.hidden = false;
    if ($all) $all.hidden = false;

    const { data, error } = await supabase
      .from('posts')
      .select('id,title,slug,published,created_at')
      .order('created_at', { ascending:false });
    if (!error) renderList('postListAll', data, 'post');
  }
}

async function loadChals(uid, role){
  {
    const { data, error } = await supabase
      .from('captain_challenges')
      .select('id,title,slug,published,created_at')
      .eq('created_by', uid)
      .order('created_at', { ascending:false });
    if (!error) renderList('chalListMine', data, 'chal');
  }
  if (role === 'superadmin'){
    const elH = document.querySelector('#chalListAll')?.previousElementSibling;
    if (elH) elH.hidden = false;
    const $all = document.getElementById('chalListAll'); if ($all) $all.hidden = false;

    const { data, error } = await supabase
      .from('captain_challenges')
      .select('id,title,slug,published,created_at')
      .order('created_at', { ascending:false });
    if (!error) renderList('chalListAll', data, 'chal');
  }
}

async function loadGallery(uid, role){
  {
    const { data, error } = await supabase
      .from('gallery_images')
      .select('id,title,alt,published,created_at')
      .eq('created_by', uid)
      .order('created_at', { ascending:false });
    if (!error) renderList('galListMine', data, 'gal');
  }
  if (role === 'superadmin'){
    const elH = document.querySelector('#galListAll')?.previousElementSibling;
    if (elH) elH.hidden = false;
    const $all = document.getElementById('galListAll'); if ($all) $all.hidden = false;

    const { data, error } = await supabase
      .from('gallery_images')
      .select('id,title,alt,published,created_at')
      .order('created_at', { ascending:false });
    if (!error) renderList('galListAll', data, 'gal');
  }
}

async function refreshAllLists(){
  const { uid, role } = await meRole();
  if (!uid) return;
  await Promise.all([ loadPosts(uid, role), loadChals(uid, role), loadGallery(uid, role) ]);
}

// Delegation edit/delete
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = btn.closest('.row');
  if (!row) return;

  const type = row.dataset.type;
  const id   = row.dataset.id;

  // edit
  if (btn.classList.contains('edit')){
    const { data, error } = await supabase.from(TBL[type]).select('*').eq('id', id).maybeSingle();
    if (error || !data) return alert(error?.message || 'Introuvable');

    // focus onglet & remplir form
    if (type === 'post'){
      document.querySelector('[data-tab="tab-posts"]').click();
      editing.post = id;
      fPost.title.value   = data.title || '';
      fPost.slug.value    = data.slug || '';
      fPost.excerpt.value = data.excerpt || '';
      fPost.body_md.value = data.body_md || '';
      if ('published' in fPost) fPost.published.checked = !!data.published;
      fPost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (type === 'chal'){
      document.querySelector('[data-tab="tab-challenges"]').click();
      editing.chal = id;
      fChal.title.value     = data.title || '';
      fChal.slug.value      = data.slug || '';
      fChal.summary.value   = data.summary || '';
      fChal.starts_on.value = data.starts_on || '';
      fChal.ends_on.value   = data.ends_on || '';
      if ('published' in fChal) fChal.published.checked = !!data.published;
      fChal.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (type === 'gal'){
      document.querySelector('[data-tab="tab-gallery"]').click();
      editing.gal = id;
      fGal.title.value = data.title || '';
      fGal.alt.value   = data.alt || '';
      if ('published' in fGal) fGal.published.checked = !!data.published;
      fGal.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // delete
  if (btn.classList.contains('delete')){
    if (!confirm('Supprimer définitivement cet élément ?')) return;
    const { error } = await supabase.from(TBL[type]).delete().eq('id', id);
    if (error) return alert(error.message);
    await refreshAllLists();
  }
});


// tabs
const tabBtns = document.querySelectorAll('[data-tab]');
const panels = document.querySelectorAll('.panel');
tabBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
        tabBtns.forEach(b=>b.setAttribute('aria-selected','false'));
        panels.forEach(p=>p.classList.remove('active'));
        btn.setAttribute('aria-selected','true');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// POSTS
const fPost = document.getElementById('formPost');
fPost.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('postMsg'); msg.textContent=''; msg.className='';
  try{
    const title   = fPost.title.value.trim();
    const slug    = fPost.slug.value.trim() || slugify(title);
    const excerpt = fPost.excerpt.value.trim();
    const body_md = fPost.body_md.value.trim();
    const published = fPost.published.checked;

    // upload cover seulement si un fichier a été choisi
    let cover_url = '';
    if (fPost.cover?.files?.[0]) {
      cover_url = await uploadTo('covers', fPost.cover.files[0], `posts/`);
    }

    const payload = {
      title, slug, excerpt, body_md,
      published,
      published_at: published ? new Date().toISOString() : null,
    };
    if (cover_url) payload.cover_url = cover_url;

    if (editing.post){
      // UPDATE
      const { error } = await supabase.from('posts').update(payload).eq('id', editing.post);
      if (error) throw error;
      editing.post = null;
      msg.textContent = 'Article mis à jour ✅'; msg.className='success';
    } else {
      // INSERT
      const { data: { user: u } } = await supabase.auth.getUser();
      payload.created_by = u.id;
      const { error } = await supabase.from('posts').insert(payload);
      if (error) throw error;
      msg.textContent = 'Article créé ✅'; msg.className='success';
    }

    fPost.reset();
    await refreshAllLists();
  }catch(err){ msg.textContent = err.message; msg.className='error'; }
});


// CHALLENGES
const fChal = document.getElementById('formChallenge');
fChal.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('chalMsg'); msg.textContent=''; msg.className='';
  try{
    const title = fChal.title.value.trim();
    const slug = fChal.slug.value.trim() || slugify(title);
    const summary = fChal.summary.value.trim();
    const starts_on = fChal.starts_on.value || null;
    const ends_on   = fChal.ends_on.value   || null;
    const published = fChal.published.checked;

    let cover_url = '';
    if (fChal.cover?.files?.[0]) {
      cover_url = await uploadTo('covers', fChal.cover.files[0], `challenges/`);
    }

    const payload = { title, slug, summary, starts_on, ends_on, published };
    if (cover_url) payload.cover_url = cover_url;

    if (editing.chal){
      // UPDATE
      const { error } = await supabase.from('captain_challenges').update(payload).eq('id', editing.chal);
      if (error) throw error;
      editing.chal = null;
      msg.textContent = 'Défi mis à jour ✅'; msg.className='success';
    } else {
      // INSERT
      const { data: { user: u } } = await supabase.auth.getUser();
      payload.created_by = u.id;
      const { error } = await supabase.from('captain_challenges').insert(payload);
      if (error) throw error;
      msg.textContent = 'Défi créé ✅'; msg.className='success';
    }

    fChal.reset();
    await refreshAllLists();
  }catch(err){ msg.textContent = err.message; msg.className='error'; }
});


// GALERIE
const fGal = document.getElementById('formGallery');
fGal.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('galMsg'); msg.textContent=''; msg.className='';
  try{
    // image seulement si création OU si on veut en changer
    let img_url = '';
    if (fGal.img?.files?.[0]) {
      img_url = await uploadTo('gallery', fGal.img.files[0], `images/`);
    }

    const title = fGal.title.value.trim();
    const alt   = fGal.alt.value.trim();
    const published = fGal.published.checked;

    const payload = { title, alt, published };
    if (img_url) payload.img_url = img_url;

    if (editing.gal){
      // UPDATE
      const { error } = await supabase.from('gallery_images').update(payload).eq('id', editing.gal);
      if (error) throw error;
      editing.gal = null;
      msg.textContent = 'Image mise à jour ✅'; msg.className='success';
    } else {
      // INSERT (exige une image)
      if (!img_url) throw new Error('Ajoute une image');
      const { data: { user: u } } = await supabase.auth.getUser();
      payload.created_by = u.id;
      const { error } = await supabase.from('gallery_images').insert(payload);
      if (error) throw error;
      msg.textContent = 'Image ajoutée ✅'; msg.className='success';
    }

    fGal.reset();
    await refreshAllLists();
  }catch(err){ msg.textContent = err.message; msg.className='error'; }
});

// boot
await requireStaff();
await refreshAllLists();
// active la première tab
document.querySelector('[data-tab="tab-posts"]').click();

// après requireStaff()
const { data: { user } } = await supabase.auth.getUser();
const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

if (me?.role === 'superadmin') {
  const btn = document.querySelector('[data-tab="tab-users"]');
  if (btn) btn.hidden = false;

  const $create = document.getElementById('fCreateStaff');
  const $msgC = document.getElementById('userMsg');
  $create?.addEventListener('submit', async (e) => {
    e.preventDefault(); $msgC.textContent='';
    const form = new FormData($create);
    const payload = Object.fromEntries(form.entries());
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/staff_admin/create`, {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${session.access_token}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    $msgC.textContent = res.ok ? 'Compte créé ✅' : `Erreur: ${await res.text()}`;
    if (res.ok) $create.reset();
  });
  const $del = document.getElementById('fDeleteStaff');
  const $msgD = document.getElementById('delMsg');
  $del?.addEventListener('submit', async (e) => {
    e.preventDefault(); $msgD.textContent='';
    const form = new FormData($del);
    const payload = Object.fromEntries(form.entries());
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/staff_admin/delete`, {
      method:'DELETE',
      headers:{ 'Authorization': `Bearer ${session.access_token}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    $msgD.textContent = res.ok ? 'Compte supprimé ✅' : `Erreur: ${await res.text()}`;
    if (res.ok) $del.reset();
  });
}