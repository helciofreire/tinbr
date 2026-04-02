// cron-jobs.js
import cron from "node-cron";
import fetch from "node-fetch";
import { obterUltimaCotacaoBCB } from "./dolar-service.js";

export function iniciarCronJobs(db, client) {
  console.log("⏳ Iniciando cron jobs...");

  // ========================================
  // 💵 COTAÇÃO DO DÓLAR (1x por dia)
  // ========================================
  cron.schedule("30 8 * * *", async () => {
    const lock = await adquirirLock(db, "cotacao");
    if (!lock) {
      console.log("⏭️ Lock não adquirido - cotação");
      return;
    }

    console.log("🔒 Rodando cotação...");

    const cotacao = await obterUltimaCotacaoBCB();
    if (!cotacao) return;

    const registro = { 
      data: cotacao.data,
      valor: Number(Number(cotacao.valor).toFixed(2)),
      criadoEm: new Date()
    };

    try {
      await db.collection("cotacoes").insertOne(registro);
      console.log("💾 Cotação salva");
    } catch (e) {
      console.error("❌ Erro cotação:", e);
    }
  });

  // ========================================
  // 🔥 EXPIRAÇÃO DE RESERVAS (1 min)
  // ========================================
  cron.schedule("*/1 * * * *", async () => {
    const lock = await adquirirLock(db, "expiracao");
    if (!lock) {
      console.log("⏭️ Lock não adquirido - expiração");
      return;
    }

    console.log("⏰ Rodando expiração...");

    try {
      const agora = new Date();

      const vendas = await db.collection("vendas_tokens")
        .find({
          status: "pending",
          expiresAt: { $lte: agora }
        })
        .limit(50)
        .toArray();

      for (const venda of vendas) {
        const session = client.startSession();

        try {
          await session.withTransaction(async () => {

            const update = await db.collection("vendas_tokens").updateOne(
              { _id: venda._id, status: "pending" },
              {
                $set: {
                  status: "EXPIRED",
                  updatedAt: new Date()
                }
              },
              { session }
            );

            if (update.modifiedCount === 0) return;

            await db.collection("propriedades").updateOne(
              {
                _id: venda.propriedade_id,
                tokens_reservados: { $gte: venda.quantidade }
              },
              {
                $inc: {
                  tokens_reservados: -venda.quantidade
                }
              },
              { session }
            );

          });

          console.log("✅ Expirada:", venda.paymentId);

        } catch (err) {
          console.error("❌ Erro expiração:", err);
        } finally {
          await session.endSession();
        }
      }

    } catch (err) {
      console.error("❌ Erro geral expiração:", err);
    }
  });

  // ========================================
  // 🔄 RECONCILIAÇÃO ASAAS (5 min)
  // ========================================
  cron.schedule("*/5 * * * *", async () => {
    const lock = await adquirirLock(db, "reconciliacao");
    if (!lock) {
      console.log("⏭️ Lock não adquirido - reconciliação");
      return;
    }

    console.log("🔄 Rodando reconciliação...");

    try {
      const agora = new Date();

      const vendas = await db.collection("vendas_tokens")
        .find({
          status: "pending",
          paymentId: { $exists: true },
          createdAt: { $gte: new Date(agora.getTime() - 30 * 60000) }
        })
        .limit(30)
        .toArray();

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

          const data = await response.json();
          if (!response.ok) continue;

          const status = data.status;

          if (
            status === "RECEIVED" ||
            status === "CONFIRMED" ||
            status === "CANCELLED"
          ) {
            console.log("🔄 Corrigindo:", venda.paymentId, status);

            await fetch(`${process.env.BASE_URL}/vendas-tokens/status`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId: venda.paymentId,
                status
              })
            });
          }

        } catch (err) {
          console.error("❌ Erro reconciliação:", venda.paymentId, err);
        }
      }

    } catch (err) {
      console.error("❌ Erro geral reconciliação:", err);
    }
  });
}

// ========================================
// 🔒 LOCK DISTRIBUÍDO (CORRIGIDO)
// ========================================
async function adquirirLock(db, nome) {
  const agora = new Date();
  const expiracao = new Date(agora.getTime() + 4 * 60 * 1000);

  const res = await db.collection("cron_locks").findOneAndUpdate(
    {
      nome,
      $or: [
        { lockedUntil: { $exists: false } },
        { lockedUntil: { $lt: agora } }
      ]
    },
    {
      $set: {
        nome,
        lockedAt: agora,
        lockedUntil: expiracao
      }
    },
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  // 🔥 garante que só 1 instância entra
  if (!res.value) return null;

  const lockedAt = new Date(res.value.lockedAt).getTime();
  const now = agora.getTime();

  if (lockedAt !== now) return null;

  return res.value;
}