// server.js
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão MongoDB
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function conectarMongo() {
  try {
    await client.connect();
    db = client.db("tinbr"); // 👈 nome do seu banco
    console.log("✅ Conectado ao MongoDB Atlas");
  } catch (err) {
    console.error("❌ Erro ao conectar no MongoDB:", err);
  }
}
async function iniciarServidor() {
  try {
    await client.connect();
    db = client.db("tinbr");
    console.log("✅ Conectado ao MongoDB Atlas");

    // 🔹 Criação automática das rotas para suas collections
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

    // 🔹 Inicia o servidor só depois da conexão
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
  } catch (err) {
    console.error("❌ Erro ao conectar no MongoDB:", err);
  }
}

iniciarServidor();


// Rota raiz
app.get("/", (req, res) => {
  res.send("API MongoDB funcionando! 🚀");
});

// 🔹 Função para criar rotas genéricas
function criarRota(nomeCollection) {
  const collection = db.collection(nomeCollection);

  // GET - listar todos
  app.get(`/${nomeCollection}`, async (req, res) => {
    try {
      const dados = await collection.find().toArray();
      res.json(dados);
    } catch (err) {
      res.status(500).json({ erro: "Erro ao buscar dados" });
    }
  });

  // POST - inserir novo
  app.post(`/${nomeCollection}`, async (req, res) => {
    try {
      const result = await collection.insertOne(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ erro: "Erro ao inserir documento" });
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

// 🔹 Criação automática das rotas para suas collections
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

// Porta automática do Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
