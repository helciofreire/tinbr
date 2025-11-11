import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";

// -----------------------------------------------------
// Função para validar senha forte
// -----------------------------------------------------
function senhaValida(senha) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(senha);
}

// -----------------------------------------------------
// Normalização de dados
// -----------------------------------------------------
function normalizar(dados) {
  const obj = { ...dados };

  if (obj.nome) obj.nome = obj.nome.trim();
  if (obj.email) obj.email = obj.email.trim().toLowerCase();
  if (obj.documento) obj.documento = obj.documento.replace(/[^\d]/g, "");
  if (obj.login) obj.login = obj.login.trim().toLowerCase();

  return obj;
}

// -----------------------------------------------------
// Configuração Express
// -----------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------------------------------
// Conexão MongoDB
// -----------------------------------------------------
const client = new MongoClient(process.env.MONGO_URL);
let db;

async function conectarBanco() {
  try {
    await client.connect();
    db = client.db(process.env.MONGO_DB);
    console.log("✅ MongoDB conectado:", process.env.MONGO_DB);

    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ documento: 1 }, { unique: true });

    await db.collection("clientes").createIndex({ cliente_id: 1 }, { unique: true });
    await db.collection("clientes").createIndex({ documento: 1 }, { unique: true });

    console.log("✅ Índices garantidos (users + clientes)");

  } catch (erro) {
    console.error("❌ Erro ao conectar banco:", erro);
  }
}
conectarBanco();


// -----------------------------------------------------
// USERS
// -----------------------------------------------------

// Criar usuário
app.post("/users", async (req, res) => {
  try {
    const dados = normalizar(req.body);

    if (!dados.nome || !dados.email || !dados.senha || !dados.cliente_id) {
      return res.status(400).json({ ok: false, mensagem: "Campos obrigatórios faltando." });
    }

    if (!senhaValida(dados.senha)) {
      return res.status(400).json({ ok: false, mensagem: "Senha fraca." });
    }

    dados.senha = await bcrypt.hash(dados.senha, 10);
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();

    const result = await db.collection("users").insertOne(dados);
    return res.status(201).json({ ok: true, id: result.insertedId });

  } catch (erro) {
    if (erro.code === 11000) return res.status(400).json({ ok: false, mensagem: "Email ou documento já cadastrado." });
    return res.status(500).json({ ok: false, mensagem: "Erro ao criar usuário." });
  }
});

// Login usuário
app.post("/users/login", async (req, res) => {
  try {
    let { login, senha } = req.body;

    if (!login || !senha) return res.status(400).json({ ok: false, mensagem: "Login e senha obrigatórios." });

    login = login.trim();
    const filtro = login.includes("@") ? { email: login.toLowerCase() } : { documento: login.replace(/[^\d]/g, "") };

    const usuario = await db.collection("users").findOne(filtro);
    if (!usuario) return res.status(400).json({ ok: false, mensagem: "Usuário não encontrado." });

    const senhaOk = await bcrypt.compare(senha, usuario.senha);
    if (!senhaOk) return res.status(401).json({ ok: false, mensagem: "Senha incorreta." });

    return res.json({ ok: true, nome: usuario.nome, nivel: usuario.nivel, cliente_id: usuario.cliente_id });

  } catch (erro) {
    return res.status(500).json({ ok: false, mensagem: "Erro no login." });
  }
});

// Listar usuários (opcionalmente por cliente_id)
app.get("/users", async (req, res) => {
  const filtro = req.query.cliente_id ? { cliente_id: req.query.cliente_id } : {};
  const lista = await db.collection("users").find(filtro).toArray();
  res.json(lista);
});

// Buscar usuário por ID
app.get("/users/:id", async (req, res) => {
  const usuario = await db.collection("users").findOne({ _id: req.params.id });
  if (!usuario) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado." });
  res.json(usuario);
});

// Atualizar usuário
app.put("/users/:id", async (req, res) => {
  try {
    const dados = { ...req.body, atualizadoEm: new Date() };
    if (dados.senha) dados.senha = await bcrypt.hash(dados.senha, 10);

    const result = await db.collection("users").updateOne({ _id: req.params.id }, { $set: dados });
    if (result.matchedCount === 0) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado." });

    return res.json({ ok: true, mensagem: "Usuário atualizado." });

  } catch (erro) {
    return res.status(500).json({ ok: false, mensagem: "Erro ao atualizar usuário." });
  }
});

// Deletar usuário
app.delete("/users/:id", async (req, res) => {
  const result = await db.collection("users").deleteOne({ _id: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ ok: false, mensagem: "Usuário não encontrado." });
  res.json({ ok: true, mensagem: "Usuário removido." });
});


// -----------------------------------------------------
// CLIENTES
// -----------------------------------------------------

// Criar cliente
app.post("/clientes", async (req, res) => {
  try {
    const dados = normalizar(req.body);

    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();

    const result = await db.collection("clientes").insertOne(dados);
    res.status(201).json({ ok: true, id: result.insertedId });

  } catch (erro) {
    return res.status(500).json({ ok: false, mensagem: "Erro ao criar cliente." });
  }
});

// Listar clientes
app.get("/clientes", async (req, res) => {
  const lista = await db.collection("clientes").find({}).toArray();
  res.json(lista);
});

// Buscar cliente
app.get("/clientes/:cliente_id", async (req, res) => {
  const cliente = await db.collection("clientes").findOne({ cliente_id: req.params.cliente_id });
  if (!cliente) return res.status(404).json({ ok: false, mensagem: "Cliente não encontrado." });
  res.json(cliente);
});

// Atualizar cliente
app.put("/clientes/:cliente_id", async (req, res) => {
  const result = await db.collection("clientes").updateOne(
    { cliente_id: req.params.cliente_id },
    { $set: { ...req.body, atualizadoEm: new Date() } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ ok: false, mensagem: "Cliente não encontrado." });
  res.json({ ok: true, mensagem: "Cliente atualizado." });
});

// Deletar cliente
app.delete("/clientes/:cliente_id", async (req, res) => {
  const result = await db.collection("clientes").deleteOne({ cliente_id: req.params.cliente_id });
  if (result.deletedCount === 0) return res.status(404).json({ ok: false, mensagem: "Cliente não encontrado." });
  res.json({ ok: true, mensagem: "Cliente removido." });
});


// -----------------------------------------------------
// HEALTH
// -----------------------------------------------------
app.get("/health", (req, res) => res.json({ ok: true, status: "online" }));

// ------------
