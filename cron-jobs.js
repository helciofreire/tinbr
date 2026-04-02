import cron from "node-cron";
import fetch from "node-fetch";
import { obterUltimaCotacaoBCB } from "./dolar-service.js";
import { atualizarStatusVenda } from "./services/vendas-service.js";

export function iniciarCronJobs(db, client) {
  console.log("⏳ Iniciando cron jobs...");

  // ========================================
  // 💵 COTAÇÃO DO DÓLAR (1x por dia)
  // ========================================
  cron.schedule("30 8 * * *", async () => {
    const lock = await adquirirLock(db, "cotacao");
    if (!lock) return;

    console.log("💵 Atualizando cotação...");

    try {
      const cotacao = await obterUltimaCotacaoBCB();
      if (!cotacao) return;

      await db.collection("cotacoes").updateOne(
        { data: cotacao.data },
        {
          $set: {
            valor: Number(Number(cotacao.valor).toFixed(2)),
            atualizadoEm: new Date()
          }
        },
        { upsert: true }
      );

    } catch (e) {
      console.error("❌ Erro cotação:", e);
    }
  });

  // ========================================
  // 🔥 EXPIRAÇÃO DE RESERVAS (2 min)
  // ========================================
  cron.schedule("*/2 * * * *", async () => {
  const lock = await adquirirLock(db, "expiracao");
  if (!lock) return;

  try {
    const agora = new Date();

    const vendas = await db.collection("vendas_tokens")
      .find({
        status: "pending",
        expiresAt: { $lte: agora }
      })
      .limit(30)
      .toArray();

    if (!vendas.length) return;

    console.log(`⏰ Expirando ${vendas.length} vendas`);

    for (const venda of vendas) {
      try {
        await atualizarStatusVenda(
          db,
          client,
          venda.paymentId,
          "EXPIRED"
        );

      } catch (err) {
        console.error("❌ Erro expiração:", venda.paymentId, err);
      }
    }

  } catch (err) {
    console.error("❌ Erro geral expiração:", err);
  }
});

  });

  // ========================================
  // 🔄 RECONCILIAÇÃO ASAAS (5 min)
  // ========================================
  cron.schedule("*/5 * * * *", async () => {
  const lock = await adquirirLock(db, "reconciliacao");
  if (!lock) return;

  try {
    const agora = new Date();

    const vendas = await db.collection("vendas_tokens")
      .find({
        status: "pending",
        paymentId: { $exists: true },
        createdAt: { $gte: new Date(agora.getTime() - 30 * 60000) }
      })
      .limit(20)
      .toArray();

    if (!vendas.length) return;

    console.log(`🔄 Reconciliando ${vendas.length} vendas`);

    for (const venda of vendas) {
      try {
        const response = await fetch(
          `https://api.asaas.com/v3/payments/${venda.paymentId}`,
          {
            headers: {
              "Content-Type": "application/json",
              "access_token": process.env.ASAAS_API_KEY
            }
          }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const status = data.status;

        // 🔥 EVITA PROCESSAMENTO DESNECESSÁRIO
        if (
          (status === "RECEIVED" || status === "CONFIRMED") &&
          venda.status !== "RECEIVED" &&
          venda.status !== "CONFIRMED"
        ) {
          await atualizarStatusVenda(
            db,
            client,
            venda.paymentId,
            status
          );
          continue;
        }

        if (
          (status === "CANCELLED" || status === "EXPIRED") &&
          venda.status !== status
        ) {
          await atualizarStatusVenda(
            db,
            client,
            venda.paymentId,
            status
          );
          continue;
        }

      } catch (err) {
        console.error("❌ Erro reconciliação:", venda.paymentId, err);
      }
    }

  } catch (err) {
    console.error("❌ Erro geral reconciliação:", err);
  }
});

// ========================================
// 🔒 LOCK PROFISSIONAL (CORRETO)
// ========================================
async function adquirirLock(db, nome) {
  const agora = new Date();
  const expiracao = new Date(agora.getTime() + 4 * 60 * 1000);
  const instanceId = process.pid;

  const resultado = await db.collection("cron_locks").findOneAndUpdate(
    {
      nome,
      $or: [
        { lockedUntil: { $lt: agora } },
        { lockedUntil: { $exists: false } }
      ]
    },
    {
      $set: {
        nome,
        lockedAt: agora,
        lockedUntil: expiracao,
        instanceId
      }
    },
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  if (!resultado.value || resultado.value.instanceId !== instanceId) {
    return false;
  }

  return true;
}