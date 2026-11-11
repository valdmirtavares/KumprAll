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
    <div class="field"><label for="authEmail">E-mail</label><input id="authEmail" type="email" required autocomplete="email"></div>
    <div class="field"><label for="authPassword">Palavra-passe</label><input id="authPassword" type="password" required minlength="6" autocomplete="current-password"></div>
    <p id="authMessage" class="note" aria-live="polite">Entre na sua conta ou crie uma nova.</p>
    <button class="btn btn-primary" type="submit" style="width:100%">Entrar</button>
    <button class="btn btn-light" type="button" id="registerButton" style="width:100%;margin-top:9px">Criar conta</button>
    <button class="btn" type="button" id="resetButton" style="width:100%;margin-top:5px;background:transparent;color:#057451">Recuperar palavra-passe</button>
  </form>`;
document.body.append(authDialog);

// Exigir autenticação antes de aceder a Favoritos ou publicar anúncios.
document.getElementById("favoritesBtn").addEventListener("click", event => {
  if (currentUser) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  authMessage("Para guardar e consultar favoritos, crie uma conta ou entre na sua conta.");
  authDialog.showModal();
}, true);

document.getElementById("openForm").addEventListener("click", event => {
  if (currentUser) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  authMessage("Para publicar um anúncio na KUMPRALL, crie uma conta ou entre na sua conta.");
  authDialog.showModal();
}, true);

const authMessage = (text, error = false) => {
  const el = document.getElementById("authMessage");
  el.textContent = text;
  el.style.color = error ? "#b42318" : "#526C60";
};

let currentUser = null;
let databaseListings = [];
let previewUrls = [];

const form = document.getElementById("listingForm");
const imageField = form.querySelector("#image");
imageField.type = "file";
imageField.accept = "image/jpeg,image/png,image/webp,image/gif";
imageField.multiple = true;
imageField.removeAttribute("placeholder");
imageField.setAttribute("aria-describedby", "imageHelp");
const imageLabel = form.querySelector('label[for="image"]');
imageLabel.textContent = "Fotografias do anúncio (até 5 imagens)";
const imageHelp = document.createElement("small");
imageHelp.id = "imageHelp";
imageHelp.className = "note";
imageHelp.textContent = "Escolha directamente do computador ou telemóvel. JPG, PNG, WEBP ou GIF; máximo 5 MB por imagem.";
imageField.insertAdjacentElement("afterend", imageHelp);
const preview = document.createElement("div");
preview.id = "imagePreview";
preview.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";
imageHelp.insertAdjacentElement("afterend", preview);
const submitStatus = document.createElement("p");
submitStatus.id = "listingStatus";
submitStatus.className = "note";
submitStatus.setAttribute("aria-live", "polite");
form.querySelector('button[type="submit"]').insertAdjacentElement("beforebegin", submitStatus);

function setListingStatus(text, isError = false) {
  submitStatus.textContent = text;
  submitStatus.style.color = isError ? "#b42318" : "#087B59";
}
imageField.addEventListener("change", () => {
  previewUrls.forEach(URL.revokeObjectURL);
  previewUrls = [];
  preview.innerHTML = "";
  const files = [...imageField.files];
  if (files.length > 5) {
    imageField.value = "";
    setListingStatus("Pode seleccionar no máximo 5 fotografias.", true);
    return;
  }
  for (const file of files) {
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      imageField.value = "";
      preview.innerHTML = "";
      setListingStatus("Formato inválido ou imagem superior a 5 MB. Use JPG, PNG, WEBP ou GIF.", true);
      return;
    }
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Pré-visualização da fotografia";
    img.style.cssText = "width:86px;height:72px;object-fit:cover;border-radius:9px;border:1px solid #dce8e0";
    preview.append(img);
  }
  setListingStatus(files.length ? files.length + " fotografia(s) seleccionada(s)." : "");
});

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
const detailDialog = document.createElement("dialog");
detailDialog.id = "listingDetailDialog";
detailDialog.innerHTML = `
  <div class="modal-head"><h2 id="detailTitle">Detalhes do anúncio</h2><button class="close" id="detailClose" aria-label="Fechar">×</button></div>
  <div id="detailContent" style="padding:20px 23px 24px"></div>`;
document.body.append(detailDialog);
document.getElementById("detailClose").addEventListener("click", () => detailDialog.close());

const chatDialog = document.createElement("dialog");
chatDialog.id = "kumprallChatDialog";
chatDialog.innerHTML = `
  <div class="modal-head"><h2 id="chatHeading">Conversa KUMPRALL</h2><button class="close" id="chatClose" aria-label="Fechar">×</button></div>
  <div id="chatMessages" style="padding:16px 20px;max-height:48vh;overflow:auto;background:#f7faf8"></div>
  <form id="chatForm" style="padding:14px 20px;display:flex;gap:8px;align-items:end">
    <textarea id="chatInput" required maxlength="4000" placeholder="Escreva a sua mensagem..." style="flex:1;min-height:64px;border:1px solid #dce5e0;border-radius:10px;padding:10px"></textarea>
    <button class="btn btn-primary" type="submit">Enviar</button>
  </form>
  <p id="chatStatus" class="note" style="padding:0 20px" aria-live="polite"></p>`;
document.body.append(chatDialog);
document.getElementById("chatClose").addEventListener("click",()=>chatDialog.close());
let activeConversationId = null;
async function loadConversationMessages() {
  const box=document.getElementById("chatMessages");
  const {data,error}=await supabase.from("kumprall_messages").select("id,sender_id,body,created_at").eq("conversation_id",activeConversationId).order("created_at",{ascending:true});
  if(error){box.textContent="Não foi possível carregar as mensagens: "+error.message;return;}
  box.innerHTML=data.length?data.map(m=>`<div style="display:flex;justify-content:${m.sender_id===currentUser.id?"flex-end":"flex-start"};margin:8px 0"><div style="max-width:85%;padding:10px 13px;border-radius:14px;background:${m.sender_id===currentUser.id?"#dff5e9":"white"};white-space:pre-wrap;overflow-wrap:anywhere">${escapeText(m.body)}<div style="font-size:10px;color:#718078;margin-top:5px">${new Date(m.created_at).toLocaleString("pt-PT")}</div></div></div>`).join(""):'<p style="color:#64766F;text-align:center">Esta conversa ainda não tem mensagens.</p>';
  box.scrollTop=box.scrollHeight;
}
async function startConversation(item) {
  if(!currentUser){detailDialog.close();authMessage("Entre ou crie uma conta para enviar mensagens ao vendedor.");authDialog.showModal();return;}
  if(currentUser.id===item.owner_id){document.getElementById("detailContent").insertAdjacentHTML("beforeend",'<p class="note">Este é o seu anúncio. Não pode enviar uma mensagem a si próprio.</p>');return;}
  const button=document.getElementById("contactSellerButton");
  button.disabled=true;button.textContent="A abrir conversa…";
  try{
    let {data:conversation,error}=await supabase.from("kumprall_conversations").select("id").eq("listing_id",item.id).eq("buyer_id",currentUser.id).eq("seller_id",item.owner_id).maybeSingle();
    if(error) throw error;
    if(!conversation){
      const created=await supabase.from("kumprall_conversations").insert({listing_id:item.id,buyer_id:currentUser.id,seller_id:item.owner_id}).select("id").single();
      if(created.error && created.error.code!=="23505") throw created.error;
      conversation=created.data;
      if(!conversation){
        const retry=await supabase.from("kumprall_conversations").select("id").eq("listing_id",item.id).eq("buyer_id",currentUser.id).eq("seller_id",item.owner_id).single();
        if(retry.error) throw retry.error;
        conversation=retry.data;
      }
    }
    activeConversationId=conversation.id;
    document.getElementById("chatHeading").textContent="Mensagem sobre: "+item.title;
    document.getElementById("chatStatus").textContent="";
    detailDialog.close();chatDialog.showModal();await loadConversationMessages();
  }catch(error){
    document.getElementById("chatStatus").textContent="Não foi possível iniciar a conversa: "+error.message;
  }finally{button.disabled=false;button.textContent="Enviar mensagem ao vendedor";}
}
document.getElementById("chatForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!activeConversationId||!currentUser)return;
  const input=document.getElementById("chatInput"),button=event.submitter;
  const body=input.value.trim();if(!body)return;
  button.disabled=true;document.getElementById("chatStatus").textContent="A enviar…";
  const {error}=await supabase.from("kumprall_messages").insert({conversation_id:activeConversationId,sender_id:currentUser.id,body});
  if(error)document.getElementById("chatStatus").textContent="Erro ao enviar: "+error.message;
  else{input.value="";document.getElementById("chatStatus").textContent="Mensagem enviada.";await loadConversationMessages();}
  button.disabled=false;
});

function openListingDetails(id) {
  const item = databaseListings.find(listing => String(listing.id) === String(id));
  if (!item) return;
  document.getElementById("detailTitle").textContent = item.title;
  const image = item.image
    ? `<img src="${escapeText(item.image)}" alt="${escapeText(item.title)}" style="width:100%;max-height:340px;object-fit:contain;border-radius:12px;background:#f2f6f3;margin-bottom:16px">`
    : "";
  document.getElementById("detailContent").innerHTML = `
    ${image}
    <div style="font-size:25px;font-weight:850;color:#087B59;margin-bottom:8px">${new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(item.price)}</div>
    <p style="color:#64766F;margin:0 0 12px">${escapeText(item.location)} · ${escapeText(item.category)}</p>
    <h3 style="margin:0 0 7px">Descrição</h3>
    <p style="white-space:pre-wrap;line-height:1.6;margin:0 0 18px">${escapeText(item.description || "O vendedor não adicionou uma descrição.")}</p>
    <button class="btn btn-primary" id="contactSellerButton" style="width:100%">Enviar mensagem ao vendedor</button>
    <p class="note" style="margin:10px 0 0">Negocie com segurança através das mensagens da KUMPRALL.</p>`;
  document.getElementById("contactSellerButton").addEventListener("click", () => startConversation(item));
  detailDialog.showModal();
}

function showListings(rows) {
  databaseListings = (rows || []).map(row => ({
    id: row.id, owner_id: row.owner_id, title: row.title, price: Number(row.price), category: row.category,
    location: row.location, description: row.description || "",
    image: row.image_url || "", date: new Date(row.created_at).getTime()
  }));
  const grid = document.getElementById("listings");
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
    <article class="card" data-listing-id="${escapeText(item.id)}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeText(item.title)}" style="cursor:pointer">
      <div class="photo">${item.image ? `<img src="${escapeText(item.image)}" alt="${escapeText(item.title)}" onerror="this.remove()">` : "<span>📦</span>"}</div>
      <div class="card-body"><div class="price">${new Intl.NumberFormat("pt-PT",{style:"currency",currency:"EUR"}).format(item.price)}</div>
      <h3>${escapeText(item.title)}</h3><div class="meta">${escapeText(item.location)} · ${escapeText(item.category)}</div>
      <p>${escapeText(item.description)}</p></div>
    </article>`).join("") : '<div class="empty">Ainda não existem anúncios publicados. Seja o primeiro a anunciar!</div>';
}
async function refreshListings() {
  const { data, error } = await supabase.from("kumprall_listings")
    .select("id,owner_id,title,description,price,category,location,image_url,status,created_at")
    .eq("status","active").order("created_at",{ascending:false});
  if (error) {
    document.getElementById("listings").innerHTML = '<div class="empty">Não foi possível carregar os anúncios. Actualize a página ou tente novamente.</div>';
    console.error("KUMPRALL refresh listings:", error);
    return;
  }
  showListings(data);
}
async function updateSession(session) {
  currentUser = session?.user || null;
  authButton.textContent = currentUser ? "A minha conta · Sair" : "Entrar / Registar";
  document.getElementById("openForm").disabled = false;
  document.getElementById("openForm").title = currentUser ? "Publicar anúncio" : "Entre na sua conta para anunciar";
  await refreshListings();
}
authButton.addEventListener("click", async () => {
  if (currentUser) {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("KUMPRALL sign out:", error);
  } else authDialog.showModal();
});
document.getElementById("authClose").addEventListener("click", () => authDialog.close());
document.getElementById("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const { error } = await supabase.auth.signInWithPassword({email,password});
  if (error) return authMessage(error.message, true);
  authDialog.close();
});
document.getElementById("registerButton").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || password.length < 6) return authMessage("Indique um e-mail e uma palavra-passe com pelo menos 6 caracteres.", true);
  const { error } = await supabase.auth.signUp({email,password,options:{emailRedirectTo:"https://kumprall.vercel.app"}});
  if (error) return authMessage(error.message, true);
  authMessage("Pedido enviado. Consulte o seu e-mail para confirmar a conta.");
});
document.getElementById("resetButton").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) return authMessage("Indique primeiro o seu e-mail.", true);
  const { error } = await supabase.auth.resetPasswordForEmail(email,{redirectTo:"https://kumprall.vercel.app"});
  authMessage(error ? error.message : "Se a conta existir, receberá um e-mail para redefinir a palavra-passe.", !!error);
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!currentUser) {
    setListingStatus("A sua sessão terminou. Entre novamente para publicar.", true);
    authDialog.showModal();
    return;
  }
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const price = Number(form.querySelector('[name="price"]').valueAsNumber);
  const category = String(data.get("category") || "");
  const locationText = String(data.get("location") || "").trim();
  if (!title || !Number.isFinite(price) || price < 0 || !category || !locationText) {
    setListingStatus("Preencha o título, preço, categoria e localidade correctamente.", true);
    return;
  }
  const files = [...imageField.files];
  if (files.length > 5) return setListingStatus("Pode seleccionar no máximo 5 fotografias.", true);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "A publicar…";
  setListingStatus("A guardar o anúncio…");
  try {
    const uploadedUrls = [];
    for (const file of files) {
      const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
      const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("kumprall-listing-images").upload(path,file,{contentType:file.type,upsert:false});
      if (uploadError) throw new Error("Falha ao carregar fotografia: " + uploadError.message + ". Confirme se executou o SQL de armazenamento no Supabase.");
      const { data: publicData } = supabase.storage.from("kumprall-listing-images").getPublicUrl(path);
      uploadedUrls.push(publicData.publicUrl);
    }
    const { error: insertError } = await supabase.from("kumprall_listings").insert({
      owner_id: currentUser.id,
      title,
      price,
      category,
      location: locationText,
      description: String(data.get("description") || "").trim(),
      image_url: uploadedUrls[0] || null
    });
    if (insertError) throw new Error("A base de dados recusou a publicação: " + insertError.message);
    form.reset();
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    preview.innerHTML = "";
    setListingStatus("Anúncio publicado com sucesso!");
    document.getElementById("listingDialog").close();
    await refreshListings();
    window.scrollTo({top:0,behavior:"smooth"});
  } catch (error) {
    console.error("KUMPRALL publish error:", error);
    setListingStatus(error.message || "Ocorreu um erro inesperado ao publicar.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Publicar anúncio";
  }
}, true);

listingGrid.addEventListener("click", event => {
  const card = event.target.closest("[data-listing-id]");
  if (!card) return;
  openListingDetails(card.dataset.listingId);
});
listingGrid.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-listing-id]")) {
    event.preventDefault();
    openListingDetails(event.target.dataset.listingId);
  }
});
document.getElementById("searchInput").addEventListener("input", () => showListings(databaseListings));
document.getElementById("sortSelect").addEventListener("change", () => showListings(databaseListings));
document.getElementById("categories").addEventListener("click", () => setTimeout(() => showListings(databaseListings),0));
supabase.auth.onAuthStateChange((_event, session) => { void updateSession(session); });
const { data: { session } } = await supabase.auth.getSession();
await updateSession(session);
