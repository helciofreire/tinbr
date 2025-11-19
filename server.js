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
    //await db.collection("users").createIndex({ email: 1 }, { unique: true });
    //await db.collection("users").createIndex({ documento: 1 }, { unique: true });
    //await db.collection("clientes").createIndex({ cliente_id: 1 }, { unique: true });

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
// ======================= PROPRIETÁRIOS COM SEGURANÇA =======================

// GET - Listar proprietários APENAS do cliente
app.get("/proprietarios", async (req, res) => {
  try {
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const proprietarios = await db.collection("proprietarios")
      .find({ cliente_id: cliente_id }) // ✅ Filtra por cliente
      .toArray();
      
    res.json(proprietarios);
  } catch (err) {
    console.error("Erro ao buscar proprietarios:", err);
    res.status(500).json({ erro: "Erro ao buscar proprietarios" });
  }
});

// GET - Buscar proprietário por ID COM verificação de cliente
app.get("/proprietarios/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const proprietario = await db.collection("proprietarios").findOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!proprietario) {
      return res.status(404).json({ erro: "Proprietário não encontrado" });
    }
    
    res.json(proprietario);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar proprietário" });
  }
});

// POST - Criar novo proprietário COM cliente_id
app.post("/proprietarios", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ Validação obrigatória
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ Verifica se já existe no MESMO cliente
    if (dados.documento) {
      const existente = await db.collection("proprietarios").findOne({
        documento: dados.documento,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Proprietário já cadastrado para este cliente" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();
    
    const resultado = await db.collection("proprietarios").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Proprietário criado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar proprietário" });
  }
});

// PUT - Atualizar proprietário COM verificação de cliente
app.put("/proprietarios/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // Remove campos que não devem ser atualizados
    const { _id, cliente_id: bodyClienteId, criadoEm, ...camposParaAtualizar } = dados;
    
    camposParaAtualizar.atualizadoEm = new Date();
    
    const resultado = await db.collection("proprietarios").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id // ✅ Só atualiza se pertencer ao cliente
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Proprietário não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Proprietário atualizado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar proprietário" });
  }
});

// DELETE - Remover proprietário COM verificação de cliente
app.delete("/proprietarios/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("proprietarios").deleteOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só exclui se pertencer ao cliente
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Proprietário não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Proprietário excluído com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover proprietário" });
  }
});

// ======================= CLIENTES =======================

// GET - Listar todos os clientes
app.get("/clientes", async (req, res) => {
  try {
    const clientes = await db.collection("clientes").find().toArray();
    res.json(clientes);
  } catch (err) {
    console.error("Erro ao buscar clientes:", err);
    res.status(500).json({ erro: "Erro ao buscar clientes" });
  }
});

// GET - Buscar um cliente por ID
app.get("/clientes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    //const cliente = await db.collection("clientes").findOne({ _id: new ObjectId(id) });
    const cliente = await db.collection("clientes").findOne({ _id: id });
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
    res.json(cliente);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar cliente" });
  }
});

// POST - Criar novo cliente
app.post("/clientes", async (req, res) => {
  try {
    const dados = req.body;
    dados.criadoEm = new Date();
    const resultado = await db.collection("clientes").insertOne(dados);
    res.json({ sucesso: true, _id: resultado.insertedId });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar cliente" });
  }
});

// PUT - Atualizar cliente
app.put("/clientes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    dados.atualizadoEm = new Date();
    const resultado = await db.collection("clientes").updateOne(
      //{ _id: new ObjectId(id) },
      { _id: id },
      { $set: dados }
    );
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar cliente" });
  }
});

// DELETE - Remover cliente
app.delete("/clientes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    //const resultado = await db.collection("clientes").deleteOne({ _id: new ObjectId(id) });
    const resultado = await db.collection("clientes").deleteOne({ _id: id });
    res.json({ sucesso: true, resultado });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover cliente" });
  }
});


// ======================= USERS COM SEGURANÇA =======================

// GET - Listar usuários APENAS do cliente
app.get("/users", async (req, res) => {
  try {
    const { cliente_id, nivel_gt, nivel, limit = 1000, sort } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Filtro base por cliente
    let filter = { cliente_id: cliente_id };
    
    // ✅ Filtros adicionais
    if (nivel_gt) filter.nivel = { $gt: parseInt(nivel_gt) };
    if (nivel) filter.nivel = parseInt(nivel);
    
    const options = {
      limit: parseInt(limit)
    };
    
    // ✅ Ordenação
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const users = await db.collection("users")
      .find(filter, options)
      .toArray();
      
    res.json(users);
  } catch (err) {
    console.error("Erro ao buscar usuários:", err);
    res.status(500).json({ erro: "Erro ao buscar usuários" });
  }
});

// GET - Buscar um usuário por ID COM verificação de cliente
app.get("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const user = await db.collection("users").findOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar usuário" });
  }
});

// POST - Criar novo usuário COM validação
app.post("/users", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ Validação obrigatória
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ Verifica se email já existe no MESMO cliente
    if (dados.email) {
      const existente = await db.collection("users").findOne({
        email: dados.email,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Email já cadastrado para este cliente" 
        });
      }
    }
    
    // ✅ Verifica se documento já existe no MESMO cliente
    if (dados.documento) {
      const existente = await db.collection("users").findOne({
        documento: dados.documento,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Documento já cadastrado para este cliente" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();
    
    const resultado = await db.collection("users").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Usuário criado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar usuário" });
  }
});

// PUT - Atualizar usuário COM verificação de cliente
app.put("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Remove campos protegidos
    const { _id, cliente_id: bodyClienteId, criadoEm, ...camposParaAtualizar } = dados;
    
    camposParaAtualizar.atualizadoEm = new Date();
    
    // ✅ Verifica duplicidade de email/documento (se for atualizar)
    if (camposParaAtualizar.email) {
      const emailExistente = await db.collection("users").findOne({
        email: camposParaAtualizar.email,
        cliente_id: cliente_id,
        _id: { $ne: id } // Exclui o próprio usuário
      });
      
      if (emailExistente) {
        return res.status(400).json({ erro: "Email já existe neste cliente" });
      }
    }
    
    if (camposParaAtualizar.documento) {
      const docExistente = await db.collection("users").findOne({
        documento: camposParaAtualizar.documento,
        cliente_id: cliente_id,
        _id: { $ne: id }
      });
      
      if (docExistente) {
        return res.status(400).json({ erro: "Documento já existe neste cliente" });
      }
    }
    
    const resultado = await db.collection("users").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id // ✅ Só atualiza se pertencer ao cliente
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Usuário atualizado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar usuário" });
  }
});

// DELETE - Remover usuário COM verificação de cliente
app.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("users").deleteOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só exclui se pertencer ao cliente
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Usuário excluído com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover usuário" });
  }
});

// ======================= PLAYERS COM SEGURANÇA =======================

// GET - Listar players APENAS do cliente
app.get("/players", async (req, res) => {
  try {
    const { cliente_id, limit = 1000, sort } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Filtro base por cliente
    let filter = { cliente_id: cliente_id };
    
    const options = {
      limit: parseInt(limit)
    };
    
    // ✅ Ordenação
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const players = await db.collection("players")
      .find(filter, options)
      .toArray();
      
    res.json(players);
  } catch (err) {
    console.error("Erro ao buscar players:", err);
    res.status(500).json({ erro: "Erro ao buscar players" });
  }
});

// GET - Buscar um player por ID COM verificação de cliente
app.get("/players/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const player = await db.collection("players").findOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!player) {
      return res.status(404).json({ erro: "Player não encontrado" });
    }
    
    res.json(player);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar player" });
  }
});

// POST - Criar novo player COM validação
app.post("/players", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ Validação obrigatória
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ Verifica se email já existe no MESMO cliente
    if (dados.email) {
      const existente = await db.collection("players").findOne({
        email: dados.email,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Email já cadastrado para este cliente" 
        });
      }
    }
    
    // ✅ Verifica se documento já existe no MESMO cliente
    if (dados.documento) {
      const existente = await db.collection("players").findOne({
        documento: dados.documento,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Documento já cadastrado para este cliente" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();
    
    const resultado = await db.collection("players").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Player criado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar player" });
  }
});

// PUT - Atualizar player COM verificação de cliente
app.put("/players/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Remove campos protegidos
    const { _id, cliente_id: bodyClienteId, criadoEm, ...camposParaAtualizar } = dados;
    
    camposParaAtualizar.atualizadoEm = new Date();
    
    // ✅ Verifica duplicidade de email (se for atualizar)
    if (camposParaAtualizar.email) {
      const emailExistente = await db.collection("players").findOne({
        email: camposParaAtualizar.email,
        cliente_id: cliente_id,
        _id: { $ne: id } // Exclui o próprio player
      });
      
      if (emailExistente) {
        return res.status(400).json({ erro: "Email já existe neste cliente" });
      }
    }
    
    // ✅ Verifica duplicidade de documento (se for atualizar)
    if (camposParaAtualizar.documento) {
      const docExistente = await db.collection("players").findOne({
        documento: camposParaAtualizar.documento,
        cliente_id: cliente_id,
        _id: { $ne: id }
      });
      
      if (docExistente) {
        return res.status(400).json({ erro: "Documento já existe neste cliente" });
      }
    }
    
    const resultado = await db.collection("players").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id // ✅ Só atualiza se pertencer ao cliente
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Player não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Player atualizado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar player" });
  }
});

// DELETE - Remover player COM verificação de cliente
app.delete("/players/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("players").deleteOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só exclui se pertencer ao cliente
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Player não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Player excluído com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover player" });
  }
});

// ======================= TKS COM SEGURANÇA =======================

// GET - Listar tks APENAS do cliente
app.get("/tks", async (req, res) => {
  try {
    const { cliente_id, limit = 1000, sort } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Filtro base por cliente
    let filter = { cliente_id: cliente_id };
    
    const options = {
      limit: parseInt(limit)
    };
    
    // ✅ Ordenação
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const tks = await db.collection("tks")
      .find(filter, options)
      .toArray();
      
    res.json(tks);
  } catch (err) {
    console.error("Erro ao buscar tks:", err);
    res.status(500).json({ erro: "Erro ao buscar tks" });
  }
});

// GET - Buscar um tk por ID COM verificação de cliente
app.get("/tks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const tk = await db.collection("tks").findOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!tk) {
      return res.status(404).json({ erro: "Tk não encontrado" });
    }
    
    res.json(tk);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar tk" });
  }
});

// POST - Criar novo tk COM validação
app.post("/tks", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ Validação obrigatória
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ Verifica se token já existe no MESMO cliente
    if (dados.token) {
      const existente = await db.collection("tks").findOne({
        token: dados.token,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Token já cadastrado para este cliente" 
        });
      }
    }
    
    // ✅ Verifica se código já existe no MESMO cliente
    if (dados.codigo) {
      const existente = await db.collection("tks").findOne({
        codigo: dados.codigo,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Código já cadastrado para este cliente" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();
    
    const resultado = await db.collection("tks").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Tk criado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar tk" });
  }
});

// PUT - Atualizar tk COM verificação de cliente
app.put("/tks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Remove campos protegidos
    const { _id, cliente_id: bodyClienteId, criadoEm, ...camposParaAtualizar } = dados;
    
    camposParaAtualizar.atualizadoEm = new Date();
    
    // ✅ Verifica duplicidade de token (se for atualizar)
    if (camposParaAtualizar.token) {
      const tokenExistente = await db.collection("tks").findOne({
        token: camposParaAtualizar.token,
        cliente_id: cliente_id,
        _id: { $ne: id } // Exclui o próprio tk
      });
      
      if (tokenExistente) {
        return res.status(400).json({ erro: "Token já existe neste cliente" });
      }
    }
    
    // ✅ Verifica duplicidade de código (se for atualizar)
    if (camposParaAtualizar.codigo) {
      const codigoExistente = await db.collection("tks").findOne({
        codigo: camposParaAtualizar.codigo,
        cliente_id: cliente_id,
        _id: { $ne: id }
      });
      
      if (codigoExistente) {
        return res.status(400).json({ erro: "Código já existe neste cliente" });
      }
    }
    
    const resultado = await db.collection("tks").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id // ✅ Só atualiza se pertencer ao cliente
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Tk não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Tk atualizado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar tk" });
  }
});

// DELETE - Remover tk COM verificação de cliente
app.delete("/tks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("tks").deleteOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só exclui se pertencer ao cliente
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Tk não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Tk excluído com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover tk" });
  }
});

// ======================= REFERENCIA COM SEGURANÇA =======================

// GET - Listar referencia APENAS do cliente
app.get("/referencia", async (req, res) => {
  try {
    const { cliente_id, limit = 1000, sort } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    let filter = { cliente_id: cliente_id };
    
    const options = {
      limit: parseInt(limit)
    };
    
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const referencia = await db.collection("referencia")
      .find(filter, options)
      .toArray();
      
    res.json(referencia);
  } catch (err) {
    console.error("Erro ao buscar referencia:", err);
    res.status(500).json({ erro: "Erro ao buscar referencia" });
  }
});

// GET - Buscar um referencia por ID COM verificação de cliente
app.get("/referencia/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const referencia = await db.collection("referencia").findOne({ 
      _id: id,
      cliente_id: cliente_id
    });
    
    if (!referencia) {
      return res.status(404).json({ erro: "Referencia não encontrado" });
    }
    
    res.json(referencia);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar referencia" });
  }
});

// POST - Criar novo referencia COM validação
app.post("/referencia", async (req, res) => {
  try {
    const dados = req.body;
    
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ CORREÇÃO: Definir um campo único específico ou remover a validação
    // Exemplo se tiver campo "codigo" único:
    if (dados.codigo) {
      const existente = await db.collection("referencia").findOne({
        codigo: dados.codigo,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Código já cadastrado para este cliente" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();
    
    const resultado = await db.collection("referencia").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Referencia criado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar referencia" });
  }
});

// PUT - Atualizar referencia COM verificação de cliente
app.put("/referencia/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const { _id, cliente_id: bodyClienteId, criadoEm, ...camposParaAtualizar } = dados;
    
    camposParaAtualizar.atualizadoEm = new Date();
    
    // ✅ CORREÇÃO: Definir campo único específico
    if (camposParaAtualizar.codigo) {
      const existente = await db.collection("referencia").findOne({
        codigo: camposParaAtualizar.codigo,
        cliente_id: cliente_id,
        _id: { $ne: id }
      });
      
      if (existente) {
        return res.status(400).json({ erro: "Código já existe neste cliente" });
      }
    }
    
    const resultado = await db.collection("referencia").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Referencia não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Referencia atualizado com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar referencia" });
  }
});

// DELETE - Remover referencia COM verificação de cliente
app.delete("/referencia/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("referencia").deleteOne({ 
      _id: id,
      cliente_id: cliente_id
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Referencia não encontrado" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Referencia excluído com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover referencia" });
  }
});
// ======================= OPERACOES COM SEGURANÇA =======================

// GET - Listar operacoes APENAS do cliente
app.get("/operacoes", async (req, res) => {
  try {
    const { cliente_id, limit = 1000, sort } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Filtro base por cliente
    let filter = { cliente_id: cliente_id };
    
    const options = {
      limit: parseInt(limit)
    };
    
    // ✅ Ordenação
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const operacoes = await db.collection("operacoes")
      .find(filter, options)
      .toArray();
      
    res.json(operacoes);
  } catch (err) {
    console.error("Erro ao buscar operacoes:", err);
    res.status(500).json({ erro: "Erro ao buscar operacoes" });
  }
});

// GET - Buscar uma operacao por ID COM verificação de cliente
app.get("/operacoes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const operacao = await db.collection("operacoes").findOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!operacao) {
      return res.status(404).json({ erro: "Operacao não encontrada" });
    }
    
    res.json(operacao);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar operacao" });
  }
});

// POST - Criar nova operacao COM validação
app.post("/operacoes", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ Validação obrigatória
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ Verifica se código da operação já existe no MESMO cliente
    if (dados.codigo_operacao) {
      const existente = await db.collection("operacoes").findOne({
        codigo_operacao: dados.codigo_operacao,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Código da operação já cadastrado para este cliente" 
        });
      }
    }
    
    // ✅ Verifica se transação já existe no MESMO cliente
    if (dados.transacao_id) {
      const existente = await db.collection("operacoes").findOne({
        transacao_id: dados.transacao_id,
        cliente_id: dados.cliente_id
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Transação já cadastrada para este cliente" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    dados.atualizadoEm = new Date();
    
    const resultado = await db.collection("operacoes").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Operacao criada com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar operacao" });
  }
});

// PUT - Atualizar operacao COM verificação de cliente
app.put("/operacoes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dados = req.body;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Remove campos protegidos
    const { _id, cliente_id: bodyClienteId, criadoEm, ...camposParaAtualizar } = dados;
    
    camposParaAtualizar.atualizadoEm = new Date();
    
    // ✅ Verifica duplicidade de código da operação (se for atualizar)
    if (camposParaAtualizar.codigo_operacao) {
      const codigoExistente = await db.collection("operacoes").findOne({
        codigo_operacao: camposParaAtualizar.codigo_operacao,
        cliente_id: cliente_id,
        _id: { $ne: id } // Exclui a própria operação
      });
      
      if (codigoExistente) {
        return res.status(400).json({ erro: "Código da operação já existe neste cliente" });
      }
    }
    
    // ✅ Verifica duplicidade de transação (se for atualizar)
    if (camposParaAtualizar.transacao_id) {
      const transacaoExistente = await db.collection("operacoes").findOne({
        transacao_id: camposParaAtualizar.transacao_id,
        cliente_id: cliente_id,
        _id: { $ne: id }
      });
      
      if (transacaoExistente) {
        return res.status(400).json({ erro: "Transação já existe neste cliente" });
      }
    }
    
    const resultado = await db.collection("operacoes").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id // ✅ Só atualiza se pertencer ao cliente
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Operacao não encontrada" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Operacao atualizada com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar operacao" });
  }
});

// DELETE - Remover operacao COM verificação de cliente
app.delete("/operacoes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("operacoes").deleteOne({ 
      _id: id,
      cliente_id: cliente_id // ✅ Só exclui se pertencer ao cliente
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Operacao não encontrada" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Operacao excluída com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover operacao" });
  }
});

// ========================================
// CRUD PARA MERCADO (PÚBLICO - MOSTRA cliente_id)
// ========================================

// POST - Criar item no mercado (COM cliente_id obrigatório)
app.post("/mercado", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ cliente_id OBRIGATÓRIO para identificar o dono da oferta
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório" });
    }
    
    const doc = { 
      ...dados,
      criadoEm: new Date(), 
      atualizadoEm: new Date() 
    };
    
    const resultado = await db.collection("mercado").insertOne(doc);
    
    res.json({ 
      ok: true, 
      _id: resultado.insertedId,
      mensagem: "Oferta criada no mercado." 
    });
    
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// GET - Listar todas as ofertas do mercado (PÚBLICO - mostra cliente_id)
app.get("/mercado", async (req, res) => {
  try {
    const { limit = 1000, sort, status, cliente_id, token_id } = req.query;
    
    // ✅ Filtros opcionais, mas SEM filtro por padrão (mostra tudo)
    let filter = {};
    
    if (status) filter.status = status;
    if (cliente_id) filter.cliente_id = cliente_id; // Filtro opcional por cliente
    if (token_id) filter.token_id = token_id; // Filtro opcional por token
    
    const options = {
      limit: parseInt(limit)
    };
    
    // Ordenação
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const ofertas = await db.collection("mercado")
      .find(filter, options)
      .toArray();
      
    // ✅ Retorna ofertas de TODOS os clientes com cliente_id visível
    res.json(ofertas);
    
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// ✅ NOVA ROTA - Listar APENAS ofertas de um cliente específico
app.get("/mercado/cliente/:cliente_id", async (req, res) => {
  try {
    const { cliente_id } = req.params;
    const { limit = 1000, sort, status } = req.query;
    
    // ✅ Filtro OBRIGATÓRIO por cliente_id
    let filter = { cliente_id: cliente_id };
    
    if (status) filter.status = status;
    
    const options = {
      limit: parseInt(limit)
    };
    
    // Ordenação
    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      options.sort = sortFields;
    }
    
    const ofertas = await db.collection("mercado")
      .find(filter, options)
      .toArray();
      
    res.json(ofertas);
    
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// GET - Buscar oferta específica no mercado (PÚBLICO - mostra cliente_id)
app.get("/mercado/:id", async (req, res) => {
  try {
    const oferta = await db.collection("mercado").findOne({ _id: req.params.id });
    if (!oferta) return res.status(404).json({ ok: false, erro: "Oferta não encontrada" });
    
    // ✅ Retorna oferta com cliente_id visível
    res.json(oferta);
    
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// PUT - Atualizar oferta no mercado (COM verificação de dono)
app.put("/mercado/:id", async (req, res) => {
  try {
    const dados = req.body;
    const { cliente_id } = req.query; // ✅ cliente_id na query para segurança
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const dadosAtualizacao = { 
      ...dados, 
      atualizadoEm: new Date() 
    };
    
    // ✅ Só permite atualizar ofertas do PRÓPRIO cliente
    const resultado = await db.collection("mercado").updateOne(
      { 
        _id: req.params.id,
        cliente_id: cliente_id // ⚠️ Só atualiza ofertas do próprio cliente
      }, 
      { $set: dadosAtualizacao }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ ok: false, erro: "Oferta não encontrada ou você não é o dono" });
    }
    
    res.json({ ok: true, mensagem: "Oferta atualizada." });
    
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// DELETE - Remover oferta do mercado (COM verificação de dono)
app.delete("/mercado/:id", async (req, res) => {
  try {
    const { cliente_id } = req.query; // ✅ cliente_id na query para segurança
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    // ✅ Só permite excluir ofertas do PRÓPRIO cliente
    const resultado = await db.collection("mercado").deleteOne({ 
      _id: req.params.id,
      cliente_id: cliente_id // ⚠️ Só exclui ofertas do próprio cliente
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ ok: false, erro: "Oferta não encontrada ou você não é o dono" });
    }
    
    res.json({ ok: true, mensagem: "Oferta removida." });
    
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

// ======================= LOGIN =======================
app.post("/users/login", async (req, res) => {
  try {
    const { email, cpf, senha } = req.body;
    
    console.log("🔐 Tentativa de login:", { 
      email: email?.substring(0, 10) + '...', 
      cpf: cpf?.substring(0, 3) + '...',
      temSenha: !!senha 
    });

    // ✅ BUSCA O USUÁRIO
    let usuario;
    if (email) {
      usuario = await db.collection("users").findOne({ 
        email: email.trim().toLowerCase() 
      });
    } else if (cpf) {
      const cpfLimpo = cpf.replace(/\D/g, '');
      usuario = await db.collection("users").findOne({ 
        documento: cpfLimpo 
      });
    } else {
      return res.json({ 
        ok: false, 
        mensagem: "Email ou CPF é obrigatório." 
      });
    }

    if (!usuario) {
      console.log("❌ Usuário não encontrado");
      return res.json({ 
        ok: false, 
        mensagem: "Usuário não encontrado." 
      });
    }

    // ✅ VERIFICA SENHA COM BCRYPT
    console.log("🔑 Comparando senha...");
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    console.log("✅ Resultado da comparação:", senhaValida);

    if (!senhaValida) {
      return res.json({ 
        ok: false, 
        mensagem: "Senha incorreta." 
      });
    }

    // ✅ SUCESSO
    console.log("✅ Login bem-sucedido:", usuario.nome);
    res.json({
      ok: true,
      nome: usuario.nome,
      nivel: usuario.nivel,
      cliente_id: usuario.cliente_id,
      mensagem: "Login realizado com sucesso."
    });

  } catch (erro) {
    console.error("❌ Erro no login:", erro);
    res.status(500).json({ 
      ok: false, 
      mensagem: "Erro interno no servidor." 
    });
  }
});
//==========================================================
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("Servidor rodando na porta", PORT));

export default app;

