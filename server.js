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

// ======================= USERS =======================

// GET - Listar todos os usuários
app.get("/users", async (req, res) => {
  try {
    const users = await db.collection("users").find().toArray();
    res.json(users);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({ erro: "Erro ao buscar usuários" });
  }
});

// GET - Buscar um usuário por ID
app.get("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ erro: "Usuário não encontrado" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar usuário" });
  }
});

// POST - Criar novo usuário
app.post("/users", async (req, res) => {
  try {
    const dados = req.body;
    dados.criadoEm = new Date();
    const resultado = await db.collection("users").insertOne(dados);
    res.json({ sucesso: true, _id: resultado.insertedId });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar usuário" });
  }
});

// PUT - Atualizar usuário
app.put("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    dados.atualizadoEm = new Date();
    const resultado = await db.collection("users").updateOne(
      { _id: new ObjectId(id) },
      { $set: dados }
    );
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar usuário" });
  }
});

// DELETE - Remover usuário
app.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const resultado = await db.collection("users").deleteOne({ _id: new ObjectId(id) });
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover usuário" });
  }
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("Servidor rodando na porta", PORT));

