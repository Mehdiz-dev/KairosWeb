// login.js
import { supabase } from '../supabaseClient.js';

const form = document.getElementById('staffLoginForm');
const email = document.getElementById('email');
const pass  = document.getElementById('password');
const err   = document.getElementById('err');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: pass.value
    });
    if (error) throw error;

    // assure le profile
    await supabase.from('profiles').upsert({ id: data.user.id }, { onConflict: 'id' });

    // vérifie rôle
    const { data: prof } = await supabase.from('profiles')
      .select('role').eq('id', data.user.id).maybeSingle();

    if (!['staff','superadmin'].includes(prof?.role)) {
      await supabase.auth.signOut();
      throw new Error("Accès staff requis. Contacte l'admin pour t'ajouter.");
    }

    location.href = './admin.html';
  } catch (e2) {
    err.textContent = e2.message || 'Erreur inconnue';
  } finally {
    btn.disabled = false;
  }
});
