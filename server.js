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
app.post(`/users`, async (req, res) => {
  try {
    const dados = req.body;

    if (!dados || (Array.isArray(dados) && dados.length === 0)) {
      return res.status(400).json({ erro: "Nenhum dado recebido." });
    }

    // 🔹 Normaliza o corpo (corrige acentos, espaços e nomes errados)
    const normalizarCampos = (u) => ({
      _id: u._id,
      nome: u.nome,
      documento: u.documento,
      senha: u.senha,
      email: u.email || u["e-mail"] || "",
      funcao: u.funcao || u["função"] || "",
      fone1: u.fone1,
      fone2: u.fone2,
      redes: u.redes,
      obs: u.obs,
      responsavel: u.responsavel || u["responsável"] || "",
      codigo: u.codigo || u["código"] || "",
      nivel: u.nivel || u["nível"] || 0,
      criadoEm: u.criadoEm ? new Date(u.criadoEm) : new Date(),
      atualizadoEm: u.atualizadoEm || u.Em ? new Date(u.atualizadoEm || u.Em) : new Date(),
    });

    let limpos;

    if (Array.isArray(dados)) {
      limpos = dados.map(normalizarCampos);
      const result = await db.collection("users").insertMany(limpos);
      res.status(201).json({
        sucesso: true,
        mensagem: `✅ ${result.insertedCount} registros inseridos em users`,
        ids: Object.values(result.insertedIds),
      });
    } else {
      limpos = normalizarCampos(dados);
      const result = await db.collection("users").insertOne(limpos);
      res.status(201).json({
        sucesso: true,
        mensagem: `✅ 1 registro inserido em users`,
        id: result.insertedId,
      });
    }
  } catch (erro) {
    console.error(`❌ Erro ao inserir em users:`, erro);
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
    versao: "1.0.3-normalizacao",
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
