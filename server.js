import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { MongoClient, ObjectId } from "mongodb";

// ----------------------------------------
// Configuração Express
// ----------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

// ----------------------------------------
// Conexão MongoDB
// ----------------------------------------
const client = new MongoClient(process.env.MONGO_URL);
let db;

async function conectarBanco() {
  try {
    await client.connect();
    db = client.db(process.env.MONGO_DB);
    console.log("✅ MongoDB conectado:", process.env.MONGO_DB);

    // Índices mínimos
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ documento: 1 }, { unique: true });

    await db.collection("clientes").createIndex({ cliente_id: 1 }, { unique: true });

    console.log("✅ Índices garantidos (users + clientes)");

  } catch (erro) {
    console.error("❌ Erro ao conectar banco:", erro);
  }
}
conectarBanco();

// ----------------------------------------
// Funções auxiliares
// ----------------------------------------
function senhaValida(senha) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(senha);
}

function normalizar(dados) {
  const obj = { ...dados };
  if (obj.email) obj.email = obj.email.trim().toLowerCase();
  if (obj.documento) obj.documento = obj.documento.replace(/[^\d]/g, "");
  return obj;
}

// ========================================
// USERS
// ========================================

// Criar
app.post("/users", async (req, res) => {
  try {
    const dados = normalizar(req.body);

    if (!dados.email || !dados.senha || !dados.nome || !dados.cliente_id) {
      return res.status(400).json({ ok: false, mensagem: "Campos obrigatórios faltando." });
    }

    if (!senhaValida(dados.senha)) {
      return res.status(400).json({ ok: false, mensagem: "Senha fraca." });
    }

    dados.senha = await bcrypt.hash(dados.senha, 10);
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();

    await db.collection("users").insertOne(dados);
    res.json({ ok: true, mensagem: "Usuário criado." });

  } catch (erro) {
    console.error("Erro:", erro);
    res.status(500).json({ ok: false, mensagem: "Falha ao criar." });
  }
});

// Login
app.post("/users/login", async (req, res) => {
  try {
    let { login, senha } = req.body;

    const filtro = login.includes("@")
      ? { email: login.toLowerCase() }
      : { documento: login.replace(/[^\d]/g, "") };

    const user = await db.collection("users").findOne(filtro);
    if (!user) return res.json({ ok: false, mensagem: "Usuário não encontrado." });

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) return res.json({ ok: false, mensagem: "Senha incorreta." });

    res.json({ ok: true, nome: user.nome, cliente_id: user.cliente_id, nivel: user.nivel });

  } catch (erro) {
    res.json({ ok: false });
  }
});

// Buscar 1
app.get("/users/:id", async (req, res) => {
  try {
    const user = await db.collection("users").findOne({ _id: req.params.id });
    if (!user) return res.status(404).json({ ok: false });
    res.json(user);
  } catch {
    res.status(500).json({ ok: false });
  }
});

// Atualizar
app.put("/users/:id", async (req, res) => {
  try {
    const dados = req.body;

    if (dados.senha) {
      if (!senhaValida(dados.senha)) return res.json({ ok: false, mensagem: "Senha fraca." });
      dados.senha = await bcrypt.hash(dados.senha, 10);
    }

    dados.atualizadoEm = new Date();

    await db.collection("users").updateOne({ _id: req.params.id }, { $set: dados });
    res.json({ ok: true, mensagem: "Atualizado." });

  } catch {
    res.status(500).json({ ok: false });
  }
});

// Deletar
app.delete("/users/:id", async (req, res) => {
  await db.collection("users").deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

// ========================================
// FUNÇÃO CRUD GENÉRICO PARA OUTRAS TABELAS
// ========================================
function criarCRUD(nomeColecao) {

  // Criar
  app.post(`/${nomeColecao}`, async (req, res) => {
    try {
      const doc = { ...req.body, criadoEm: new Date(), atualizadoEm: new Date() };
      await db.collection(nomeColecao).insertOne(doc);
      res.json({ ok: true, mensagem: `${nomeColecao} criado.` });
    } catch (erro) {
      res.status(500).json({ ok: false });
    }
  });

  // Listar
  app.get(`/${nomeColecao}`, async (req, res) => {
    const docs = await db.collection(nomeColecao).find().toArray();
    res.json(docs);
  });

  // Buscar 1
  app.get(`/${nomeColecao}/:id`, async (req, res) => {
    const doc = await db.collection(nomeColecao).findOne({ _id: req.params.id });
    if (!doc) return res.status(404).json({ ok: false });
    res.json(doc);
  });

  // Atualizar
  app.put(`/${nomeColecao}/:id`, async (req, res) => {
    const dados = { ...req.body, atualizadoEm: new Date() };
    await db.collection(nomeColecao).updateOne({ _id: req.params.id }, { $set: dados });
    res.json({ ok: true });
  });

  // Deletar
  app.delete(`/${nomeColecao}/:id`, async (req, res) => {
    await db.collection(nomeColecao).deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  });

}

// Criar CRUD genérico
criarCRUD("clientes");
criarCRUD("players");
criarCRUD("proprietarios");
criarCRUD("referencia");
criarCRUD("tks");
criarCRUD("mercado");
criarCRUD("operacoes");

// ----------------------------------------
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor online na porta ${PORT}`));
