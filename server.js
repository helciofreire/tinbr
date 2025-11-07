import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";

// -----------------------------------------------------
// Função para validar senha forte
// -----------------------------------------------------
function senhaValida(senha) {
  // Min 8 chars, 1 maiúscula, 1 minúscula, 1 número, 1 especial
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
  if (obj.login) obj.login = obj.login.trim().toLowerCase(); // caso venha login genérico

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

    // Criar índices se ainda não existirem
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ documento: 1 }, { unique: true });

    console.log("✅ Índices garantidos (email e documento únicos)");

  } catch (erro) {
    console.error("❌ Erro ao conectar banco:", erro);
  }
}
conectarBanco();

// -----------------------------------------------------
// ✅ Criar Usuário (Cadastro)
// -----------------------------------------------------
app.post("/users", async (req, res) => {
  try {
    const dados = normalizar(req.body);

    if (!dados.nome || !dados.email || !dados.senha || !dados.cliente_id) {
      return res.status(400).json({ ok: false, mensagem: "Campos obrigatórios faltando (nome, email, senha, cliente_id)." });
    }

    if (!senhaValida(dados.senha)) {
      return res.status(400).json({
        ok: false,
        mensagem: "A senha deve ter no mínimo 8 caracteres, contendo: letra maiúscula, letra minúscula, número e caractere especial."
      });
    }

    const senhaHash = await bcrypt.hash(dados.senha, 10);

    const novoUsuario = {
      ...dados,
      senha: senhaHash,
      criadoEm: new Date(),
      atualizadoEm: new Date()
    };

    const result = await db.collection("users").insertOne(novoUsuario);

    return res.status(201).json({ ok: true, id: result.insertedId, mensagem: "✅ Usuário criado com sucesso." });

  } catch (erro) {
    console.error("❌ Erro ao criar usuário:", erro);

    if (erro.code === 11000) {
      return res.status(400).json({ ok: false, mensagem: "Email ou Documento já cadastrado." });
    }

    return res.status(500).json({ ok: false, mensagem: "Erro ao criar usuário." });
  }
});

// -----------------------------------------------------
// ✅ Login (email ou documento)
// -----------------------------------------------------
app.post("/users/login", async (req, res) => {
  try {
    let { login, senha } = req.body;

    if (!login || !senha) {
      return res.status(400).json({ ok: false, mensagem: "Login e senha são obrigatórios." });
    }

    login = login.trim();

    const filtro = login.includes("@")
      ? { email: login.toLowerCase() }
      : { documento: login.replace(/[^\d]/g, "") };

    const usuario = await db.collection("users").findOne(filtro);

    if (!usuario) {
      return res.status(400).json({ ok: false, mensagem: "Usuário não encontrado." });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
      return res.status(401).json({ ok: false, mensagem: "Senha incorreta." });
    }

    return res.json({
      ok: true,
      nome: usuario.nome,
      nivel: usuario.nivel ?? "",
      cliente_id: usuario.cliente_id ?? "",
      mensagem: "Login realizado com sucesso."
    });

  } catch (erro) {
    console.error("❌ Erro no login:", erro);
    return res.status(500).json({ ok: false, mensagem: "Erro ao realizar login." });
  }
});

app.get("/health", (req, res) => {
  return res.status(200).json({ ok: true, status: "online" });
});

// -----------------------------------------------------
// Iniciar servidor
// -----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor online na porta ${PORT}`));


// -----------------------------------------------------
// Iniciar servidor
// -----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor online na porta ${PORT}`));
