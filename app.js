const SUPA_URL =
  "https://akzadkpcuglvlwajqbzu.supabase.co";
const SUPA_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFremFka3BjdWdsdmx3YWpxYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MDY5NzYsImV4cCI6MjA5NjE4Mjk3Nn0.2QL-0ZYQ6Zm4VCG7S27aBsSshzO2B0GMQ4ZnxdAmV3A";

const { createClient } = supabase;
const sb = createClient(SUPA_URL, SUPA_KEY);

let PACIENTES = [];
let filtroAtivo = "todos";
let userNome = "";

// ── AUTH ──────────────────────────────────────

async function init() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) entrarNoApp(session.user);
}

async function fazerLogin() {
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  mostrarMsg("login-msg", "", "");
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    mostrarMsg("login-msg", "E-mail ou senha incorretos.", "error");
    return;
  }
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
    mostrarMsg(
      "login-msg",
      "A senha precisa ter pelo menos 6 caracteres.",
      "error"
    );
    return;
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password: senha,
    options: { data: { nome, setor } },
  });

  if (error) {
    mostrarMsg("login-msg", error.message, "error");
    return;
  }

  if (data.session) {
    entrarNoApp(data.user);
  } else {
    mostrarMsg(
      "login-msg",
      "Conta criada! Verifique seu e-mail para confirmar.",
      "success"
    );
  }
}

async function entrarNoApp(user) {
  document.getElementById("screen-login").style.display = "none";
  document.getElementById("screen-app").style.display = "block";

  const { data: prof } = await sb
    .from("profiles")
    .select("nome,setor")
    .eq("id", user.id)
    .single();

  userNome = prof?.nome || user.email;
  document.getElementById("user-nome").textContent =
    "👤 " + userNome + (prof?.setor ? " · " + prof.setor : "");

  await carregarPacientes();

  sb.channel("pacientes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pacientes" },
      () => carregarPacientes()
    )
    .subscribe();
}

async function sair() {
  await sb.auth.signOut();
  location.reload();
}

// ── DADOS ─────────────────────────────────────

async function carregarPacientes() {
  const { data, error } = await sb
    .from("pacientes")
    .select("*")
    .order("nome");

  if (error) {
    console.error(error);
    return;
  }

  PACIENTES = data || [];
  renderSummary();
  renderTabela();
  document.getElementById("loading").style.display = "none";
  document.getElementById("tabela").style.display = "";
}

// ── HELPERS ───────────────────────────────────

function statusGeral(p) {
  const statuses = [p.receita_status, p.ctrl_status].filter(Boolean);
  if (statuses.includes("VENCIDA")) return "VENCIDA";
  if (statuses.includes("EM BREVE")) return "EM BREVE";
  if (statuses.includes("A VENCER")) return "A VENCER";
  return "";
}

function condClass(c) {
  if (!c) return "";
  if (c.includes("/")) return "cond-HD";
  if (c.includes("HIPERT")) return "cond-H";
  if (c.includes("DIAB")) return "cond-D";
  if (c.includes("SA")) return "cond-S";
  return "";
}

function condLabel(c) {
  if (!c) return "—";
  return c
    .replace("HIPERTENSA (O)/DIABÉTICA (O)", "Hipert. + Diab.")
    .replace("HIPERTENSA (O)", "Hipertensa(o)")
    .replace("DIABÉTICA (O)", "Diabética(o)")
    .replace("SAÚDE MENTAL", "Saúde Mental");
}

function badgeStatus(s) {
  if (!s) return '<span class="badge badge-none">—</span>';
  const cls =
    s === "VENCIDA"
      ? "badge-vencida"
      : s === "EM BREVE"
      ? "badge-breve"
      : "badge-ok";
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
  document.getElementById("form-login").style.display =
    modo === "login" ? "" : "none";
  document.getElementById("form-cadastro").style.display =
    modo === "cadastro" ? "" : "none";
  mostrarMsg("login-msg", "", "");
}

// ── RENDER ────────────────────────────────────

function renderSummary() {
  const total = PACIENTES.length;
  const venc = PACIENTES.filter((p) => statusGeral(p) === "VENCIDA").length;
  const brev = PACIENTES.filter((p) => statusGeral(p) === "EM BREVE").length;
  const ok = PACIENTES.filter((p) => statusGeral(p) === "A VENCER").length;

  document.getElementById("cnt-total").textContent = total;
  document.getElementById("cnt-vencida").textContent = venc;
  document.getElementById("cnt-breve").textContent = brev;
  document.getElementById("cnt-ok").textContent = ok;

  renderAlertas();
}

function criarAlertaItem(p) {
  const recVenc = p.receita_status === "VENCIDA";
  const recBreve = p.receita_status === "EM BREVE";
  const ctlVenc = p.ctrl_status === "VENCIDA";
  const ctlBreve = p.ctrl_status === "EM BREVE";
  const vencida = recVenc || ctlVenc;

  const tipo = [];
  if (recVenc || recBreve) {
    tipo.push("Receita" + (recVenc ? " vencida" : " vence em breve"));
  }
  if (ctlVenc || ctlBreve) {
    tipo.push("Controlada" + (ctlVenc ? " vencida" : " vence em breve"));
  }

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
  btn.addEventListener("click", function () {
    editarPaciente(p.id);
  });

  texto.appendChild(nome);
  texto.appendChild(detalhe);
  div.appendChild(icone);
  div.appendChild(texto);
  div.appendChild(btn);

  return div;
}

function renderAlertas() {
  const urgentes = PACIENTES.filter(
    (p) =>
      p.receita_status === "VENCIDA" ||
      p.ctrl_status === "VENCIDA" ||
      p.receita_status === "EM BREVE" ||
      p.ctrl_status === "EM BREVE"
  ).sort(function (a, b) {
    const peso = function (s) {
      return s === "VENCIDA" ? 0 : s === "EM BREVE" ? 1 : 2;
    };
    return (
      Math.min(peso(a.receita_status), peso(a.ctrl_status)) -
      Math.min(peso(b.receita_status), peso(b.ctrl_status))
    );
  });

  const wrap = document.getElementById("alertas-wrap");
  const list = document.getElementById("alertas-list");

  if (urgentes.length === 0) {
    wrap.classList.remove("visible");
    return;
  }

  wrap.classList.add("visible");
  list.innerHTML = "";
  urgentes.forEach(function (p) {
    list.appendChild(criarAlertaItem(p));
  });
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
  tdRecStatus.innerHTML = badgeStatus(p.receita_status);

  const tdRecProx = document.createElement("td");
  tdRecProx.className = "sub-cell";
  tdRecProx.textContent = fmtData(p.receita_prox);

  const tdCtlStatus = document.createElement("td");
  tdCtlStatus.innerHTML = badgeStatus(p.ctrl_status);

  const tdCtlProx = document.createElement("td");
  tdCtlProx.className = "sub-cell";
  tdCtlProx.textContent = fmtData(p.ctrl_prox);

  const tdAcoes = document.createElement("td");

  const btnEditar = document.createElement("button");
  btnEditar.className = "action-btn";
  btnEditar.textContent = "Editar";
  btnEditar.addEventListener("click", function () {
    editarPaciente(p.id);
  });

  const btnExcluir = document.createElement("button");
  btnExcluir.className = "action-btn del";
  btnExcluir.textContent = "Excluir";
  btnExcluir.addEventListener("click", function () {
    excluirPaciente(p.id);
  });

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

  const lista = PACIENTES.filter(function (p) {
    const matchBusca =
      !busca ||
      (p.nome || "").toLowerCase().includes(busca) ||
      (p.sus || "").includes(busca) ||
      (p.condicao || "").toLowerCase().includes(busca);
    const matchFiltro =
      filtroAtivo === "todos" || statusGeral(p) === filtroAtivo;
    return matchBusca && matchFiltro;
  });

  const tbody = document.getElementById("tbody");
  const empty = document.getElementById("empty");

  tbody.innerHTML = "";

  if (lista.length === 0) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  lista.forEach(function (p) {
    tbody.appendChild(criarLinhaTabela(p));
  });
}

function setFiltro(btn) {
  document.querySelectorAll(".filter-btn").forEach(function (b) {
    b.classList.remove("active");
  });
  btn.classList.add("active");
  filtroAtivo = btn.dataset.f;
  renderTabela();
}

// ── EXPORTAR EXCEL ────────────────────────────

function exportarExcel() {
  if (PACIENTES.length === 0) {
    alert("Nenhum paciente para exportar.");
    return;
  }

  const dados = PACIENTES.map(function (p) {
    return {
      Nome: p.nome || "",
      "Nº SUS": p.sus || "",
      "Data Nasc.": fmtData(p.data_nasc),
      Endereço: p.endereco || "",
      Condição: p.condicao || "",
      "Receita — Data": fmtData(p.receita_data),
      "Receita — Próx.": fmtData(p.receita_prox),
      "Receita — Status": p.receita_status || "",
      "Controlada — Data": fmtData(p.ctrl_data),
      "Controlada — Próx.": fmtData(p.ctrl_prox),
      "Controlada — Status": p.ctrl_status || "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(dados);
  ws["!cols"] = [20, 18, 12, 30, 28, 16, 16, 14, 16, 16, 16].map(function (w) {
    return { wch: w };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pacientes");

  const hoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  XLSX.writeFile(wb, "UBS06_Pacientes_" + hoje + ".xlsx");
}

// ── MODAL ─────────────────────────────────────

function abrirModal(id) {
  limparModal();
  document.getElementById("modal-titulo").textContent = id
    ? "Editar Paciente"
    : "Novo Paciente";
  document.getElementById("overlay").classList.add("open");
}

function fecharModal() {
  document.getElementById("overlay").classList.remove("open");
}

function limparModal() {
  [
    "pac-id",
    "pac-nome",
    "pac-sus",
    "pac-nasc",
    "pac-end",
    "pac-rec-data",
    "pac-rec-prox",
    "pac-ctrl-data",
    "pac-ctrl-prox",
  ].forEach(function (id) {
    document.getElementById(id).value = "";
  });

  ["pac-cond", "pac-rec-status", "pac-ctrl-status"].forEach(function (id) {
    document.getElementById(id).value = "";
  });

  mostrarMsg("modal-msg", "", "");
}

function editarPaciente(id) {
  const p = PACIENTES.find(function (x) {
    return x.id === id;
  });
  if (!p) return;

  abrirModal(id);
  document.getElementById("pac-id").value = p.id;
  document.getElementById("pac-nome").value = p.nome || "";
  document.getElementById("pac-sus").value = p.sus || "";
  document.getElementById("pac-nasc").value = p.data_nasc || "";
  document.getElementById("pac-end").value = p.endereco || "";
  document.getElementById("pac-cond").value = p.condicao || "";
  document.getElementById("pac-rec-data").value = p.receita_data || "";
  document.getElementById("pac-rec-prox").value = p.receita_prox || "";
  document.getElementById("pac-rec-status").value = p.receita_status || "";
  document.getElementById("pac-ctrl-data").value = p.ctrl_data || "";
  document.getElementById("pac-ctrl-prox").value = p.ctrl_prox || "";
  document.getElementById("pac-ctrl-status").value = p.ctrl_status || "";
}

async function salvarPaciente() {
  const nome = document.getElementById("pac-nome").value.trim();
  const cond = document.getElementById("pac-cond").value;

  if (!nome) {
    mostrarMsg("modal-msg", "O nome é obrigatório.", "error");
    return;
  }

  const btn = document.getElementById("btn-salvar");
  btn.disabled = true;
  btn.textContent = "Salvando…";

  const payload = {
    nome: nome,
    sus: document.getElementById("pac-sus").value.trim() || null,
    data_nasc: document.getElementById("pac-nasc").value || null,
    endereco: document.getElementById("pac-end").value.trim() || null,
    condicao: cond || null,
    receita_data: document.getElementById("pac-rec-data").value || null,
    receita_prox: document.getElementById("pac-rec-prox").value || null,
    receita_status: document.getElementById("pac-rec-status").value || null,
    ctrl_data: document.getElementById("pac-ctrl-data").value || null,
    ctrl_prox: document.getElementById("pac-ctrl-prox").value || null,
    ctrl_status: document.getElementById("pac-ctrl-status").value || null,
  };

  const pacId = document.getElementById("pac-id").value;
  let error;

  if (pacId) {
    ({ error } = await sb.from("pacientes").update(payload).eq("id", pacId));
  } else {
    const {
      data: { user },
    } = await sb.auth.getUser();
    payload.acs_id = user.id;
    ({ error } = await sb.from("pacientes").insert(payload));
  }

  btn.disabled = false;
  btn.textContent = "Salvar";

  if (error) {
    mostrarMsg("modal-msg", "Erro ao salvar: " + error.message, "error");
    return;
  }

  fecharModal();
  await carregarPacientes();
}

async function excluirPaciente(id) {
  if (!confirm("Excluir este paciente? Esta ação não pode ser desfeita."))
    return;
  await sb.from("pacientes").delete().eq("id", id);
  await carregarPacientes();
}

// ── EVENTOS ───────────────────────────────────

document.getElementById("overlay").addEventListener("click", function (e) {
  if (e.target === this) fecharModal();
});

// ── INIT ──────────────────────────────────────
init();
