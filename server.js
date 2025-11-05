// ✅ server.js corrigido e simplificado
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
  };

  const novo = {};
  for (const chave in obj) {
    const chaveLimpa = chave.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const final = mapa[chave] || chaveLimpa.trim();

    let valor = obj[chave];

    // Remove espaços extras
    if (typeof valor === "string") valor = valor.trim();

    // Garante cliente_id sem espaços
    if (final === "cliente_id") valor = String(valor).trim();

    novo[final] = valor;
  }
  return novo;
}

async function criarRota(nomeCollection) {
  const collection = db.collection(nomeCollection);

  // 🔹 POST - inserir
  app.post(`/${nomeCollection}`, async (req, res) => {
    try {
      let dados = req.body;
      if (!dados) return res.status(400).json({ erro: "Nenhum dado recebido." });

      if (Array.isArray(dados)) {
        const dadosLimpos = dados.map(normalizarCampos);
        const result = await collection.insertMany(dadosLimpos);
        return res.status(201).json({ sucesso: true, inseridos: result.insertedCount });
      }

      const dadoLimpo = normalizarCampos(dados);
      const result = await collection.insertOne(dadoLimpo);
      res.status(201).json({ sucesso: true, id: result.insertedId });

    } catch (erro) {
      console.error(`❌ Erro ao inserir em ${nomeCollection}:`, erro);
      res.status(500).json({ erro: erro.message });
    }
  });

  // 🔹 PUT - atualizar
  app.put(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const result = await collection.updateOne(
        { _id: req.params.id },
        { $set: req.body }
      );
      res.json(result);
    } catch (erro) {
      console.error("Erro ao atualizar:", erro);
      res.status(500).json({ erro: "Erro ao atualizar registro" });
    }
  });

  // 🔹 DELETE - excluir
  app.delete(`/${nomeCollection}/:id`, async (req, res) => {
    try {
      const result = await collection.deleteOne({ _id: req.params.id });
      if (result.deletedCount === 1) res.json({ sucesso: true });
      else res.status(404).json({ erro: "Registro não encontrado" });
    } catch (erro) {
      console.error("Erro ao excluir:", erro);
      res.status(500).json({ erro: "Erro ao excluir registro" });
    }
  });
}

async function iniciarServidor() {
  try {
    console.log("🔌 Conectando ao MongoDB...");
    await client.connect();
    db = client.db("tinbr");
    console.log("✅ Conectado!");

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

    for (const nome of colecoes) await criarRota(nome);

    // ✅ GET /users correto (sempre lê da coleção users)
    app.get("/users", async (req, res) => {
      try {
        const { cliente_id, nivel_gt, limit, sort } = req.query;
        const users = db.collection("users");

        const filtro = {};
        if (cliente_id) filtro.cliente_id = String(cliente_id).trim();
        if (nivel_gt) filtro.nivel = { $gt: Number(nivel_gt) };

        let cursor = users.find(filtro);

        if (sort) {
          const ordenacao = {};
          const campos = sort.split(',');
          for (let i = 0; i < campos.length; i += 2) {
            ordenacao[campos[i]] = campos[i + 1] === "asc" ? 1 : -1;
          }
          cursor = cursor.sort(ordenacao);
        }

        const resultado = await cursor.limit(Number(limit) || 1000).toArray();
        res.json(resultado);

      } catch (erro) {
        console.error("Erro GET /users:", erro);
        res.status(500).json({ erro: "Erro ao buscar usuários." });
      }
    });

    app.get("/", (_, res) => res.send("🚀 API OK!"));

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));

  } catch (erro) {
    console.error("❌ Erro ao iniciar:", erro);
    process.exit(1);
  }
}

iniciarServidor();
