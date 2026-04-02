export async function atualizarStatusVenda(db, client, paymentId, status) {
  const session = client.startSession();

  try {
    await session.withTransaction(async () => {

      const venda = await db.collection("vendas_tokens").findOne(
        { paymentId },
        { session }
      );

      if (!venda) {
        throw new Error("Venda não encontrada");
      }

      // 🔒 idempotência forte
      if (["RECEIVED", "CONFIRMED", "CANCELLED", "EXPIRED"].includes(venda.status)) {
        return;
      }

      const { propriedade_id, quantidade } = venda;

      const updateVenda = await db.collection("vendas_tokens").updateOne(
        {
          paymentId,
          status: "pending"
        },
        {
          $set: {
            status,
            updatedAt: new Date()
          }
        },
        { session }
      );

      if (updateVenda.modifiedCount === 0) {
        return;
      }

      // 🔥 ATUALIZA PROPRIEDADE

      if (status === "RECEIVED" || status === "CONFIRMED") {
        await db.collection("propriedades").updateOne(
          {
            _id: propriedade_id,
            tokens_reservados: { $gte: quantidade }
          },
          {
            $inc: {
              vendidos: quantidade,
              tokens_reservados: -quantidade
            }
          },
          { session }
        );
      }

      if (status === "CANCELLED" || status === "EXPIRED") {
        await db.collection("propriedades").updateOne(
          {
            _id: propriedade_id,
            tokens_reservados: { $gte: quantidade }
          },
          {
            $inc: {
              tokens_reservados: -quantidade
            }
          },
          { session }
        );
      }

    });

  } finally {
    await session.endSession();
  }
}