/// ✅ server.js - versão corrigida
import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

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
    const chaveLimpa = chave.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const final = mapa[chave] || chaveLimpa.trim();
    novo[final] = obj[chave];
  }
  return novo;
}

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

  // POST - inserir
  app.post(`/${nomeCollection}`, async (req, res) => {
    try {
      let dados = req.body;
      if (!dados || (Array.isArray(dados) && dados.length === 0)) {
        return res.status(400).json({ erro: "Nenhum dado recebido." });
      }

      if (Array.isArray(dados)) {
        const dadosLimpos = dados.map(normalizarCampos);
        const result = await collection.insertMany(dadosLimpos);
        res.status(201).json({
          sucesso: true,
          mensagem: `✅ ${result.insertedCount} registros inseridos em ${nomeCollection}`,
          ids: Object.values(result.insertedIds)
        });
      } else {
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
      { _id: req.params.id }, // _id string
      { $set: req.body }
    );
    res.json(result);
  } catch (err) {
    console.error("Erro ao atualizar registro:", err);
    res.status(500).json({ erro: "Erro ao atualizar registro" });
  }
});


  // DELETE - excluir por ID
app.delete(`/${nomeCollection}/:id`, async (req, res) => {
  try {
    const id = String(req.params.id).trim(); // garante que seja string
    const result = await collection.deleteOne({ _id: id });

    if (result.deletedCount === 1) {
      res.json({ sucesso: true, mensagem: "Usuário excluído com sucesso" });
    } else {
      res.status(404).json({ erro: "Registro não encontrado" });
    }
  } catch (err) {
    console.error("Erro ao excluir registro:", err);
    res.status(500).json({ erro: "Erro ao excluir registro" });
  }
});


}

async function iniciarServidor() {
  try {
    console.log("🔌 Conectando ao MongoDB Atlas...");
    await client.connect();
    db = client.db("tinbr");
    console.log("✅ Conectado ao MongoDB Atlas!");

    const colecoes = [
      "clientes",
      "mercado",
      "operacoes",
      "proprietarios",
      "referencia",
      "tks",
      "users",
      "players"
    ];

    // Cria rotas sequencialmente
    for (const nome of colecoes) {
      await criarRota(nome);
    }

    app.get("/", (req, res) => res.send("🚀 API MongoDB funcionando perfeitamente!"));

    app.get("/version", (req, res) =>
      res.json({ versao: "1.0.5-normalizacao", atualizadoEm: new Date().toISOString() })
    );

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
  } catch (err) {
    console.error("❌ Erro ao conectar no MongoDB:", err);
    process.exit(1);
  }
}

iniciarServidor();
