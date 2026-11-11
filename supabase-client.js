import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xkjadaezbhbncgkaxpah.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GF4l3JoYDHfyDXY0RC38VA_VuCNAybO";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const nav = document.querySelector(".nav-actions");
const authButton = document.createElement("button");
authButton.className = "btn btn-light";
authButton.id = "authButton";
authButton.textContent = "Entrar / Registar";
nav.prepend(authButton);

const authDialog = document.createElement("dialog");
authDialog.id = "authDialog";
authDialog.innerHTML = `
  <div class="modal-head"><h2>Aceder à KUMPRALL</h2><button class="close" id="authClose" aria-label="Fechar">×</button></div>
  <form id="authForm">
    <div class="field"><label for="authEmail">E-mail</label><input id="authEmail" type="email" required autocomplete="email" placeholder="nome@email.com"></div>
    <div class="field"><label for="authPassword">Palavra-passe</label><input id="authPassword" type="password" required minlength="6" autocomplete="current-password" placeholder="Mínimo 6 caracteres"></div>
    <p id="authMessage" class="note" aria-live="polite">Entre na sua conta ou crie uma nova.</p>
    <button class="btn btn-primary" type="submit" style="width:100%">Entrar</button>
    <button class="btn btn-light" type="button" id="registerButton" style="width:100%;margin-top:9px">Criar conta</button>
    <button class="btn" type="button" id="resetButton" style="width:100%;margin-top:5px;background:transparent;color:#057451">Recuperar palavra-passe</button>
  </form>`;
document.body.append(authDialog);

const message = (text, error = false) => {
  const el = document.getElementById("authMessage");
  el.textContent = text;
  el.style.color = error ? "#b42318" : "#526C60";
};

let currentUser = null;
let databaseListings = [];

function showListings(rows) {
  databaseListings = rows.map(row => ({
    id: row.id,
    title: row.title,
    price: Number(row.price),
    category: row.category,
    location: row.location,
    description: row.description || "",
    image: row.image_url || "",
    emoji: "📦",
    date: new Date(row.created_at).getTime()
  }));
  const grid = document.getElementById("listings");
  if (!grid) return;
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const category = document.querySelector(".category.active")?.dataset.category || "Todas";
  const sort = document.getElementById("sortSelect").value;
  let rowsToShow = databaseListings.filter(item =>
    (category === "Todas" || item.category === category) &&
    `${item.title} ${item.location} ${item.category} ${item.description}`.toLowerCase().includes(query)
  );
  if (sort === "low") rowsToShow.sort((a,b) => a.price-b.price);
  else if (sort === "high") rowsToShow.sort((a,b) => b.price-a.price);
  else rowsToShow.sort((a,b) => b.date-a.date);
  grid.innerHTML = rowsToShow.length ? rowsToShow.map(item => `
    <article class="card">
      <div class="photo">${item.image ? `<img src="${escapeText(item.image)}" alt="${escapeText(item.title)}" onerror="this.remove()">` : "<span>📦</span>"}</div>
      <div class="card-body"><div class="price">${new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(item.price)}</div>
      <h3>${escapeText(item.title)}</h3><div class="meta">${escapeText(item.location)} · ${escapeText(item.category)}</div></div>
    </article>`).join("") : '<div class="empty">Ainda não existem anúncios publicados. Seja o primeiro a anunciar!</div>';
}
function escapeText(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
async function refreshListings() {
  const { data, error } = await supabase.from("kumprall_listings")
    .select("id,title,description,price,category,location,image_url,status,created_at")
    .eq("status","active").order("created_at",{ascending:false});
  if (error) {
    document.getElementById("listings").innerHTML = '<div class="empty">A ligação à base de dados ainda não está pronta. É necessário aplicar a migração SQL no Supabase.</div>';
    console.error("KUMPRALL listings:", error.message);
    return;
  }
  showListings(data || []);
}
async function updateSession(session) {
  currentUser = session?.user || null;
  authButton.textContent = currentUser ? "A minha conta · Sair" : "Entrar / Registar";
  document.getElementById("openForm").disabled = !currentUser;
  document.getElementById("openForm").title = currentUser ? "Publicar anúncio" : "Entre na sua conta para anunciar";
  await refreshListings();
}
authButton.addEventListener("click", async () => {
  if (currentUser) {
    await supabase.auth.signOut();
    return;
  }
  authDialog.showModal();
});
document.getElementById("authClose").addEventListener("click", () => authDialog.close());
document.getElementById("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const { error } = await supabase.auth.signInWithPassword({email,password});
  if (error) return message(error.message, true);
  message("Sessão iniciada com sucesso.");
  authDialog.close();
});
document.getElementById("registerButton").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || password.length < 6) return message("Indique um e-mail e uma palavra-passe com pelo menos 6 caracteres.", true);
  const { error } = await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
  if (error) return message(error.message, true);
  message("Conta criada. Confirme o e-mail se a verificação estiver activa.");
});
document.getElementById("resetButton").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) return message("Indique primeiro o seu e-mail.", true);
  const { error } = await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
  message(error ? error.message : "Se a conta existir, receberá um e-mail para redefinir a palavra-passe.", !!error);
});
document.getElementById("listingForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!currentUser) {
    authDialog.showModal();
    return;
  }
  const data = new FormData(event.currentTarget);
  const image = String(data.get("image") || "").trim();
  if (image && !/^https?:\/\//i.test(image)) return alert("A imagem deve começar por https:// ou http://");
  const payload = {
    owner_id: currentUser.id,
    title: String(data.get("title")).trim(),
    price: Number(data.get("price")),
    category: String(data.get("category")),
    location: String(data.get("location")).trim(),
    description: String(data.get("description") || "").trim(),
    image_url: image || null
  };
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  const { error } = await supabase.from("kumprall_listings").insert(payload);
  submit.disabled = false;
  if (error) {
    alert("Não foi possível publicar: " + error.message);
    return;
  }
  event.currentTarget.reset();
  document.getElementById("listingDialog").close();
  await refreshListings();
  window.scrollTo({top:0,behavior:"smooth"});
}, true);

document.getElementById("searchInput").addEventListener("input", () => showListings(databaseListings));
document.getElementById("sortSelect").addEventListener("change", () => showListings(databaseListings));
document.getElementById("categories").addEventListener("click", () => setTimeout(() => showListings(databaseListings),0));
supabase.auth.onAuthStateChange((_event, session) => { void updateSession(session); });
const { data: { session } } = await supabase.auth.getSession();
await updateSession(session);
