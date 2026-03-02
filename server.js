import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import { MongoClient, ObjectId } from "mongodb";
import { iniciarCronJobs } from "./cron-jobs.js";

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

    iniciarCronJobs(db);

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

// 🔖 Constantes de ações de histórico
const ACAO_HISTORICO = {
  BLOQUEIO: "bloqueio",
  DESBLOQUEIO: "desbloqueio"
};

// ======================= COTAÇÕES =======================

// POST - Salvar cotação do dólar
app.post("/cotacoes", async (req, res) => {
  try {
    const { data, valor } = req.body;

    if (!data || !valor) {
      return res.status(400).json({ erro: "Campos obrigatórios: data e valor" });
    }

    // Verifica se já existe para evitar duplicidade
    const existente = await db.collection("cotacoes").findOne({ data });

    if (existente) {
      return res.json({
        mensagem: "Cotação já registrada para esta data",
        cotacao: existente
      });
    }

    const nova = {
      data,
      valor,
      criadoEm: new Date()
    };

    const resultado = await db.collection("cotacoes").insertOne(nova);

    res.json({
      sucesso: true,
      mensagem: "Cotação salva com sucesso",
      _id: resultado.insertedId
    });

  } catch (err) {
    console.error("❌ Erro ao salvar cotação:", err);
    res.status(500).json({ erro: "Erro ao salvar cotação" });
  }
});

// GET - Última cotação
app.get("/cotacoes/ultima", async (req, res) => {
  try {
    const ultima = await db.collection("cotacoes")
      .find()
      .sort({ data: -1 })
      .limit(1)
      .toArray();

    if (!ultima || ultima.length === 0) {
      return res.status(404).json({ erro: "Nenhuma cotação encontrada" });
    }

    res.json(ultima[0]);

  } catch (err) {
    console.error("Erro ao buscar última cotação:", err);
    res.status(500).json({ erro: "Erro ao buscar última cotação" });
  }
});


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

// GET - Buscar proprietário por documento COM verificação de cliente
app.get("/proprietarios/documento/:documento", async (req, res) => {
  try {
    const documento = req.params.documento;
    const { cliente_id } = req.query;
    
    console.log("🔍 Buscando proprietário por documento:", documento, "cliente_id:", cliente_id);
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    if (!documento) {
      return res.status(400).json({ erro: "Documento é obrigatório" });
    }

    // ✅ Busca pelo documento (CPF/CNPJ) E verifica se pertence ao cliente
    const proprietario = await db.collection("proprietarios").findOne({ 
      documento: documento,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!proprietario) {
      return res.status(404).json({ erro: "Proprietário não encontrado" });
    }
    
    console.log("✅ Usuário encontrado:", proprietario.nome);
    res.json(proprietario);
    
  } catch (err) {
    console.error("Erro ao buscar proprietário por documento:", err);
    res.status(500).json({ erro: "Erro ao buscar proprietário" });
  }
});

// LISTAR PROPRIETÁRIOS BLOQUEADOS POR CLIENTE
app.get("/proprietarios/bloqueados", async (req, res) => {
  try {
    const { cliente_id } = req.query;

    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório" });
    }

    const proprietarios = await db
      .collection("proprietarios")
      .find({
        cliente_id: cliente_id.trim(),
        situacao: "bloqueado"
      })
      .sort({ razao: 1 })
      .toArray();

    return res.json(proprietarios);

  } catch (err) {
    console.error("Erro ao listar proprietários bloqueados:", err);
    return res.status(500).json({ erro: "Erro ao listar proprietários bloqueados" });
  }
});

// LISTAR PROPRIETÁRIOS ATIVOS (PARA DROPDOWN)
app.get("/proprietarios/ativos", async (req, res) => {
  try {
    const { cliente_id } = req.query;

    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório" });
    }

    const proprietarios = await db.collection("proprietarios")
      .find(
        {
          cliente_id: cliente_id.trim(),
          situacao: { $ne: "bloqueado" },       // 🚫 exclui bloqueados
          status_vinculo: { $ne: "encerrado" }  // 🚫 exclui encerrados
        },
        {
          projection: {
            _id: 1,
            razao: 1
          }
        }
      )
      .sort({ razao: 1 })
      .toArray();

    res.json(proprietarios);

  } catch (err) {
    console.error("Erro ao listar proprietários ativos:", err);
    res.status(500).json({ erro: "Erro ao listar proprietários ativos" });
  }
});


// GET - Buscar proprietário por CPF do responsável COM verificação de cliente
app.get("/proprietarios/responsavel/:cpfresp", async (req, res) => {
  try {
    const cpfresp = req.params.cpfresp;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const proprietario = await db.collection("proprietarios").findOne({ 
      cpfresp: cpfresp,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!proprietario) {
      return res.status(404).json({ erro: "Proprietário não encontrado para este CPF de responsável" });
    }
    
    res.json(proprietario);
  } catch (err) {
    res.status(500).json({ erro: "Erro ao buscar proprietário por responsável" });
  }
});



// ⛔ BLOQUEAR PROPRIETÁRIO + PROPRIEDADES (COM HISTÓRICO)
app.patch("/proprietarios/bloquear", async (req, res) => {
  try {
    const { cliente_id, dados_bloqueio, nome } = req.body;

    console.log("⛔ Bloqueio avançado:", {
      cliente_id,
      proprietario_id: dados_bloqueio?._id,
      usuario: nome
    });

    // ✅ Validações
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório" });
    }

    if (!dados_bloqueio || !dados_bloqueio._id) {
      return res.status(400).json({ erro: "dados_bloqueio inválidos" });
    }

    const proprietario_id = String(dados_bloqueio._id).trim();
    const agora = new Date();

    /* 1️⃣ BLOQUEIA O PROPRIETÁRIO (APLICANDO CAMPOS REAIS) */
    const resultProp = await db.collection("proprietarios").updateOne(
      {
        _id: proprietario_id,
        cliente_id: String(cliente_id).trim()
      },
      {
        $set: {
          status_vinculo: dados_bloqueio.status_vinculo || "bloqueado",
          motivo_bloqueio: dados_bloqueio.motivo_bloqueio || null,
          data_inicio_exclusao: agora,
          prazo_confirmacao: dados_bloqueio.prazo_confirmacao ?? 0,
          bloqueio_assinatura_gestor: !!dados_bloqueio.bloqueio_assinatura_gestor,
          plataforma_arbitro_ativo: true,
          novo_gestor_indicado: dados_bloqueio.novo_gestor_indicado || null,
          data_encerramento: null,
          situacao: "bloqueado",
          atualizadoEm: agora
        }
      }
    );

    if (resultProp.matchedCount === 0) {
      return res.status(404).json({ erro: "Proprietário não encontrado" });
    }

    /* 2️⃣ BLOQUEIA TODAS AS PROPRIEDADES DO PROPRIETÁRIO */
    const resultProps = await db.collection("propriedades").updateMany(
      {
        proprietario_id,
        cliente_id: String(cliente_id).trim()
      },
      {
        $set: {
          status: "bloqueado",
          motivo_bloqueio: dados_bloqueio.motivo_bloqueio || null,
          usuario_bloqueio: nome || null,
          atualizadoEm: agora
        }
      }
    );

    /* 3️⃣ REGISTRA HISTÓRICO */
    await db.collection("proprietarios_historico").insertOne({
      proprietario_id,
      cliente_id: String(cliente_id).trim(),
      acao: "bloqueio",
      motivo: dados_bloqueio.motivo_bloqueio || null,
      usuario: nome || null,
      data: agora,
      propriedades_afetadas: resultProps.modifiedCount
    });

    return res.json({
      sucesso: true,
      proprietario_id,
      propriedadesBloqueadas: resultProps.modifiedCount
    });

  } catch (err) {
    console.error("💥 Erro no bloqueio avançado:", err);
    return res.status(500).json({ erro: err.message });
  }
});

// 🔓 DESBLOQUEAR PROPRIETÁRIO + PROPRIEDADES (COM HISTÓRICO)
app.patch("/proprietarios/:id/desbloquear", async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_id, dados_desbloqueio, nome } = req.body;

    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório" });
    }

    const proprietario_id = String(id).trim();
    const agora = new Date();

    /* 1️⃣ DESBLOQUEIA O PROPRIETÁRIO (LIMPA BLOQUEIO) */
    const resultProp = await db.collection("proprietarios").updateOne(
      {
        _id: proprietario_id,
        cliente_id: String(cliente_id).trim()
      },
      {
        $set: {
          status_vinculo: "ativo",
          situacao: "ativo",
          motivo_bloqueio: null,
          data_inicio_exclusao: null,
          prazo_confirmacao: null,
          bloqueio_assinatura_gestor: false,
          plataforma_arbitro_ativo: true,
          novo_gestor_indicado: null,
          data_encerramento: agora,
          atualizadoEm: agora
        }
      }
    );

    if (resultProp.matchedCount === 0) {
      return res.status(404).json({ erro: "Proprietário não encontrado" });
    }

    /* 2️⃣ REATIVA TODAS AS PROPRIEDADES */
    const resultProps = await db.collection("propriedades").updateMany(
      {
        proprietario_id,
        cliente_id: String(cliente_id).trim()
      },
      {
        $set: {
          status: "ativo",
          motivo_bloqueio: null,
          usuario_bloqueio: null,
          atualizadoEm: agora
        }
      }
    );

    /* 3️⃣ HISTÓRICO */
    await db.collection("proprietarios_historico").insertOne({
      proprietario_id,
      cliente_id: String(cliente_id).trim(),
      acao: "desbloqueio",
      motivo: dados_desbloqueio?.motivo || "Ação do usuário",
      usuario: nome || null,
      data: agora,
      propriedades_afetadas: resultProps.modifiedCount
    });

    return res.json({
      sucesso: true,
      propriedades_reabilitadas: resultProps.modifiedCount
    });

  } catch (err) {
    console.error("💥 Erro ao desbloquear proprietário:", err);
    return res.status(500).json({ erro: err.message });
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



// GET - Buscar proprietários ATIVOS por CPF do responsável
app.get("/proprietarios/ativos-por-responsavel/:cpfresp", async (req, res) => {
  try {
    const { cpfresp } = req.params;
    const { cliente_id } = req.query;

    if (!cliente_id) {
      return res.status(400).json({
        erro: "cliente_id é obrigatório na query"
      });
    }

    // 🔍 Busca SOMENTE ativos
    const proprietarios = await db.collection("proprietarios")
      .find({
        cpfresp: cpfresp,
        cliente_id: cliente_id,
        situacao: "ativo" // ✅ filtro principal
      })
      .toArray();

    // 🔹 CASO 0 — nenhum ativo
    if (!proprietarios || proprietarios.length === 0) {
      return res.json({
        quantidade: 0
      });
    }

    // 🔹 CASO 1 — retorna JSON completo
    if (proprietarios.length === 1) {
      return res.json({
        quantidade: 1,
        proprietario: proprietarios[0]
      });
    }

    // 🔹 CASO > 1 — retorna lista resumida (dropdown)
    const listaDropdown = proprietarios.map(p => ({
      _id: p._id,
      razao: p.razao
    }));

    return res.json({
      quantidade: proprietarios.length,
      proprietarios: listaDropdown
    });

  } catch (err) {
    console.error("Erro ao buscar proprietários ativos por responsável:", err);
    return res.status(500).json({
      erro: "Erro ao buscar proprietários ativos por responsável"
    });
  }
});



// GET - Buscar proprietários BLOQUEADOS por CPF do responsável
app.get("/proprietarios/bloqueados-por-responsavel/:cpfresp", async (req, res) => {
  try {
    const { cpfresp } = req.params;
    const { cliente_id } = req.query;

    if (!cliente_id) {
      return res.status(400).json({
        erro: "cliente_id é obrigatório na query"
      });
    }

    // 🔍 Busca TODOS os bloqueados (sem project)
    const lista = await db.collection("proprietarios")
      .find({
        cpfresp,
        cliente_id,
        situacao: "bloqueado"
      })
      .toArray();

    // 🔹 CASO 0
    if (!lista || lista.length === 0) {
      return res.json({ quantidade: 0 });
    }

    // 🔹 CASO 1 → retorna JSON COMPLETO
    if (lista.length === 1) {
      return res.json({
        quantidade: 1,
        proprietario: lista[0]
      });
    }

    // 🔹 CASO > 1 → monta dropdown resumido
    const proprietarios = lista.map(p => ({
      _id: p._id,
      razao: p.razao
    }));

    return res.json({
      quantidade: proprietarios.length,
      proprietarios
    });

  } catch (err) {
    console.error("Erro ao buscar proprietários bloqueados por responsável:", err);
    return res.status(500).json({
      erro: "Erro ao buscar proprietários bloqueados por responsável"
    });
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

//======================== COMPRADORES ====================
// GET - Buscar comprador por documento
app.get("/compradores/por-documento/:documento", async (req, res) => {
  try {
    const { documento } = req.params;

    if (!documento) {
      return res.status(400).json({
        erro: "Documento é obrigatório"
      });
    }

    // Remove caracteres não numéricos (CPF/CNPJ)
    const documentoLimpo = documento.replace(/\D/g, "");

    const comprador = await db.collection("compradores").findOne({
      documento: documentoLimpo
    });

    if (!comprador) {
      return res.status(200).json({
        encontrado: false,
        status: "nok"
      });
    }

    return res.status(200).json({
      encontrado: true,
      status: "ok",
      comprador
    });

  } catch (error) {
    console.error("Erro ao buscar comprador:", error);
    return res.status(500).json({
      erro: "Erro interno do servidor"
    });
  }
});

// PUT - Atualizar comprador por ID (string)
app.put("/compradores/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { dados } = req.body;

    if (!id) {
      return res.status(400).json({
        erro: "ID é obrigatório"
      });
    }

    if (!dados || typeof dados !== "object") {
      return res.status(400).json({
        erro: "Objeto 'dados' é obrigatório para atualização"
      });
    }

    // Verifica se o comprador existe
    const compradorExistente = await db.collection("compradores").findOne({
      _id: id
    });

    if (!compradorExistente) {
      return res.status(404).json({
        encontrado: false,
        status: "nok",
        mensagem: "Comprador não encontrado"
      });
    }

    // Proteção contra alteração de campos sensíveis
    delete dados._id;

    const resultado = await db.collection("compradores").updateOne(
      { _id: id },
      { $set: dados }
    );

    return res.status(200).json({
      encontrado: true,
      status: "ok",
      modificados: resultado.modifiedCount
    });

  } catch (error) {
    console.error("Erro ao atualizar comprador:", error);
    return res.status(500).json({
      erro: "Erro interno do servidor"
    });
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

// POST - ADICIONAR novo cliente
app.post("/clientes", async (req, res) => {
  try {
    const dados = req.body;
    
    // ✅ ADICIONAR VALIDAÇÃO DE DUPLICATA
    if (dados.documento) {
      const existente = await db.collection("clientes").findOne({
        documento: dados.documento
      });
      
      if (existente) {
        return res.status(400).json({ 
          erro: "Cliente já cadastrado com este documento" 
        });
      }
    }
    
    dados.criadoEm = new Date();
    const resultado = await db.collection("clientes").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId 
    });
    
  } catch (err) {
    // ✅ PROTEÇÃO EXTRA - se índice MongoDB bloquear
    if (err.code === 11000) {
      const campo = Object.keys(err.keyValue)[0];
      return res.status(400).json({ 
        erro: `Já existe um cliente com este ${campo}`
      });
    }
    
    console.error("❌ Erro ao criar cliente:", err);
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

// GET - Buscar usuário APENAS pelo email (para recuperação de senha)
app.get("/users/email/:email", async (req, res) => {
    try {
        const email = req.params.email;
        
        if (!email) {
            return res.status(400).json({ erro: "Email é obrigatório" });
        }

        const user = await db.collection("users").findOne({ 
            email: email.toLowerCase().trim()
        });

        if (!user) {
            return res.status(404).json({ erro: "Usuário não encontrado" });
        }

        // ✅ Retorna apenas dados necessários para recuperação (sem senha)
        const { senha, ...userSemSenha } = user;
        
        res.json({
            sucesso: true,
            usuario: userSemSenha,
            mensagem: "Usuário encontrado"
        });

    } catch (err) {
        console.error("Erro ao buscar usuário por email:", err);
        res.status(500).json({ erro: "Erro ao buscar usuário" });
    }
});

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

// GET - Buscar usuário por documento COM verificação de cliente
app.get("/users/documento/:documento", async (req, res) => {
  try {
    const documento = req.params.documento;
    const { cliente_id } = req.query;
    
    console.log("🔍 Buscando usuário por documento:", documento, "cliente_id:", cliente_id);
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    if (!documento) {
      return res.status(400).json({ erro: "Documento é obrigatório" });
    }

    // ✅ Busca pelo documento (CPF/CNPJ) E verifica se pertence ao cliente
    const user = await db.collection("users").findOne({ 
      documento: documento,
      cliente_id: cliente_id // ✅ Só retorna se pertencer ao cliente
    });
    
    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }
    
    console.log("✅ Usuário encontrado:", user.nome);
    res.json(user);
    
  } catch (err) {
    console.error("Erro ao buscar usuário por documento:", err);
    res.status(500).json({ erro: "Erro ao buscar usuário" });
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

app.post("/recuperacao/redefinir-senha", async (req, res) => {
    try {
        console.log("🔍 Dados recebidos:", req.body);
        
        const { email, novaSenha } = req.body;
        
        if (!email || !novaSenha) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: "❌ Dados incompletos." 
            });
        }

        const usuario = await db.collection("users").findOne({ 
            email: email.toLowerCase().trim()
        });

        if (!usuario) {
            return res.status(404).json({ 
                sucesso: false, 
                mensagem: "❌ Usuário não encontrado." 
            });
        }

        // ✅ ATUALIZA senha E atualizadoEm no formato ISO
        await db.collection("users").updateOne(
            { _id: usuario._id },
            { 
                $set: { 
                    senha: novaSenha,
                    atualizadoEm: new Date().toISOString() // ✅ Formato "2025-11-15T15:02:22.970Z"
                }
            }
        );

        console.log("✅ Senha e atualizadoEm atualizados com sucesso!");
        
        res.json({ 
            sucesso: true, 
            mensagem: "✅ Senha redefinida com sucesso!" 
        });

    } catch (err) {
        console.error("❌ ERRO DETALHADO:", err);
        res.status(500).json({ 
            sucesso: false, 
            mensagem: "❌ Erro interno ao redefinir senha" 
        });
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
    // ✅ PROTEÇÃO EXTRA - se índice MongoDB bloquear
    if (err.code === 11000) {
      const campo = Object.keys(err.keyValue)[0];
      return res.status(400).json({ 
        erro: `Já existe um usuário com este ${campo} para este cliente`
      });
    }
    
    console.error("❌ Erro ao criar usuário:", err);
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

// ======================= PROPRIEDADES COM SEGURANÇA =======================

// ------------------------------------------------------------
// ROTAS PROPRIEDADES (ordem correta)
// ------------------------------------------------------------
// LISTAR CATEGORIAS POR CLIENTE
app.get("/propriedades/categorias-por-cliente", async (req, res) => {
  try {
    const { cliente_id } = req.query;
    if (!cliente_id)
      return res.status(400).json({ erro: "cliente_id é obrigatório" });

    const pipeline = [
      { $match: { cliente_id } },
      {
        $group: {
          _id: "$categoria"
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          value: "$_id",
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          }
        }
      }
    ];

    const categorias = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(categorias);

  } catch (err) {
    console.error("Erro ao buscar categorias:", err);
    res.status(500).json({ erro: "Erro ao buscar categorias" });
  }
});

//===========================CATEGORIAS POR CLIENTE E MUNICIPIO====================
app.get("/propriedades-categorias-municipio", async (req, res) => {
  try {
    const { cliente_id, ibge } = req.query;

    if (!cliente_id)
      return res.status(400).json({ erro: "cliente_id é obrigatório" });

    if (!ibge)
      return res.status(400).json({ erro: "ibge é obrigatório" });

    const pipeline = [
      {
        $match: {
          cliente_id,
          ibge,
          status: "ativo" // ✅ FILTRO ADICIONADO
        }
      },
      {
        $group: {
          _id: "$categoria"
        }
      },
      {
        $project: {
          _id: 0,
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          value: "$_id"
        }
      },
      { $sort: { label: 1 } }
    ];

    const categorias = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(categorias);

  } catch (err) {
    console.error("Erro ao buscar categorias:", err);
    res.status(500).json({ erro: "Erro ao buscar categorias" });
  }
});


//===========================CATEGORIAS DE PROPRIEDADES POR CLIENTE E MUNICIPIO====================
app.get("/propriedades-por-categoria-ibge", async (req, res) => {
  try {
    const { categoria, ibge, cliente_id } = req.query;

    if (!categoria || !ibge || !cliente_id) {
      return res.status(400).json({
        erro: "categoria, ibge e cliente_id são obrigatórios"
      });
    }

    const filtro = {
      cliente_id,
      categoria,
      ibge,
      status: "ativo"
    };

    const propriedades = await db
      .collection("propriedades")
      .find(filtro)
      .project({
        _id: 1,
        referencia: 1,
	razao: 1,
        categoria: 1,
        tipo: 1,
	fase: 1,
        valor: 1,
        municipio: 1,
        ibge: 1,
        status: 1
      })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro propriedades-por-categoria-ibge:", err);
    res.status(500).json({
      erro: "Erro interno ao buscar propriedades"
    });
  }
});

//===========================FASES DE PROPRIEDADES POR CLIENTE E MUNICIPIO====================
app.get("/propriedades-por-fase-ibge", async (req, res) => {
  try {
    const { fase, ibge, cliente_id } = req.query;

    if (!fase || !ibge || !cliente_id) {
      return res.status(400).json({
        erro: "fase, ibge e cliente_id são obrigatórios"
      });
    }

    const filtro = {
      cliente_id,
      fase,
      ibge,
      status: "ativo"
    };

    const propriedades = await db
      .collection("propriedades")
      .find(filtro)
      .project({
        _id: 1,
        referencia: 1,
	razao: 1,
        fase: 1,
        tipo: 1,
        valor: 1,
        municipio: 1,
        ibge: 1,
        status: 1
      })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro propriedades-por-fase-ibge:", err);
    res.status(500).json({
      erro: "Erro interno ao buscar propriedades"
    });
  }
});


//===========================TIPOS DE PROPRIEDADES POR CLIENTE E MUNICIPIO====================
app.get("/propriedades-por-tipo-ibge", async (req, res) => {
  try {
    const { tipo, ibge, cliente_id } = req.query;

    if (!tipo || !ibge || !cliente_id) {
      return res.status(400).json({
        erro: "tipo, ibge e cliente_id são obrigatórios"
      });
    }

    const filtro = {
      cliente_id,
      tipo,
      ibge,
      status: "ativo"
    };

    const propriedades = await db
      .collection("propriedades")
      .find(filtro)
      .project({
        _id: 1,
        referencia: 1,
	razao: 1,
        categoria: 1,
        tipo: 1,
	fase: 1,
        valor: 1,
        municipio: 1,
        ibge: 1,
        status: 1
      })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro propriedades-por-tipo-ibge:", err);
    res.status(500).json({
      erro: "Erro interno ao buscar propriedades"
    });
  }
});

// ======================= TIPOS DE PROPRIEDADE POR CLIENTE=======================
app.get("/propriedades/tipos-por-cliente", async (req, res) => {
  try {
    const { cliente_id } = req.query;
    if (!cliente_id)
      return res.status(400).json({ erro: "cliente_id é obrigatório" });

    const pipeline = [
      { $match: { cliente_id } },
      {
        $group: {
          _id: "$tipo"
        }
      },
      {
        $project: {
          _id: 0,
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          value: "$_id"
        }
      },
      { $sort: { label: 1 } }
    ];

    const tipos = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(tipos);

  } catch (err) {
    console.error("Erro ao buscar tipos:", err);
    res.status(500).json({ erro: "Erro ao buscar tipos" });
  }
});

// ================= PROPRIEDADES POR TIPO (SEM FILTRO DE STATUS) =================
app.get("/propriedades/por-tipo", async (req, res) => {
  try {
    const { cliente_id, tipo } = req.query;

    if (!cliente_id || !tipo) {
      return res.status(400).json({
        erro: "cliente_id e tipo são obrigatórios"
      });
    }

    const filter = {
      cliente_id: String(cliente_id),
      tipo: tipo.trim()
    };

    const propriedades = await db
      .collection("propriedades")
      .find(filter)
      .sort({ razao: 1 })
      .toArray();

    // ✅ Sempre retorna array (mesmo vazio)
    return res.json(propriedades);

  } catch (err) {
    console.error("Erro /propriedades/por-tipo:", err);
    return res.status(500).json({
      erro: "Erro interno ao buscar propriedades por tipo"
    });
  }
});



//===========================TIPO POR CLIENTE E MUNICIPIO (SOMENTE ATIVOS)====================
app.get("/propriedades/tipos", async (req, res) => {
  try {
    const { cliente_id, municipio } = req.query;

    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório" });
    }

    // 🧠 Match seguro
    const match = {
      cliente_id: String(cliente_id),
      status: "ativo"
    };

    // municipio é opcional
    if (municipio) {
      match.municipio = municipio;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: "$tipo"
        }
      },
      {
        $project: {
          _id: 0,
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          value: "$_id"
        }
      },
      { $sort: { label: 1 } }
    ];

    const tipos = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(tipos);

  } catch (err) {
    console.error("Erro ao buscar tipos:", err);
    res.status(500).json({ erro: "Erro ao buscar tipos" });
  }
});

//===========================TIPOS POR CLIENTE E MUNICIPIO====================
app.get("/propriedades-tipos-municipio", async (req, res) => {
  try {
    const { cliente_id, ibge } = req.query;

    if (!cliente_id)
      return res.status(400).json({ erro: "cliente_id é obrigatório" });

    if (!ibge)
      return res.status(400).json({ erro: "ibge é obrigatório" });

    const pipeline = [
      {
        $match: {
          cliente_id,
          ibge,
          status: "ativo" // ✅ FILTRO ADICIONADO
        }
      },
      {
        $group: {
          _id: "$tipo"
        }
      },
      {
        $project: {
          _id: 0,
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          value: "$_id"
        }
      },
      { $sort: { label: 1 } }
    ];

    const tipos = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(tipos);

  } catch (err) {
    console.error("Erro ao buscar tipos:", err);
    res.status(500).json({ erro: "Erro ao buscar tipos" });
  }
});


// ======================= FASES DE PROPRIEDADE POR CLIENTE =======================
app.get("/propriedades/fases-por-cliente", async (req, res) => {
  try {
    const { cliente_id } = req.query;
    if (!cliente_id)
      return res.status(400).json({ erro: "cliente_id é obrigatório" });

    const pipeline = [
      { $match: { cliente_id } },
      {
        $group: {
          _id: "$fase"
        }
      },
      {
        $project: {
          _id: 0,
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          value: "$_id"
        }
      },
      { $sort: { label: 1 } }
    ];

    const fases = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(fases);

  } catch (err) {
    console.error("Erro ao buscar fases:", err);
    res.status(500).json({ erro: "Erro ao buscar fases" });
  }
});

// ======================= FASES DE PROPRIEDADE POR CLIENTE E MUNICIPIO=======================

app.get("/propriedades-fases-municipio", async (req, res) => {
  try {
    const { cliente_id, ibge } = req.query;

    if (!cliente_id)
      return res.status(400).json({ erro: "cliente_id é obrigatório" });

    if (!ibge)
      return res.status(400).json({ erro: "ibge é obrigatório" });

    const pipeline = [
      {
        $match: {
          cliente_id,
          ibge,
          status: "ativo" // ✅ FILTRO ADICIONADO
        }
      },
      {
        $group: {
          _id: "$fase"
        }
      },
      {
        $project: {
          _id: 0,
          label: {
            $concat: [
              { $toUpper: { $substrCP: ["$_id", 0, 1] } },
              { $substrCP: ["$_id", 1, { $strLenCP: "$_id" }] }
            ]
          },
          value: "$_id"
        }
      },
      { $sort: { label: 1 } }
    ];

    const fases = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(fases);

  } catch (err) {
    console.error("Erro ao buscar fases:", err);
    res.status(500).json({ erro: "Erro ao buscar fases" });
  }
});



// 1️⃣ LISTAR MUNICÍPIOS ÚNICOS DO CLIENTE
app.get("/propriedades/municipios", async (req, res) => {
  try {
    const { cliente_id } = req.query;
    if (!cliente_id) return res.status(400).json({ erro: "cliente_id é obrigatório na query" });

    const pipeline = [
      { $match: { cliente_id } },
      {
        $group: {
          _id: { uf: "$uf", municipio: "$municipio", ibge: "$ibge" }
        }
      },
      {
        $project: { _id: 0, uf: "$_id.uf", municipio: "$_id.municipio", ibge: "$_id.ibge" }
      },
      { $sort: { uf: 1, municipio: 1 } },
      {
        $project: {
          municipio: { $concat: ["$uf", " - ", "$municipio"] },
          ibge: 1
        }
      }
    ];

    const municipios = await db.collection("propriedades").aggregate(pipeline).toArray();
    res.json(municipios);

  } catch (err) {
    console.error("Erro ao buscar municípios:", err);
    res.status(500).json({ erro: "Erro ao buscar municípios" });
  }
});

// ================= PROPRIEDADES POR FASE + NÍVEL (LISTAGEM) =================
app.get("/propriedades-por-fase", async (req, res) => {
  try {
    const { cliente_id, fase, nivel } = req.query;

    // 🔴 Validações
    if (!cliente_id || !fase || nivel === undefined) {
      return res.status(400).json({
        erro: "cliente_id, fase e nivel são obrigatórios"
      });
    }

    const nivelNum = Number(nivel);
    if (Number.isNaN(nivelNum)) {
      return res.status(400).json({
        erro: "nivel deve ser numérico"
      });
    }

    // 🔎 Filtro base
    const filtro = {
      cliente_id: String(cliente_id),
      fase: String(fase)
    };

    // 🔒 Regra de privilégio
    // nível >= 3 → só ativos
    if (nivelNum >= 3) {
      filtro.status = "ativo";
    }

    const propriedades = await db
      .collection("propriedades")
      .find(filtro)
      .project({
        _id: 1,
        cliente_id: 1,
        proprietario_id: 1,

        // dados principais
        tipo: 1,
        referencia: 1,
        status: 1,

        // tokens
        tokenqtd: 1,
        tokenresto: 1,
        tokenrealcor: 1,

        // endereço
        logradouro: 1,
        numero: 1,
        complemento: 1,
        bairro: 1,
        municipio: 1,
        uf: 1,
        ibge: 1
      })
      .sort({ referencia: 1 })
      .toArray();

    // 🟡 Nenhuma encontrada
    if (!propriedades || propriedades.length === 0) {
      return res.json([]);
    }

    // ✅ Lista permitida
    return res.json(propriedades);

  } catch (err) {
    console.error("Erro propriedades-por-fase:", err);
    return res.status(500).json({
      erro: "Erro interno ao buscar propriedades"
    });
  }
});


// ================= PROPRIEDADES POR CATEGORIA + NÍVEL (LISTAGEM) =================
app.get("/categoria-vendedor", async (req, res) => {
  try {
    const { cliente_id, categoria, nivel } = req.query;

    // 🔴 Validações
    if (!cliente_id || !categoria || nivel === undefined) {
      return res.status(400).json({
        erro: "cliente_id, categoria e nivel são obrigatórios"
      });
    }

    const nivelNum = Number(nivel);
    if (Number.isNaN(nivelNum)) {
      return res.status(400).json({
        erro: "nivel deve ser numérico"
      });
    }

    // 🔎 Filtro base
    const filtro = {
      cliente_id: String(cliente_id),
      categoria: String(categoria)
    };

    // 🔒 Regra de privilégio
    // nível >= 3 → só ativos
    if (nivelNum >= 3) {
      filtro.status = "ativo";
    }

    const propriedades = await db
      .collection("propriedades")
      .find(filtro)
      .project({
        _id: 1,
        cliente_id: 1,
        proprietario_id: 1,

        // dados principais
        tipo: 1,
        referencia: 1,
        status: 1,

        // tokens
        tokenqtd: 1,
        tokenresto: 1,
        tokenrealcor: 1,

        // endereço
        logradouro: 1,
        numero: 1,
        complemento: 1,
        bairro: 1,
        municipio: 1,
        uf: 1,
        ibge: 1
      })
      .sort({ referencia: 1 })
      .toArray();

    // 🟡 Nenhuma encontrada
    if (!propriedades || propriedades.length === 0) {
      return res.json([]);
    }

    // ✅ Lista permitida
    return res.json(propriedades);

  } catch (err) {
    console.error("Erro categoria-vendedor:", err);
    return res.status(500).json({
      erro: "Erro interno ao buscar propriedades"
    });
  }
});


// ================= PROPRIEDADE POR REFERÊNCIA + NÍVEL =================
app.get("/propriedades/por-referencia", async (req, res) => {
  try {
    const { cliente_id, referencia, nivel } = req.query;

    if (!cliente_id || !referencia || nivel === undefined) {
      return res.status(400).json({
        erro: "cliente_id, referencia e nivel são obrigatórios"
      });
    }

    const nivelNum = Number(nivel);
    if (Number.isNaN(nivelNum)) {
      return res.status(400).json({ erro: "nivel deve ser numérico" });
    }

    // 🔍 Busca básica
    const propriedade = await db.collection("propriedades").findOne(
      { cliente_id, referencia },
  {
    projection: {
      _id: 1,
      status: 1,
      municipio: 1,
      ibge: 1
    }
  }
    );

    // ❌ Não encontrou
    if (!propriedade) {
      return res.status(404).json({
        erro: "Propriedade não encontrada"
      });
    }

    // 🔒 Regra de nível
    if (nivelNum >= 3 && propriedade.status !== "ativo") {
      return res.status(403).json({
        erro: "Propriedade bloqueada"
      });
    }

    // ✅ Permitido
    return res.json({
      _id: propriedade._id, // já string
      status: propriedade.status,
      municipio: propriedade.municipio,
      ibge: propriedade.ibge	
    });

  } catch (err) {
    console.error("Erro propriedades/por-referencia:", err);
    res.status(500).json({
      erro: "Erro interno ao buscar propriedade"
    });
  }
});


// 2️⃣ LISTAR TODAS AS PROPRIEDADES DO CLIENTE
app.get("/propriedades-por-cliente", async (req, res) => {
  try {
    const { cliente_id, limit = 1000, sort } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }

    let filter = { cliente_id };
    const cursor = db.collection("propriedades").find(filter);

    cursor.limit(parseInt(limit));

    if (sort) {
      const sortFields = sort.split(',').reduce((acc, field) => {
        const [fieldName, order] = field.split(':');
        acc[fieldName] = order === 'desc' ? -1 : 1;
        return acc;
      }, {});
      cursor.sort(sortFields);
    }

    const propriedades = await cursor.toArray();
    res.json(propriedades);

  } catch (err) {
    console.error("Erro ao buscar propriedades:", err);
    res.status(500).json({ erro: "Erro ao buscar propriedades" });
  }
});


// ================= PROPRIEDADES (DADOS COMPLETOS) POR PROPRIETÁRIO =================
app.get("/propriedades-tabela-por-proprietario", async (req, res) => {
  try {
    const { cliente_id, proprietario_id } = req.query;

    if (!cliente_id || !proprietario_id) {
      return res.status(400).json({
        erro: "cliente_id e proprietario_id são obrigatórios"
      });
    }

    const propriedades = await db
      .collection("propriedades")
      .find({ cliente_id, proprietario_id })
      .project({
        _id: 1,
	proprietario_id: 1,
        tipo: 1,
	fase: 1,
        referencia: 1,
        status: 1,
        tokenqtd: 1,
        tokenresto: 1,
        tokenrealcor: 1,
        logradouro: 1,
        numero: 1,
        complemento: 1,
        bairro: 1,
        municipio: 1,
        uf: 1
      })
      .sort({ razao: 1 })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro propriedades-tabela-por-proprietario:", err);
    res.status(500).json([]);
  }
});

// ================= PROPRIEDADES (DADOS COMPLETOS) POR CLIENTE =================
app.get("/propriedades-tabela-por-cliente", async (req, res) => {
  try {
    const { cliente_id } = req.query;

    if (!cliente_id) {
      return res.status(400).json({
        erro: "cliente_id é obrigatório"
      });
    }

    const propriedades = await db
      .collection("propriedades")
      .find({ cliente_id })
      .project({
        _id: 1,
        proprietario_id: 1,
        tipo: 1,
	fase: 1,
        razao: 1,
        status: 1,
        tokenqtd: 1,
        tokenresto: 1,
        tokenrealcor: 1,
        logradouro: 1,
        numero: 1,
        complemento: 1,
        bairro: 1,
        municipio: 1,
        uf: 1,
	referencia: 1
      })
      .sort({ referencia: 1 })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro propriedades-tabela-por-cliente:", err);
    res.status(500).json([]);
  }
});

// 3️⃣ LISTAR TODAS AS PROPRIEDADES POR MUNICÍPIO
app.get("/propriedades/todas-por-municipio", async (req, res) => {
  try {
    const { ibge, cliente_id } = req.query;

    if (!ibge) return res.status(400).json({ erro: "ibge é obrigatório" });
    if (!cliente_id) return res.status(400).json({ erro: "cliente_id é obrigatório" });

    const propriedades = await db
      .collection("propriedades")
      .find({
        ibge,
        cliente_id,
   })
      .sort({ municipio: 1 })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro ao buscar propriedades por Município:", err);
    res.status(500).json({ erro: "Erro ao buscar propriedades por Município" });
  }
});

// 3️⃣ LISTAR PROPRIEDADES POR MUNICÍPIO
app.get("/propriedades/municipio", async (req, res) => {
  try {
    const { ibge, cliente_id } = req.query;

    if (!ibge) return res.status(400).json({ erro: "ibge é obrigatório" });
    if (!cliente_id) return res.status(400).json({ erro: "cliente_id é obrigatório" });

    const propriedades = await db
      .collection("propriedades")
      .find({
        ibge,
        cliente_id,
        status: "ativo" // ✅ FILTRO AQUI
      })
      .sort({ municipio: 1 })
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro ao buscar propriedades por Município:", err);
    res.status(500).json({ erro: "Erro ao buscar propriedades por Município" });
  }
});


// LISTAR PROPRIEDADES (dropdown) POR CLIENTE + PROPRIETÁRIO
app.get("/propriedades-por-proprietario/dropdown", async (req, res) => {
  try {
    const { cliente_id, proprietario_id } = req.query;

    if (!cliente_id || !proprietario_id) {
      return res.status(400).json({
        erro: "cliente_id e proprietario_id são obrigatórios"
      });
    }

const pipeline = [
  {
    $match: {
      cliente_id,
      proprietario_id
    }
  },
  {
    $project: {
      _id: 0,
      label: "$razao",               // ✅ campo correto
      value: { $toString: "$_id" }
    }
  },
  { $sort: { label: 1 } }
];

    const propriedades = await db
      .collection("propriedades")
      .aggregate(pipeline)
      .toArray();

    res.json(propriedades);

  } catch (err) {
    console.error("Erro ao buscar propriedades:", err);
    res.status(500).json({ erro: "Erro interno ao buscar propriedades" });
  }
});

//VERIFICAR TOKENS VENDIDOS

app.get("/verificar-tokens-vendidos", async (req, res) => {
  try {
    const { cliente_id, proprietario_id } = req.query;

    if (!cliente_id || !proprietario_id) {
      return res.status(400).json({
        ok: false,
        erro: "cliente_id e proprietario_id são obrigatórios"
      });
    }

    const propriedades = await db.collection("propriedades").find({
      cliente_id: String(cliente_id),
      proprietario_id: String(proprietario_id)
    }).toArray();

    // ✅ NÃO TEM PROPRIEDADES
    if (propriedades.length === 0) {
      return res.json({ ok: true });
    }

    let tokensVendidosTotal = 0;

    for (const p of propriedades) {
      const tokenqtd = Number(p.tokenqtd || 0);
      const tokenresto = Number(p.tokenresto || 0);

      if (tokenresto < tokenqtd) {
        tokensVendidosTotal += (tokenqtd - tokenresto);
      }
    }

    // ❌ EXISTEM TOKENS VENDIDOS
    if (tokensVendidosTotal > 0) {
      return res.json({
        ok: false,
        tokens_vendidos: tokensVendidosTotal
      });
    }

    // ✅ NENHUM TOKEN VENDIDO
    return res.json({ ok: true });

  } catch (err) {
    console.error("💥 Erro verificar tokens:", err);
    return res.status(500).json({
      ok: false,
      erro: "Erro interno ao verificar tokens"
    });
  }
});



// BUSCAR PROPRIEDADE POR CIB (global)
app.get("/propriedades/cib/existe", async (req, res) => {
  try {
    const { cib } = req.query;

    if (!cib) {
      return res.status(400).json({ erro: "cib é obrigatório" });
    }

    const prop = await db.collection("propriedades").findOne({
      cib: cib.trim()
    });

    if (prop) {
      return res.status(200).json({
        existe: true,
        id: prop._id,
        cliente_id: prop.cliente_id
      });
    }

    return res.status(404).json({ existe: false });

  } catch (err) {
    console.error("Erro ao verificar CIB:", err);
    return res.status(500).json({ erro: "Erro ao verificar CIB" });
  }
});

// VERIFICAR SE REFERÊNCIA EXISTE PARA O CLIENTE
app.get("/propriedades/referencia/existe", async (req, res) => {
  try {
    const { referencia, cliente_id } = req.query;

    if (!referencia || !cliente_id) {
      return res.status(400).json({ erro: "referencia e cliente_id são obrigatórios" });
    }

    const existe = await db
      .collection("propriedades")
      .countDocuments(
        {
          referencia: referencia.trim(),
          cliente_id: cliente_id.trim()
        },
        { limit: 1 }
      );

    if (existe > 0) {
      return res.status(200).json({ existe: true });
    }

    return res.status(404).json({ existe: false });

  } catch (err) {
    console.error("Erro ao verificar referência:", err);
    return res.status(500).json({ erro: "Erro ao verificar referência" });
  }
});


// GET LISTAR PROPRIEDADES POR CLIENTE E PROPRIETÁRIO (DADOS COMPLETOS)
app.get("/propriedades-por-proprietario", async (req, res) => {
  try {
    const { cliente_id, proprietario_id } = req.query;

    if (!cliente_id || !proprietario_id) {
      return res.status(400).json({
        erro: "cliente_id e proprietario_id são obrigatórios."
      });
    }

    const propriedades = await db
      .collection("propriedades")
      .find({
        cliente_id: String(cliente_id),
        proprietario_id: String(proprietario_id)
      })
      .toArray();

    // ✅ retorno consistente (array vazio é OK)
    return res.json(propriedades);

  } catch (err) {
    console.error("💥 Erro GET /propriedades-por-proprietario:", err);
    return res.status(500).json({
      erro: "Erro interno ao buscar propriedades."
    });
  }
});



// 5️⃣ ÚLTIMA ROTA — BUSCAR PROPRIEDADE POR ID (sempre por último!)
app.get("/propriedades/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_id } = req.query;

    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }

    const propriedade = await db.collection("propriedades").findOne({
      _id: id,
      cliente_id
    });

    if (!propriedade) {
      return res.status(404).json({ erro: "Propriedade não encontrada" });
    }

    res.json(propriedade);

  } catch (err) {
    console.error("Erro ao buscar propriedade por ID:", err);
    res.status(500).json({ erro: "Erro ao buscar propriedade por ID" });
  }
});


// POST - Criar nova propriedade COM validação
app.post("/propriedades", async (req, res) => {
  try {
    const dados = req.body;
    
    if (!dados.cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório no body" });
    }
    
    // ✅ CORREÇÃO: Definir um campo único específico ou remover a validação
    // Exemplo se tiver campo "codigo" único:
    if (dados.codigo) {
      const existente = await db.collection("propriedades").findOne({
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
    
    const resultado = await db.collection("propriedades").insertOne(dados);
    
    res.json({ 
      sucesso: true, 
      _id: resultado.insertedId,
      mensagem: "Propriedades criada com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao criar propriedade" });
  }
});

// PUT - Atualizar propriedades COM verificação de cliente
app.put("/propriedades/:id", async (req, res) => {
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
      const existente = await db.collection("propriedades").findOne({
        codigo: camposParaAtualizar.codigo,
        cliente_id: cliente_id,
        _id: { $ne: id }
      });
      
      if (existente) {
        return res.status(400).json({ erro: "Código já existe neste cliente" });
      }
    }
    
    const resultado = await db.collection("propriedades").updateOne(
      { 
        _id: id,
        cliente_id: cliente_id
      },
      { $set: camposParaAtualizar }
    );
    
    if (resultado.matchedCount === 0) {
      return res.status(404).json({ erro: "Propriedades não encontrada" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Propriedade atualizada com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao atualizar propriedades" });
  }
});

// PUT - Atualizar valorcor e tokenrealcor
app.put("/propriedades/:id/valorcor", async (req, res) => {
  try {

    const { id } = req.params;
    const { cliente_id } = req.query;
    const { valorcor, tokenrealcor } = req.body;

    if (!cliente_id) {
      return res.status(400).json({
        erro: "cliente_id é obrigatório na query"
      });
    }

    if (valorcor === undefined || isNaN(Number(valorcor))) {
      return res.status(400).json({
        erro: "valorcor é obrigatório e deve ser numérico"
      });
    }

    if (tokenrealcor === undefined || isNaN(Number(tokenrealcor))) {
      return res.status(400).json({
        erro: "tokenrealcor é obrigatório e deve ser numérico"
      });
    }

    const resultado = await db.collection("propriedades").updateOne(
      {
        _id: String(id),
        cliente_id: String(cliente_id)
      },
      {
        $set: {
          valorcor: Number(valorcor),
          tokenrealcor: Number(tokenrealcor),
          atualizadoEm: new Date()
        }
      }
    );

    if (resultado.matchedCount === 0) {
      return res.status(404).json({
        erro: "Propriedade não encontrada"
      });
    }

    return res.json({
      sucesso: true,
      atualizado: resultado.modifiedCount > 0,
      valorCorrigido: Number(valorcor),
      token_corrigido: Number(tokenrealcor)
    });

  } catch (err) {
    console.error("Erro ao atualizar valorcor:", err);
    return res.status(500).json({
      erro: "Erro ao atualizar valorcor"
    });
  }
});


// ================= ATUALIZAR CAMPOS DIRETAMENTE =================
app.put("/propriedades/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente_id, proprietario_id } = req.query;

    if (!cliente_id || !proprietario_id) {
      return res.status(400).json({
        erro: "cliente_id e proprietario_id são obrigatórios na query."
      });
    }

    const camposParaAtualizar = req.body;

    if (!camposParaAtualizar || Object.keys(camposParaAtualizar).length === 0) {
      return res.status(400).json({
        erro: "Nenhum campo enviado para atualização."
      });
    }

    const resultado = await db.collection("propriedades").updateOne(
      {
        _id: id,
        cliente_id: String(cliente_id),
        proprietario_id: String(proprietario_id)
      },
      {
        $set: {
          ...camposParaAtualizar,
          atualizadoEm: new Date()
        }
      }
    );

    if (resultado.matchedCount === 0) {
      return res.status(404).json({
        erro: "Propriedade não encontrada para esse cliente/proprietário."
      });
    }

    return res.json({
      sucesso: true,
      mensagem: "Propriedade atualizada com sucesso.",
      camposAtualizados: camposParaAtualizar
    });

  } catch (erro) {
    console.error("💥 Erro PUT /propriedades/:id:", erro);
    return res.status(500).json({
      erro: "Erro interno ao atualizar propriedade."
    });
  }
});

// ================= ATUALIZAR STATUS DE TODAS AS PROPRIEDADES =================
app.put("/propriedades/status/proprietario/:idpro", async (req, res) => {
  try {
    const { idpro } = req.params;
    const { cliente_id } = req.query;
    const { status } = req.body;

    if (!cliente_id) {
      return res.status(400).json({
        erro: "cliente_id é obrigatório na query."
      });
    }

    if (!status) {
      return res.status(400).json({
        erro: "status é obrigatório no body."
      });
    }

    const resultado = await db.collection("propriedades").updateMany(
      {
        proprietario_id: String(idpro),
        cliente_id: String(cliente_id)
      },
      {
        $set: {
          status,
          atualizadoEm: new Date()
        }
      }
    );

    return res.json({
      sucesso: true,
      mensagem: "Status atualizado em todas as propriedades do proprietário.",
      matched: resultado.matchedCount,
      modificados: resultado.modifiedCount
    });

  } catch (erro) {
    console.error("💥 Erro updateMany status propriedades:", erro);
    return res.status(500).json({
      erro: "Erro interno ao atualizar status das propriedades."
    });
  }
});


// ================= PROPRIEDADES BLOQUEADAS DO CLIENTE =================
app.get("/propriedades/bloqueadas", async (req, res) => {
  try {
    const { cliente_id, limit = 1000 } = req.query;

    if (!cliente_id) {
      return res.status(400).json({
        erro: "cliente_id é obrigatório na query"
      });
    }

    const propriedades = await db
      .collection("propriedades")
      .find({
        cliente_id,
        status: "bloqueado" // ✅ FILTRO PRINCIPAL
      })
      .project({
        _id: 1,
        razao: 1,
        logradouro: 1,
        numero: 1,
        complemento: 1,
        bairro: 1,
        municipio: 1,
        uf: 1
      })
      .limit(parseInt(limit))
      .sort({ razao: 1 })
      .toArray();

    const dropdown = propriedades.map(p => {
      const endereco = [
        p.logradouro,
        p.numero,
        p.complemento,
        p.bairro,
        `${p.municipio}/${p.uf}`
      ]
        .filter(Boolean)
        .join(" - ");

      return {
        label: `${p.razao} - ${endereco}`,
        value: String(p._id)
      };
    });

    res.json(dropdown);

  } catch (err) {
    console.error("Erro ao buscar propriedades bloqueadas:", err);
    res.status(500).json({
      erro: "Erro ao buscar propriedades bloqueadas"
    });
  }
});


// DELETE - Remover propriedades COM verificação de cliente
app.delete("/propriedades/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { cliente_id } = req.query;
    
    if (!cliente_id) {
      return res.status(400).json({ erro: "cliente_id é obrigatório na query" });
    }
    
    const resultado = await db.collection("propriedades").deleteOne({ 
      _id: id,
      cliente_id: cliente_id
    });
    
    if (resultado.deletedCount === 0) {
      return res.status(404).json({ erro: "Propriedade não encontrada" });
    }
    
    res.json({ 
      sucesso: true, 
      mensagem: "Propriedades excluída com sucesso"
    });
    
  } catch (err) {
    res.status(500).json({ erro: "Erro ao remover propriedades" });
  }
});

//========================= DOLAR==========

// GET - Retornar a cotação mais recente
app.get("/cotacoes/ultima", async (req, res) => {
  try {
    const ultima = await db
      .collection("cotacoes")
      .find({})
      .sort({ data: -1 }) // ordena pela mais recente
      .limit(1)
      .toArray();

    if (!ultima.length) {
      return res.status(404).json({ erro: "Nenhuma cotação encontrada" });
    }

    res.json(ultima[0]);

  } catch (err) {
    console.error("Erro ao buscar última cotação:", err);
    res.status(500).json({ erro: "Erro ao buscar última cotação" });
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
      usuario: usuario._id,
      documento: usuario.documento,		
      nome: usuario.nome,
      nivel: usuario.nivel,
      cliente_id: usuario.cliente_id,
      proprietario: usuario.proprietario,
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

