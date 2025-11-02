// ==========================
// 🧩 Importa dependências
// ==========================
import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

// ==========================
// ⚙️ Configurações iniciais
// ==========================
dotenv.config();
const app = express();
app.use(express.json());

// ==========================
// 🔌 Conexão com MongoDB Atlas
// ==========================
const client = new MongoClient(process.env.MONGO_URI);
let db;

async function conectarBanco() {
  try {
    await client.connect();
    db = client.db("meuBanco"); // Nome do banco
    console.log("✅ Conectado ao MongoDB Atlas!");
  } catch (erro) {
    console.error("❌ Erro ao conectar ao MongoDB:", erro);
  }
}

conectarBanco();

// ==========================
// 🌐 Rotas da API
// ==========================

// Rota inicial
app.get("/", (req, res) => {
  res.send("API MongoDB funcionando! 🚀");
});

// Rota de teste
app.get("/teste", (req, res) => {
  res.send("✅ API rodando corretamente! 🚀");
});

// Rota para adicionar usuário
app.post("/usuarios", async (req, res) => {
  try {
    const { nome, email, documento } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ sucesso: false, mensagem: "Nome e email são obrigatórios." });
    }

    const novoUsuario = {
      _id: "usr_" + Date.now(),
      nome,
      email,
      documento,
      _createdDate: new Date(),
      _updatedDate: new Date(),
    };

    const resultado = await db.collection("usuarios").insertOne(novoUsuario);
    res.status(201).json({
      sucesso: true,
      mensagem: "Usuário criado com sucesso!",
      usuario: resultado,
    });
  } catch (erro) {
    console.error("Erro ao criar usuário:", erro);
    res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao criar usuário.",
    });
  }
});

// Rota para listar usuários
app.get("/usuarios", async (req, res) => {
  try {
    const usuarios = await db.collection("usuarios").find().toArray();
    res.json(usuarios);
  } catch (erro) {
    console.error("Erro ao listar usuários:", erro);
    res.status(500).json({ erro: "Falha ao buscar usuários" });
  }
});

// ==========================
// 🚀 Inicializa o servidor
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
