// ✅ server.js - versão ajustada
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" })); // permite JSON grande (importes grandes)

// 🔹 Conexão MongoDB
const client = new MongoClient(process.env.MONGO_URI);
let db;

function normalizarCampos(obj) {
  const mapa = {
    "e-mail": "email",
    "função": "funcao",
    "responsável": "responsavel",
    "código": "codigo",
    "nível": "nivel",
    "Em": "atualizadoEm",
    "_eu ia": "_id"
  };

  const novo = {};
  for (const chave in obj) {
    // remove espaços e acentos de chaves inesperadas
    const chaveLimpa = chave.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
    const final = mapa[chave] || chaveLimpa.trim();
    novo[final] = obj[chave];
  }

  return novo;
}


// 🔹 Função genérica para criar rotas CRUD
async function criarRota(nomeCollection) {
  const collection = db.collection(nomeCollection);

  // GET - listar todos
  app.get(`/${nomeCollection}`, async (req, res) => {
    try {
      const dados = await collection.find().toArray();
      res.json(dados);
    } catch (err) {
      console.error(`❌ Erro ao buscar ${nomeCollection}:`, err);
      res.status(500).json({ erro: "Erro ao buscar dados" });
    }
  });

// POST - inserir (1 ou vários)
app.post(`/${nomeCollection}`, async (req, res) => {
  try {
    let dados = req.body;

    if (!dados || (Array.isArray(dados) && dados.length === 0)) {
      return res.status(400).json({ erro: "Nenhum dado recebido." });
    }

    if (Array.isArray(dados)) {
      // 🔹 Inserção em massa
      const dadosLimpos = dados.map(normalizarCampos);
      const result = await collection.insertMany(dadosLimpos);
      res.status(201).json({
        sucesso: true,
        mensagem: `✅ ${result.insertedCount} registros inseridos em ${nomeCollection}`,
        ids: Object.values(result.insertedIds)
      });
    } else {
      // 🔹 Inserção única
      const dadoLimpo = normalizarCampos(dados);
      const result = await collection.insertOne(dadoLimpo);
      res.status(201).json({
        sucesso: true,
        mensagem: `✅ 1 registro inserido em ${nomeCollection}`,
        id: result.insertedId
      });
    }
  } catch (erro) {
    console.error(`❌ Erro ao inserir em ${nomeCollection}:`, erro);
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});


  // PUT - atualizar por ID
  app.put(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const result = await collection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ erro: "Erro ao atualizar documento" });
    }
  });

  // DELETE - excluir por ID
  app.delete(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const result = await collection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ erro: "Erro ao excluir documento" });
    }
  });
}

// 🔹 Inicializa servidor
async function iniciarServidor() {
  try {
    console.log("🔌 Conectando ao MongoDB Atlas...");
    await client.connect();
    db = client.db("tinbr");
    console.log("✅ Conectado ao MongoDB Atlas!");

    // Cria as rotas
    [
      "clientes",
      "mercado",
      "operacoes",
      "proprietarios",
      "referencia",
      "tks",
      "users",
      "players",
    ].forEach((nome) => criarRota(nome));

    app.get("/", (req, res) => {
      res.send("🚀 API MongoDB funcionando perfeitamente!");
    });

// 🔹 Rota para verificar a versão do servidor
app.get("/version", (req, res) => {
  res.json({
    versao: "1.0.4-removendo-subrepo",
    atualizadoEm: new Date().toISOString(),
  });
});


    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Erro ao conectar no MongoDB:", err);
    process.exit(1);
  }
}

iniciarServidor();
