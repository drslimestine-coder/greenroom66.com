const COLORS = ['#c9a24b','#b2394a','#7c9885','#6a8caf','#a56bb0','#c17a4a','#5a9e9e','#b0788f'];
let token = localStorage.getItem('gr_token') || null;
let currentUser = null;
let characters = [];
let currentPersonaId = null;
let currentCharacterId = null;
let modalType = 'persona';
let selectedColor = COLORS[0];
let isSending = false;
let authMode = 'login';
let activeMessages = [];
let activePersonaId = null, activeCharacterId = null;

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function api(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, Object.assign({}, options, { headers }));
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

/* ---------- Auth ---------- */
function setAuthMode(mode){
  authMode = mode;
  document.getElementById('authTabLogin').classList.toggle('active', mode==='login');
  document.getElementById('authTabRegister').classList.toggle('active', mode==='register');
  document.getElementById('displayNameField').classList.toggle('hide', mode!=='register');
  document.getElementById('adminCodeField').classList.toggle('hide', mode!=='register');
  document.getElementById('authSubmitBtn').textContent = mode==='login' ? 'Log in' : 'Sign up';
  document.getElementById('authError').textContent = '';
}

async function submitAuth(){
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  try{
    let data;
    if(authMode === 'login'){
      data = await api('/auth/login', { method:'POST', body: JSON.stringify({ email, password }) });
    }else{
      const displayName = document.getElementById('authDisplayName').value.trim();
      const adminCode = document.getElementById('authAdminCode').value.trim();
      data = await api('/auth/register', { method:'POST', body: JSON.stringify({ email, password, displayName, adminCode }) });
    }
    token = data.token;
    localStorage.setItem('gr_token', token);
    currentUser = data.user;
    enterApp();
  }catch(e){
    errEl.textContent = e.message;
  }
}

function logout(){
  token = null;
  localStorage.removeItem('gr_token');
  currentUser = null;
  document.getElementById('appRoot').classList.add('hide');
  document.getElementById('authView').classList.remove('hide');
}

async function tryResumeSession(){
  if(!token) return;
  try{
    const data = await api('/auth/me');
    currentUser = data.user;
    enterApp();
  }catch(e){
    token = null;
    localStorage.removeItem('gr_token');
  }
}

function enterApp(){
  document.getElementById('authView').classList.add('hide');
  document.getElementById('appRoot').classList.remove('hide');
  document.getElementById('identityName').textContent = currentUser.displayName;
  document.getElementById('tabAdmin').classList.toggle('hide', !currentUser.isAdmin);
  loadCharacters();
  maybeShowOnboarding();
}

/* ---------- Onboarding ---------- */
const ONBOARD_STEPS = [
  { icon:'🎭', title:'Welcome to The Greenroom', body:"This is your space to build a cast of characters and step into scenes with them. Here's a quick look at how it fits together \u2014 takes about 30 seconds." },
  { icon:'🎫', title:'Start with a Persona', body:'A persona is the "you" who steps on stage. Give it a name and a bit of personality \u2014 you\u2019ll write your lines as this character during scenes.' },
  { icon:'🎪', title:'Add Characters', body:'Characters are who the AI plays opposite you \u2014 an original character you invent, or your own take on someone from a fandom you love. You control their personality and background.' },
  { icon:'🖼️', title:'Explore the Public Gallery', body:'Anyone can publish a character for others to meet. Browse the gallery and tap "Add to my cast" to bring someone else\u2019s character into your own scenes.' },
  { icon:'📣', title:'Publish Your Own', body:'Made a character you\u2019re proud of? Open its card and hit "Publish to gallery" to share it with everyone. You can unpublish it again anytime.' },
  { icon:'🎬', title:'Begin a Scene', body:'Pick a persona and a character, hit Begin Scene, and start writing. The AI stays in character and replies like a script, line by line. Your scenes and cast are saved to your account automatically.' }
];
let onboardStep = 0;

function maybeShowOnboarding(){
  const key = 'gr_onboarded_' + currentUser.id;
  if(localStorage.getItem(key)) return;
  onboardStep = 0;
  renderOnboardStep();
  document.getElementById('onboardOverlay').classList.add('show');
}

function restartOnboarding(){
  onboardStep = 0;
  renderOnboardStep();
  document.getElementById('onboardOverlay').classList.add('show');
}

function renderOnboardStep(){
  const step = ONBOARD_STEPS[onboardStep];
  document.getElementById('onboardIcon').textContent = step.icon;
  document.getElementById('onboardTitle').textContent = step.title;
  document.getElementById('onboardBody').textContent = step.body;
  document.getElementById('onboardDots').innerHTML = ONBOARD_STEPS.map((_, i) =>
    `<span class="onboard-dot ${i===onboardStep?'active':''}"></span>`).join('');
  document.getElementById('onboardBackBtn').style.visibility = onboardStep === 0 ? 'hidden' : 'visible';
  document.getElementById('onboardNextBtn').textContent = onboardStep === ONBOARD_STEPS.length - 1 ? "Let's go" : 'Next';
}

function onboardNext(){
  if(onboardStep === ONBOARD_STEPS.length - 1){ finishOnboarding(); return; }
  onboardStep++;
  renderOnboardStep();
}
function onboardBack(){
  if(onboardStep === 0) return;
  onboardStep--;
  renderOnboardStep();
}
function skipOnboarding(){ finishOnboarding(); }
function finishOnboarding(){
  localStorage.setItem('gr_onboarded_' + currentUser.id, '1');
  document.getElementById('onboardOverlay').classList.remove('show');
}

/* ---------- Tabs ---------- */
function switchTab(tab){
  document.getElementById('tabHome').classList.toggle('active', tab==='home');
  document.getElementById('tabGallery').classList.toggle('active', tab==='gallery');
  document.getElementById('tabAdmin').classList.toggle('active', tab==='admin');
  document.getElementById('homeView').classList.toggle('hide', tab!=='home');
  document.getElementById('galleryView').classList.toggle('hide', tab!=='gallery');
  document.getElementById('adminView').classList.toggle('hide', tab!=='admin');
  if(tab==='gallery') loadGallery();
  if(tab==='admin') loadAdmin();
}

/* ---------- Characters ---------- */
async function loadCharacters(){
  try{
    const data = await api('/characters');
    characters = data.characters;
  }catch(e){ characters = []; }
  render();
}

function render(){
  const personas = characters.filter(c => c.type === 'persona');
  const npcs = characters.filter(c => c.type === 'character');

  document.getElementById('personaCount').textContent = personas.length;
  document.getElementById('characterCount').textContent = npcs.length;
  document.getElementById('personaEmpty').style.display = personas.length ? 'none' : 'block';
  document.getElementById('characterEmpty').style.display = npcs.length ? 'none' : 'block';

  document.getElementById('personaGrid').innerHTML = personas.map(cardHtml).join('');
  document.getElementById('characterGrid').innerHTML = npcs.map(cardHtml).join('');

  document.getElementById('personaPicks').innerHTML = personas.map(c => pickChipHtml(c, currentPersonaId===c.id)).join('') || '<span class="empty-note" style="border:none;padding:6px 0;">Create a persona above first.</span>';
  document.getElementById('characterPicks').innerHTML = npcs.map(c => pickChipHtml(c, currentCharacterId===c.id)).join('') || '<span class="empty-note" style="border:none;padding:6px 0;">Create a character above first.</span>';
  document.getElementById('beginBtn').disabled = !(currentPersonaId && currentCharacterId);
}

function cardHtml(c){
  const initial = (c.name||'?').trim().charAt(0).toUpperCase() || '?';
  const publishBtn = c.type === 'character'
    ? `<button class="mini-btn" onclick="event.stopPropagation(); togglePublish('${c.id}')">${c.public ? 'Unpublish from gallery' : 'Publish to gallery'}</button>`
    : '';
  return `<div class="card clickable" onclick="cardClicked('${c.id}')">
    <div class="card-actions">
      <button class="icon-btn" title="Edit" onclick="event.stopPropagation(); editCharacter('${c.id}')">&#9998;</button>
      <button class="icon-btn" title="Delete" onclick="event.stopPropagation(); deleteCharacter('${c.id}')">&#10005;</button>
    </div>
    <div class="portrait" style="background:${c.color}">${escapeHtml(initial)}</div>
    <div class="body">
      <p class="name">${escapeHtml(c.name)}${c.public ? ' <span class="admin-badge" style="background:var(--sage);">Public</span>' : ''}</p>
      <p class="tagline">${escapeHtml(c.tagline || (c.fandom ? c.fandom : 'Original'))}</p>
      <span class="tag-pill ${c.type}">${c.type === 'persona' ? 'Persona' : (c.fandom ? escapeHtml(c.fandom) : 'Original')}</span>
      ${publishBtn}
    </div>
  </div>`;
}

function pickChipHtml(c, selected){
  const initial = (c.name||'?').trim().charAt(0).toUpperCase() || '?';
  return `<div class="pick-chip ${selected?'selected':''}" onclick="pick('${c.type}','${c.id}')">
    <span class="mini" style="background:${c.color}">${escapeHtml(initial)}</span>${escapeHtml(c.name)}
  </div>`;
}

function cardClicked(id){
  const c = characters.find(x => x.id === id);
  if(!c) return;
  pick(c.type, id);
}

function pick(kind, id){
  if(kind === 'persona') currentPersonaId = (currentPersonaId === id ? null : id);
  else currentCharacterId = (currentCharacterId === id ? null : id);
  render();
}

/* ---------- Modal / CRUD ---------- */
function openModal(type){
  document.getElementById('editId').value = '';
  document.getElementById('fieldName').value = '';
  document.getElementById('fieldTagline').value = '';
  document.getElementById('fieldFandom').value = '';
  document.getElementById('fieldDescription').value = '';
  document.getElementById('modalError').textContent = '';
  selectedColor = COLORS[Math.floor(Math.random()*COLORS.length)];
  buildSwatches();
  setModalType(type);
  document.getElementById('modalTitle').textContent = type === 'persona' ? 'New Persona' : 'New Character';
  document.getElementById('modalOverlay').classList.add('show');
  setTimeout(() => document.getElementById('fieldName').focus(), 50);
}

function editCharacter(id){
  const c = characters.find(x => x.id === id);
  if(!c) return;
  document.getElementById('editId').value = c.id;
  document.getElementById('fieldName').value = c.name;
  document.getElementById('fieldTagline').value = c.tagline || '';
  document.getElementById('fieldFandom').value = c.fandom || '';
  document.getElementById('fieldDescription').value = c.description || '';
  document.getElementById('modalError').textContent = '';
  selectedColor = c.color;
  buildSwatches();
  setModalType(c.type);
  document.getElementById('modalTitle').textContent = 'Edit ' + (c.type === 'persona' ? 'Persona' : 'Character');
  document.getElementById('modalOverlay').classList.add('show');
}

function buildSwatches(){
  document.getElementById('swatches').innerHTML = COLORS.map(col =>
    `<div class="swatch ${col===selectedColor?'selected':''}" style="background:${col}" onclick="chooseColor('${col}')"></div>`
  ).join('');
}
function chooseColor(col){ selectedColor = col; buildSwatches(); }

function setModalType(type){
  modalType = type;
  document.querySelectorAll('#typeToggle button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
}

function closeModal(){ document.getElementById('modalOverlay').classList.remove('show'); }

async function saveCharacter(){
  const name = document.getElementById('fieldName').value.trim();
  if(!name){ document.getElementById('modalError').textContent = 'Give your character a name first.'; return; }
  const editId = document.getElementById('editId').value;
  const payload = {
    type: modalType, name,
    tagline: document.getElementById('fieldTagline').value.trim(),
    fandom: document.getElementById('fieldFandom').value.trim(),
    description: document.getElementById('fieldDescription').value.trim(),
    color: selectedColor
  };
  try{
    if(editId) await api('/characters/' + editId, { method:'PUT', body: JSON.stringify(payload) });
    else await api('/characters', { method:'POST', body: JSON.stringify(payload) });
    closeModal();
    await loadCharacters();
  }catch(e){
    document.getElementById('modalError').textContent = e.message;
  }
}

async function deleteCharacter(id){
  if(!confirm('Remove this character from the greenroom? Their scenes will be lost too.')) return;
  try{
    await api('/characters/' + id, { method:'DELETE' });
    if(currentPersonaId === id) currentPersonaId = null;
    if(currentCharacterId === id) currentCharacterId = null;
    await loadCharacters();
  }catch(e){ alert(e.message); }
}

async function togglePublish(id){
  try{
    await api('/characters/' + id + '/publish', { method:'POST' });
    await loadCharacters();
  }catch(e){ alert(e.message); }
}

/* ---------- Gallery ---------- */
async function loadGallery(){
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '<div class="empty-note">Loading the gallery...</div>';
  try{
    const data = await api('/gallery');
    document.getElementById('galleryCount').textContent = data.gallery.length;
    document.getElementById('galleryEmpty').style.display = data.gallery.length ? 'none' : 'block';
    grid.innerHTML = data.gallery.map(p => {
      const initial = (p.name||'?').trim().charAt(0).toUpperCase() || '?';
      return `<div class="card">
        <div class="portrait" style="background:${p.color}">${escapeHtml(initial)}</div>
        <div class="body">
          <p class="name">${escapeHtml(p.name)}</p>
          <p class="by-line">by ${escapeHtml(p.author)}</p>
          <p class="tagline">${escapeHtml(p.tagline || (p.fandom ? p.fandom : 'Original'))}</p>
          <span class="tag-pill character">${p.fandom ? escapeHtml(p.fandom) : 'Original'}</span>
          <div class="gallery-actions"><button class="mini-btn" onclick="addFromGallery('${p.id}')">Add to my cast</button></div>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    grid.innerHTML = `<div class="empty-note">${escapeHtml(e.message)}</div>`;
  }
}

async function addFromGallery(id){
  try{
    const data = await api('/gallery/' + id + '/add', { method:'POST' });
    alert(`${data.name} was added to your cast. Find them under Characters in Your Greenroom.`);
    await loadCharacters();
  }catch(e){ alert(e.message); }
}

/* ---------- Admin ---------- */
async function loadAdmin(){
  try{
    const usersData = await api('/admin/users');
    document.getElementById('usersTableBody').innerHTML = usersData.users.map(u => `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.displayName)}</td>
        <td>${u.isAdmin ? 'Admin' : 'User'}</td>
        <td><span class="pill-status ${u.isBanned ? 'banned' : 'ok'}">${u.isBanned ? 'Banned' : 'Active'}</span></td>
        <td>${u.id === currentUser.id ? '' : `<button class="mini-btn" style="margin:0;" onclick="toggleBan('${u.id}', ${u.isBanned})">${u.isBanned ? 'Unban' : 'Ban'}</button>`}</td>
      </tr>
    `).join('');

    const galleryData = await api('/admin/gallery');
    document.getElementById('adminGalleryGrid').innerHTML = galleryData.gallery.map(p => {
      const initial = (p.name||'?').trim().charAt(0).toUpperCase() || '?';
      return `<div class="card">
        <div class="portrait" style="background:${p.color}">${escapeHtml(initial)}</div>
        <div class="body">
          <p class="name">${escapeHtml(p.name)}</p>
          <p class="by-line">by ${escapeHtml(p.author)}</p>
          <div class="gallery-actions"><button class="mini-btn danger" onclick="removeFromGallery('${p.id}')">Remove from gallery</button></div>
        </div>
      </div>`;
    }).join('') || '<div class="empty-note">Nothing published yet.</div>';
  }catch(e){
    alert(e.message);
  }
}

async function toggleBan(userId, isBanned){
  try{
    await api(`/admin/users/${userId}/${isBanned ? 'unban' : 'ban'}`, { method:'POST' });
    await loadAdmin();
  }catch(e){ alert(e.message); }
}

async function removeFromGallery(id){
  if(!confirm('Remove this character from the public gallery?')) return;
  try{
    await api('/admin/gallery/' + id, { method:'DELETE' });
    await loadAdmin();
  }catch(e){ alert(e.message); }
}

/* ---------- Scenes / Chat ---------- */
async function beginScene(){
  if(!currentPersonaId || !currentCharacterId) return;
  activePersonaId = currentPersonaId;
  activeCharacterId = currentCharacterId;
  try{
    const data = await api(`/chat/${activePersonaId}/${activeCharacterId}`);
    activeMessages = data.messages;
  }catch(e){ activeMessages = []; }

  const persona = characters.find(c => c.id === activePersonaId);
  const character = characters.find(c => c.id === activeCharacterId);
  document.getElementById('sceneTitle').innerHTML = `You are <b>${escapeHtml(persona.name)}</b>, opposite <b>${escapeHtml(character.name)}</b>`;
  document.getElementById('homeView').classList.add('hide');
  document.getElementById('stageView').classList.remove('hide');
  renderScript();
  document.getElementById('composerInput').focus();
}

function goHome(){
  document.getElementById('stageView').classList.add('hide');
  document.getElementById('homeView').classList.remove('hide');
  render();
}

function renderScript(){
  const persona = characters.find(c => c.id === activePersonaId);
  const character = characters.find(c => c.id === activeCharacterId);
  const page = document.getElementById('scriptPage');
  if(activeMessages.length === 0){
    page.innerHTML = `<div class="thinking-dots">The curtain rises. Write the first line to begin the scene with ${escapeHtml(character.name)}...</div>`;
    return;
  }
  page.innerHTML = activeMessages.map(m => {
    const speakerName = m.role === 'user' ? persona.name : character.name;
    const cls = m.role === 'user' ? 'user' : 'character';
    return `<div class="line ${cls}"><div class="speaker">${escapeHtml(speakerName)}</div><div class="content">${escapeHtml(m.content)}</div></div>`;
  }).join('');
  page.scrollTop = page.scrollHeight;
}

async function sendMessage(){
  if(isSending) return;
  const input = document.getElementById('composerInput');
  const text = input.value.trim();
  if(!text) return;
  const character = characters.find(c => c.id === activeCharacterId);

  activeMessages.push({ role:'user', content:text });
  input.value = '';
  renderScript();

  isSending = true;
  document.getElementById('sendBtn').disabled = true;
  const page = document.getElementById('scriptPage');
  page.insertAdjacentHTML('beforeend', `<div class="thinking-dots" id="thinkingLine">${escapeHtml(character.name)} is composing a reply...</div>`);
  page.scrollTop = page.scrollHeight;

  try{
    const data = await api(`/chat/${activePersonaId}/${activeCharacterId}/message`, { method:'POST', body: JSON.stringify({ content: text }) });
    activeMessages = data.messages;
    renderScript();
  }catch(e){
    const thinkLine = document.getElementById('thinkingLine');
    if(thinkLine) thinkLine.remove();
    page.insertAdjacentHTML('beforeend', `<div class="thinking-dots" style="color:var(--red);">${escapeHtml(e.message)}</div>`);
  }finally{
    isSending = false;
    document.getElementById('sendBtn').disabled = false;
  }
}

document.getElementById('composerInput').addEventListener('keydown', function(e){
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
});
document.getElementById('composerInput').addEventListener('input', function(){
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 140) + 'px';
});
document.getElementById('authPassword').addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ submitAuth(); }
});

tryResumeSession();
