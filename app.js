const SUPA_URL =
  "https://akzadkpcuglvlwajqbzu.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFremFka3BjdWdsdmx3YWpxYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDY5NzYsImV4cCI6MjA5NjE4Mjk3Nn0.2QL-0ZYQ6Zm4VCG7S27aBsSshzO2B0GMQ4ZnxdAmV3A";

const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_KEY);

const db = {
  profiles: () => sb.schema("app").from("profiles"),
  pacientes: () => sb.schema("app").from("pacientes"),
};

let PACIENTES = [];
let filtroAtivo = "todos";
let userNome = "";

// ── CÁLCULOS AUTOMÁTICOS ──────────────────────

function calcProxData(dataStr, meses) {
  if (!dataStr) return "";
  const d = new Date(dataStr + "T00:00:00");
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().split("T")[0];
}

function calcStatus(proxStr) {
  if (!proxStr) return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prox = new Date(proxStr + "T00:00:00");
  const diffDias = Math.ceil((prox - hoje) / (1000 * 60 * 60 * 24));
  if (diffDias <= 0) return "VENCIDA";
  if (diffDias <= 30) return "EM BREVE";
  return "A VENCER";
}

// Status sempre recalculado a partir da data — nunca lê o valor congelado do banco.
// Garante que VENCIDA/EM BREVE/A VENCER mudem sozinhos todo dia, sem precisar editar o paciente.
function statusReceita(p) {
  return calcStatus(p.receita_prox);
}

function statusCtrl(p) {
  return calcStatus(p.ctrl_prox);
}

function atualizarCamposReceita() {
  const data = document.getElementById("pac-rec-data").value;
  const prox = calcProxData(data, 6);
  const status = calcStatus(prox);
  document.getElementById("pac-rec-prox").value = prox ? fmtData(prox) : "";
  document.getElementById("pac-rec-status").value = status;
  atualizarCorStatus("pac-rec-status", status);
}

function atualizarCamposControlada() {
  const data = document.getElementById("pac-ctrl-data").value;
  const prox = calcProxData(data, 2);
  const status = calcStatus(prox);
  document.getElementById("pac-ctrl-prox").value = prox ? fmtData(prox) : "";
  document.getElementById("pac-ctrl-status").value = status;
  atualizarCorStatus("pac-ctrl-status", status);
}

function atualizarCorStatus(elId, status) {
  const el = document.getElementById(elId);
  el.className = "status-display " +
    (status === "VENCIDA" ? "status-vencida" :
     status === "EM BREVE" ? "status-breve" :
     status === "A VENCER" ? "status-ok" : "");
}

// ── CONDIÇÃO ─────────────────────────────────

function montarCondicao() {
  const cond = document.getElementById("pac-cond").value;
  const sm = document.getElementById("pac-saude-mental").checked;
  if (!cond) return "";
  return sm ? cond + " + SAÚDE MENTAL" : cond;
}

function separarCondicao(valor) {
  if (!valor) return { cond: "", sm: false };
  const sm = valor.includes("+ SAÚDE MENTAL");
  const cond = valor.replace(" + SAÚDE MENTAL", "").trim();
  return { cond, sm };
}

// ── AUTH ──────────────────────────────────────

async function init() {
  // Checagem direta na URL — não depende do timing do evento PASSWORD_RECOVERY.
  // O link do e-mail volta com "type=recovery" no hash (ou na query, em alguns casos).
  const veioDeRecuperacao =
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery");

  if (veioDeRecuperacao) {
    alternarForm("nova-senha");
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (session) entrarNoApp(session.user);
}

// Quando a ACS clica no link de recuperação do e-mail, o Supabase abre uma
// sessão temporária de "recovery" — em vez de entrar no app, mostramos a
// tela de definir nova senha.
sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    alternarForm("nova-senha");
  }
});

async function fazerLogin() {
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  mostrarMsg("login-msg", "", "");
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) { mostrarMsg("login-msg", "E-mail ou senha incorretos.", "error"); return; }
  entrarNoApp(data.user);
}

async function criarConta() {
  const nome = document.getElementById("cad-nome").value.trim();
  const setor = document.getElementById("cad-setor").value.trim();
  const email = document.getElementById("cad-email").value.trim();
  const senha = document.getElementById("cad-senha").value;

  if (!nome || !email || !senha) {
    mostrarMsg("login-msg", "Preencha todos os campos obrigatórios.", "error");
    return;
  }
  if (senha.length < 6) {
    mostrarMsg("login-msg", "A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }

  // Impede que a mesma ACS crie uma segunda conta (com nome igual ou e-mail já usado).
  const { data: checagem, error: erroCheck } = await sb
    .schema("app")
    .rpc("checar_cadastro_duplicado", { p_nome: nome, p_email: email })
    .single();

  if (erroCheck) { mostrarMsg("login-msg", "Erro ao validar cadastro: " + erroCheck.message, "error"); return; }

  if (checagem?.nome_duplicado) {
    mostrarMsg("login-msg", "Já existe uma conta com esse nome. Esqueceu a senha? Use 'Esqueceu a senha?' no login.", "error");
    return;
  }
  if (checagem?.email_duplicado) {
    mostrarMsg("login-msg", "Esse e-mail já está cadastrado. Use 'Esqueceu a senha?' no login.", "error");
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email, password: senha,
    options: { data: { nome, setor } },
  });

  if (error) { mostrarMsg("login-msg", error.message, "error"); return; }

  if (data.session) {
    entrarNoApp(data.user);
  } else {
    mostrarMsg("login-msg", "Conta criada! Verifique seu e-mail para confirmar.", "success");
  }
}

async function enviarRecuperacao() {
  const email = document.getElementById("rec-email").value.trim();
  if (!email) { mostrarMsg("login-msg", "Informe seu e-mail.", "error"); return; }

  mostrarMsg("login-msg", "", "");
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  if (error) { mostrarMsg("login-msg", "Erro ao enviar: " + error.message, "error"); return; }
  mostrarMsg("login-msg", "Link enviado! Verifique seu e-mail (e a caixa de spam).", "success");
}

async function salvarNovaSenha() {
  const senha = document.getElementById("nova-senha").value;
  const confirmar = document.getElementById("nova-senha-confirmar").value;

  if (senha.length < 6) { mostrarMsg("login-msg", "A senha precisa ter pelo menos 6 caracteres.", "error"); return; }
  if (senha !== confirmar) { mostrarMsg("login-msg", "As senhas não coincidem.", "error"); return; }

  const { error } = await sb.auth.updateUser({ password: senha });
  if (error) { mostrarMsg("login-msg", "Erro ao salvar: " + error.message, "error"); return; }

  await sb.auth.signOut();
  mostrarMsg("login-msg", "Senha atualizada! Faça login com a nova senha.", "success");
  alternarForm("login");
}

async function entrarNoApp(user) {
  document.getElementById("screen-login").style.display = "none";
  document.getElementById("screen-app").style.display = "block";

  const { data: prof } = await db.profiles()
    .select("nome,setor").eq("id", user.id).single();

  userNome = prof?.nome || user.email;
  document.getElementById("user-nome").textContent =
    "👤 " + userNome + (prof?.setor ? " · " + prof.setor : "");

  await carregarPacientes();

  sb.channel("pacientes-realtime")
    .on("postgres_changes", { event: "*", schema: "app", table: "pacientes" },
      () => carregarPacientes())
    .subscribe();
}

async function sair() {
  await sb.auth.signOut();
  location.reload();
}

// ── DADOS ─────────────────────────────────────

async function carregarPacientes() {
  const { data, error } = await db.pacientes().select("*").order("nome");
  if (error) { console.error(error); return; }
  PACIENTES = data || [];
  renderSummary();
  renderTabela();
  document.getElementById("loading").style.display = "none";
  document.getElementById("tabela").style.display = "";
}

// ── HELPERS ───────────────────────────────────

function statusGeral(p) {
  const statuses = [statusReceita(p), statusCtrl(p)].filter(Boolean);
  if (statuses.includes("VENCIDA")) return "VENCIDA";
  if (statuses.includes("EM BREVE")) return "EM BREVE";
  if (statuses.includes("A VENCER")) return "A VENCER";
  return "";
}

function condClass(c) {
  if (!c) return "";
  if (c.includes("SAÚDE MENTAL") && c.length > 13) return "cond-HD"; // combinada
  if (c.includes("/")) return "cond-HD";
  if (c.includes("HIPERT")) return "cond-H";
  if (c.includes("DIAB")) return "cond-D";
  if (c.includes("SAÚDE")) return "cond-S";
  return "";
}

function condLabel(c) {
  if (!c) return "—";
  return c
    .replace("HIPERTENSA (O)/DIABÉTICA (O)", "Hipert. + Diab.")
    .replace("HIPERTENSA (O)", "Hipertensa(o)")
    .replace("DIABÉTICA (O)", "Diabética(o)")
    .replace("SAÚDE MENTAL", "S. Mental");
}

function badgeStatus(s) {
  if (!s) return '<span class="badge badge-none">—</span>';
  const cls = s === "VENCIDA" ? "badge-vencida" : s === "EM BREVE" ? "badge-breve" : "badge-ok";
  return '<span class="badge ' + cls + '">' + s + "</span>";
}

function fmtData(d) {
  if (!d) return "—";
  const parts = d.split("-");
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function mostrarMsg(elId, texto, tipo) {
  const el = document.getElementById(elId);
  el.textContent = texto;
  el.className = "msg" + (tipo ? " " + tipo : "");
}

function alternarForm(modo) {
  document.getElementById("form-login").style.display = modo === "login" ? "" : "none";
  document.getElementById("form-cadastro").style.display = modo === "cadastro" ? "" : "none";
  document.getElementById("form-recuperar").style.display = modo === "recuperar" ? "" : "none";
  document.getElementById("form-nova-senha").style.display = modo === "nova-senha" ? "" : "none";
  mostrarMsg("login-msg", "", "");
}

// ── RENDER ────────────────────────────────────

function renderSummary() {
  document.getElementById("cnt-total").textContent = PACIENTES.length;
  document.getElementById("cnt-vencida").textContent = PACIENTES.filter(p => statusGeral(p) === "VENCIDA").length;
  document.getElementById("cnt-breve").textContent = PACIENTES.filter(p => statusGeral(p) === "EM BREVE").length;
  document.getElementById("cnt-ok").textContent = PACIENTES.filter(p => statusGeral(p) === "A VENCER").length;
  renderAlertas();
}

function criarAlertaItem(p) {
  const recVenc = statusReceita(p) === "VENCIDA";
  const recBreve = statusReceita(p) === "EM BREVE";
  const ctlVenc = statusCtrl(p) === "VENCIDA";
  const ctlBreve = statusCtrl(p) === "EM BREVE";
  const vencida = recVenc || ctlVenc;

  const tipo = [];
  if (recVenc || recBreve) tipo.push("Receita" + (recVenc ? " vencida" : " vence em breve"));
  if (ctlVenc || ctlBreve) tipo.push("Controlada" + (ctlVenc ? " vencida" : " vence em breve"));

  const proxData = recVenc || recBreve ? p.receita_prox : p.ctrl_prox;
  const proxTexto = proxData ? " · Próx: " + fmtData(proxData) : "";

  const div = document.createElement("div");
  div.className = "alerta-item" + (vencida ? "" : " breve");

  const icone = document.createElement("span");
  icone.className = "alerta-icon";
  icone.textContent = vencida ? "🔴" : "🟡";

  const texto = document.createElement("div");
  texto.className = "alerta-texto";

  const nome = document.createElement("strong");
  nome.textContent = p.nome;

  const detalhe = document.createElement("small");
  detalhe.textContent = tipo.join(" · ") + proxTexto;

  const btn = document.createElement("button");
  btn.className = "action-btn";
  btn.textContent = "Atualizar";
  btn.addEventListener("click", () => editarPaciente(p.id));

  texto.appendChild(nome);
  texto.appendChild(detalhe);
  div.appendChild(icone);
  div.appendChild(texto);
  div.appendChild(btn);
  return div;
}

function renderAlertas() {
  const urgentes = PACIENTES.filter(p =>
    statusReceita(p) === "VENCIDA" || statusCtrl(p) === "VENCIDA" ||
    statusReceita(p) === "EM BREVE" || statusCtrl(p) === "EM BREVE"
  ).sort((a, b) => {
    const peso = s => s === "VENCIDA" ? 0 : s === "EM BREVE" ? 1 : 2;
    return Math.min(peso(statusReceita(a)), peso(statusCtrl(a))) -
           Math.min(peso(statusReceita(b)), peso(statusCtrl(b)));
  });

  const wrap = document.getElementById("alertas-wrap");
  const list = document.getElementById("alertas-list");

  if (urgentes.length === 0) { wrap.classList.remove("visible"); return; }
  wrap.classList.add("visible");
  list.innerHTML = "";
  urgentes.forEach(p => list.appendChild(criarAlertaItem(p)));
}

function criarLinhaTabela(p) {
  const tr = document.createElement("tr");

  const tdNome = document.createElement("td");
  const divNome = document.createElement("div");
  divNome.className = "nome-cell";
  divNome.textContent = p.nome;
  const divSus = document.createElement("div");
  divSus.className = "sub-cell";
  divSus.textContent = p.sus || "";
  tdNome.appendChild(divNome);
  tdNome.appendChild(divSus);

  const tdCond = document.createElement("td");
  const span = document.createElement("span");
  span.className = "cond-pill " + condClass(p.condicao);
  span.textContent = condLabel(p.condicao);
  tdCond.appendChild(span);

  const tdRecStatus = document.createElement("td");
  tdRecStatus.innerHTML = badgeStatus(statusReceita(p));

  const tdRecProx = document.createElement("td");
  tdRecProx.className = "sub-cell";
  tdRecProx.textContent = fmtData(p.receita_prox);

  const tdCtlStatus = document.createElement("td");
  tdCtlStatus.innerHTML = badgeStatus(statusCtrl(p));

  const tdCtlProx = document.createElement("td");
  tdCtlProx.className = "sub-cell";
  tdCtlProx.textContent = fmtData(p.ctrl_prox);

  const tdAcoes = document.createElement("td");

  const btnEditar = document.createElement("button");
  btnEditar.className = "action-btn";
  btnEditar.textContent = "Editar";
  btnEditar.addEventListener("click", () => editarPaciente(p.id));

  const btnExcluir = document.createElement("button");
  btnExcluir.className = "action-btn del";
  btnExcluir.textContent = "Excluir";
  btnExcluir.addEventListener("click", () => excluirPaciente(p.id));

  tdAcoes.appendChild(btnEditar);
  tdAcoes.appendChild(btnExcluir);

  tr.appendChild(tdNome);
  tr.appendChild(tdCond);
  tr.appendChild(tdRecStatus);
  tr.appendChild(tdRecProx);
  tr.appendChild(tdCtlStatus);
  tr.appendChild(tdCtlProx);
  tr.appendChild(tdAcoes);
  return tr;
}

function renderTabela() {
  const busca = document.getElementById("busca").value.toLowerCase().trim();

  const lista = PACIENTES.filter(p => {
    const matchBusca = !busca ||
      (p.nome || "").toLowerCase().includes(busca) ||
      (p.sus || "").includes(busca) ||
      (p.condicao || "").toLowerCase().includes(busca);
    const matchFiltro = filtroAtivo === "todos" || statusGeral(p) === filtroAtivo;
    return matchBusca && matchFiltro;
  });

  const tbody = document.getElementById("tbody");
  const empty = document.getElementById("empty");
  tbody.innerHTML = "";

  if (lista.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";
  lista.forEach(p => tbody.appendChild(criarLinhaTabela(p)));
}

function setFiltro(btn) {
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  filtroAtivo = btn.dataset.f;
  renderTabela();
}

// ── EXPORTAR EXCEL ────────────────────────────

function exportarExcel() {
  if (PACIENTES.length === 0) { alert("Nenhum paciente para exportar."); return; }

  const dados = PACIENTES.map(p => ({
    Nome: p.nome || "",
    "Nº SUS": p.sus || "",
    "Data Nasc.": fmtData(p.data_nasc),
    Endereço: p.endereco || "",
    Condição: p.condicao || "",
    "Receita — Data": fmtData(p.receita_data),
    "Receita — Próx.": fmtData(p.receita_prox),
    "Receita — Status": statusReceita(p) || "",
    "Controlada — Data": fmtData(p.ctrl_data),
    "Controlada — Próx.": fmtData(p.ctrl_prox),
    "Controlada — Status": statusCtrl(p) || "",
  }));

  const ws = XLSX.utils.json_to_sheet(dados);
  ws["!cols"] = [20, 18, 12, 30, 28, 16, 16, 14, 16, 16, 16].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pacientes");
  const hoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  XLSX.writeFile(wb, "UBS06_Pacientes_" + hoje + ".xlsx");
}

// ── MODAL ─────────────────────────────────────

function abrirModal(id) {
  limparModal();
  document.getElementById("modal-titulo").textContent = id ? "Editar Paciente" : "Novo Paciente";
  document.getElementById("overlay").classList.add("open");
}

function fecharModal() {
  document.getElementById("overlay").classList.remove("open");
}

function limparModal() {
  ["pac-id", "pac-nome", "pac-sus", "pac-nasc", "pac-end",
   "pac-rec-data", "pac-ctrl-data"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("pac-cond").value = "";
  document.getElementById("pac-saude-mental").checked = false;
  ["pac-rec-prox", "pac-rec-status", "pac-ctrl-prox", "pac-ctrl-status"].forEach(id => {
    const el = document.getElementById(id);
    el.value = "";
    el.className = "status-display";
  });
  mostrarMsg("modal-msg", "", "");
}

function editarPaciente(id) {
  const p = PACIENTES.find(x => x.id === id);
  if (!p) return;

  abrirModal(id);
  document.getElementById("pac-id").value = p.id;
  document.getElementById("pac-nome").value = p.nome || "";
  document.getElementById("pac-sus").value = p.sus || "";
  document.getElementById("pac-nasc").value = p.data_nasc || "";
  document.getElementById("pac-end").value = p.endereco || "";

  const { cond, sm } = separarCondicao(p.condicao);
  document.getElementById("pac-cond").value = cond;
  document.getElementById("pac-saude-mental").checked = sm;

  document.getElementById("pac-rec-data").value = p.receita_data || "";
  document.getElementById("pac-rec-prox").value = p.receita_prox ? fmtData(p.receita_prox) : "";
  document.getElementById("pac-rec-status").value = statusReceita(p) || "";
  document.getElementById("pac-ctrl-data").value = p.ctrl_data || "";
  document.getElementById("pac-ctrl-prox").value = p.ctrl_prox ? fmtData(p.ctrl_prox) : "";
  document.getElementById("pac-ctrl-status").value = statusCtrl(p) || "";

  atualizarCorStatus("pac-rec-status", statusReceita(p));
  atualizarCorStatus("pac-ctrl-status", statusCtrl(p));
}

async function salvarPaciente() {
  const nome = document.getElementById("pac-nome").value.trim();
  const condicao = montarCondicao();

  if (!nome) { mostrarMsg("modal-msg", "O nome é obrigatório.", "error"); return; }

  const btn = document.getElementById("btn-salvar");
  btn.disabled = true;
  btn.textContent = "Salvando…";

  const recData = document.getElementById("pac-rec-data").value;
  const ctrlData = document.getElementById("pac-ctrl-data").value;
  const recProx = calcProxData(recData, 6);
  const ctrlProx = calcProxData(ctrlData, 2);

  const payload = {
    nome,
    sus: document.getElementById("pac-sus").value.trim() || null,
    data_nasc: document.getElementById("pac-nasc").value || null,
    endereco: document.getElementById("pac-end").value.trim() || null,
    condicao: condicao || null,
    receita_data: recData || null,
    receita_prox: recProx || null,
    receita_status: recProx ? calcStatus(recProx) : null,
    ctrl_data: ctrlData || null,
    ctrl_prox: ctrlProx || null,
    ctrl_status: ctrlProx ? calcStatus(ctrlProx) : null,
  };

  const pacId = document.getElementById("pac-id").value;
  let error;

  if (pacId) {
    ({ error } = await db.pacientes().update(payload).eq("id", pacId));
  } else {
    const { data: { user } } = await sb.auth.getUser();
    payload.acs_id = user.id;
    ({ error } = await db.pacientes().insert(payload));
  }

  btn.disabled = false;
  btn.textContent = "Salvar";

  if (error) { mostrarMsg("modal-msg", "Erro ao salvar: " + error.message, "error"); return; }

  fecharModal();
  await carregarPacientes();
}

async function excluirPaciente(id) {
  if (!confirm("Excluir este paciente? Esta ação não pode ser desfeita.")) return;
  await db.pacientes().delete().eq("id", id);
  await carregarPacientes();
}

// ── EVENTOS ───────────────────────────────────

document.getElementById("overlay").addEventListener("click", function (e) {
  if (e.target === this) fecharModal();
});

document.getElementById("pac-rec-data").addEventListener("change", atualizarCamposReceita);
document.getElementById("pac-ctrl-data").addEventListener("change", atualizarCamposControlada);

document.getElementById("login-senha").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    fazerLogin();
  }
});

document.getElementById("rec-email").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    enviarRecuperacao();
  }
});

document.getElementById("nova-senha-confirmar").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    salvarNovaSenha();
  }
});

// ── INIT ──────────────────────────────────────
init();
