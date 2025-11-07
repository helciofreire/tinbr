// ✅ LOGIN DE USUÁRIO COM SENHA CRIPTOGRAFADA
app.post("/users/login", async (req, res) => {
  try {
    const { login, senha, tipo } = req.body;

    if (!login || !senha) {
      return res.json({ ok: false, mensagem: "Login e senha são obrigatórios." });
    }

    const campo = tipo === "email" ? "email" : "documento";

    const user = await db.collection("users").findOne({
      [campo]: String(login).trim()
    });

    if (!user) {
      return res.json({
        ok: false,
        mensagem: "Usuário ou senha incorretos."
      });
    }

    // ✅ Verifica senha criptografada
    const senhaCorreta = await bcrypt.compare(String(senha).trim(), user.senha);

    if (!senhaCorreta) {
      return res.json({
        ok: false,
        mensagem: "Usuário ou senha incorretos."
      });
    }

    // ✅ Login aprovado → retorna dados
    return res.json({
      ok: true,
      nome: user.nome ?? "",
      nivel: user.nivel ?? "",
      cliente_id: user.cliente_id ?? "", // <-- mantém nome consistente
      mensagem: "Login realizado com sucesso."
    });

  } catch (erro) {
    console.error("❌ Erro no login:", erro);
    res.json({ ok: false, mensagem: "Erro no servidor." });
  }
});
