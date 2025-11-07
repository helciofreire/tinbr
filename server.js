import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const client = new MongoClient(process.env.MONGO_URI);
let db;

// ✅ Remove acentos, renomeia campos e remove espaços do cliente_id
function normalizar(obj) {
  const map = {
    "e-mail": "email",
    "função": "funcao",
    "responsável": "responsavel",
    "código": "codigo",
    "nível": "nivel"
  };

  const novo = {};
  for (const chave in obj) {
    const chaveSemAcento = chave.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const chaveFinal = map[chave] || chaveSemAcento.trim();
    let valor = obj[chave];
    if (typeof valor === "string") valor = valor.trim();
    if (chaveFinal === "cliente_id") valor = String(valor).trim();
    novo[chaveFinal] = valor;
  }

  return novo;
}

// ✅ Cria rotas genéricas para cada collection
async function criarRota(nomeCollection) {
  const collection = db.collection(nomeCollection);

  // LISTAR
  app.get(`/${nomeCollection}`, async (req, res) => {
    try {
      const { cliente_id, nivel_gt, limit, sort } = req.query;
      const query = {};
      if (cliente_id) query.cliente_id = String(cliente_id).trim();
      if (nivel_gt) query.nivel = { $gt: Number(nivel_gt) };

      let cursor = collection.find(query);

      if (sort) {
        const partes = sort.split(",");
        const ordenacao = {};
        for (let i = 0; i < partes.length; i += 2) {
          ordenacao[partes[i]] = partes[i + 1] === "asc" ? 1 : -1;
        }
        cursor = cursor.sort(ordenacao);
      }

      const max = limit ? Number(limit) : 1000;
      const dados = await cursor.limit(max).toArray();
      res.json(dados);
    } catch (erro) {
      console.error("❌ Erro ao listar registros:", erro);
      res.status(500).json({ erro: "Falha ao buscar dados." });
    }
  });

  // BUSCAR POR ID
  app.get(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const id = String(req.params.id).trim();
      const registro = await collection.findOne({ _id: new ObjectId(id) });
      if (!registro) return res.status(404).json({ erro: "Não encontrado" });
      res.json(registro);
    } catch (erro) {
      console.error("❌ Erro ao buscar por ID:", erro);
      res.status(500).json({ erro: "Erro ao buscar registro." });
    }
  });

  // INSERIR
  app.post(`/${nomeCollection}`, async (req, res) => {
    try {
      const doc = normalizar(req.body);
      const result = await collection.insertOne(doc);
      res.status(201).json({ sucesso: true, id: result.insertedId });
    } catch (erro) {
      console.error("❌ Erro ao inserir registro:", erro);
      res.status(500).json({ erro: erro.message });
    }
  });

  // ATUALIZAR
  app.put(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const id = String(req.params.id).trim();
      const dados = normalizar(req.body);
      const result = await collection.updateOne({ _id: new ObjectId(id) }, { $set: dados });
      res.json({ sucesso: result.modifiedCount === 1 });
    } catch (erro) {
      console.error("❌ Erro ao atualizar registro:", erro);
      res.status(500).json({ erro: erro.message });
    }
  });

  // EXCLUIR
  app.delete(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const id = String(req.params.id).trim();
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      res.json({ sucesso: result.deletedCount === 1 });
    } catch (erro) {
      console.error("❌ Erro ao excluir registro:", erro);
      res.status(500).json({ erro: erro.message });
    }
  });
}

// ✅ LOGIN DE USUÁRIO COM SENHA CRIPTOGRAFADA
app.post("/users/login", async (req, res) => {
  try {
    const { login, senha, tipo } = req.body;
    if (!login || !senha) return res.json({ ok: false, mensagem: "Login e senha são obrigatórios." });

    const campo = tipo === "email" ? "email" : "documento";
    const user = await db.collection("users").findOne({ [campo]: String(login).trim() });
    if (!user) return res.json({ ok: false, mensagem: "Usuário ou senha incorretos." });

    const senhaCorreta = await bcrypt.compare(String(senha).trim(), user.senha);
    if (!senhaCorreta) return res.json({ ok: false, mensagem: "Usuário ou senha incorretos." });

    return res.json({
      ok: true,
      nome: user.nome ?? "",
      nivel: user.nivel ?? "",
      cliente_id: user.cliente_id ?? "",
      mensagem: "Login realizado com sucesso."
    });

  } catch (erro) {
    console.error("❌ Erro no login:", erro);
    res.json({ ok: false, mensagem: "Erro no servidor." });
  }
});

// ✅ HEALTH CHECK
app.get("/health", (req, res) => {
  const conectado = client && client.topology && client.topology.isConnected();
  res.status(200).json({
    status: "UP",
    mongo: conectado ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => res.send("🚀 API MongoDB OK!"));

async function iniciarServidor() {
  try {
    console.log("🔌 Conectando ao MongoDB...");
    await client.connect();
    db = client.db("tinbr");
    console.log("✅ Conectado ao MongoDB!");

    const colecoes = ["clientes", "mercado", "operacoes", "proprietarios", "referencia", "tks", "users", "players"];
    for (const nome of colecoes) await criarRota(nome);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));

  } catch (erro) {
    console.error("❌ Falha ao iniciar servidor:", erro);
    process.exit(1);
  }
}

iniciarServidor();
