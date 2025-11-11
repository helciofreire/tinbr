import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";

function senhaValida(senha) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(senha);
}

function normalizar(dados) {
  const obj = { ...dados };
  if (obj.nome) obj.nome = obj.nome.trim();
  if (obj.email) obj.email = obj.email.trim().toLowerCase();
  if (obj.documento) obj.documento = obj.documento.replace(/[^\d]/g, "");
  if (obj.cpfresp) obj.cpfresp = obj.cpfresp.replace(/[^\d]/g, "");
  if (obj.responsavel?.cpf) obj.responsavel.cpf = obj.responsavel.cpf.replace(/[^\d]/g, "");
  return obj;
}

const app = express();
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URL);
let db;

async function conectarBanco() {
  await client.connect();
  db = client.db(process.env.MONGO_DB);
  console.log("✅ MongoDB conectado.");

  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ documento: 1 }, { unique: true });

  await db.collection("clientes").createIndex({ documento: 1 }, { unique: true });
  await db.collection("clientes").createIndex({ email: 1 }, { sparse: true });
}
conectarBanco();

/* -----------------------------------------------------
   USUÁRIOS
----------------------------------------------------- */

// Criar usuário
app.post("/users", async (req, res) => {
  try {
    const dados = normalizar(req.body);

    if (!dados.nome || !dados.email || !dados.senha || !dados.cliente_id) {
      return res.status(400).json({ ok: false, mensagem: "Campos obrigatórios faltando (nome, email, senha, cliente_id)." });
    }

    if (!senhaValida(dados.senha)) {
      return res.status(400).json({ ok: false, mensagem: "A senha deve ter mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo." });
    }

    const senhaHash = await bcrypt.hash(dados.senha, 10);

    const novoUsuario = { ...dados, senha: senhaHash, criadoEm: new Date(), atualizadoEm: new Date() };

    await db.collection("users").insertOne(novoUsuario);

    return res.status(201).json({ ok: true, mensagem: "✅ Usuário criado." });

  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ ok: false, mensagem: "Email ou CPF já cadastrado." });
    return res.status(500).json({ ok: false, mensagem: "Erro ao criar usuário." });
  }
});

// Login usuário
app.post("/users/login", async (req, res) => {
  try {
    let { login, senha } = req.body;
    login = login.trim();

    const filtro = login.includes("@") ? { email: login.toLowerCase() } : { documento: login.replace(/[^\d]/g, "") };
    const usuario = await db.collection("users").findOne(filtro);

    if (!usuario) return res.status(400).json({ ok: false, mensagem: "Usuário não encontrado." });

    const senhaOk = await bcrypt.compare(senha, usuario.senha);
    if (!senhaOk) return res.status(401).json({ ok: false, mensagem: "Senha incorreta." });

    return res.json({ ok: true, nome: usuario.nome, nivel: usuario.nivel, cliente_id: usuario.cliente_id });
  } catch {
    return res.status(500).json({ ok: false, mensagem: "Erro ao logar." });
  }
});

/* -----------------------------------------------------
   CLIENTES
----------------------------------------------------- */

// Criar Cliente
app.post("/clientes", async (req, res) => {
  try {
    const dados = normalizar(req.body);

    if (!dados.cliente_id || !dados.responsavel?.email || !dados.responsavel?.senha) {
      return res.status(400).json({ ok: false, mensagem: "Dados do responsável são obrigatórios." });
    }

    if (!senhaValida(dados.responsavel.senha)) {
      return res.status(400).json({ ok: false, mensagem: "Senha do responsável é fraca." });
    }

    dados.responsavel.senha = await bcrypt.hash(dados.responsavel.senha, 10);

    const novoCliente = { ...dados, criadoEm: new Date(), atualizadoEm: new Date() };

    await db.collection("clientes").insertOne(novoCliente);

    return res.status(201).json({ ok: true, mensagem: "✅ Cliente criado." });

  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ ok: false, mensagem: "Documento já cadastrado." });
    return res.status(500).json({ ok: false, mensagem: "Erro ao criar cliente." });
  }
});

// Login Responsável
app.post("/clientes/login", async (req, res) => {
  try {
    let { login, senha } = req.body;
    login = login.trim();

    const filtro = login.includes("@")
      ? { "responsavel.email": login.toLowerCase() }
      : { "responsavel.cpf": login.replace(/[^\d]/g, "") };

    const cliente = await db.collection("clientes").findOne(filtro);

    if (!cliente) return res.status(400).json({ ok: false, mensagem: "Responsável não encontrado." });

    const senhaOk = await bcrypt.compare(senha, cliente.responsavel.senha);
    if (!senhaOk) return res.status(401).json({ ok: false, mensagem: "Senha incorreta." });

    return res.json({ ok: true, cliente_id: cliente._id, nome: cliente.responsavel.nome, nivel: 1 });
  } catch {
    return res.status(500).json({ ok: false, mensagem: "Erro ao logar responsável." });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Online na porta ${PORT}`));
