// cron-jobs.js
import cron from "node-cron";
import fetch from "node-fetch";
import { obterUltimaCotacaoBCB } from "./dolar-service.js";

export function iniciarCronJobs(db) {
  console.log("⏳ Iniciando cron jobs...");

  // Rodar todos os dias às 09:00 da manhã
  cron.schedule("30 8 * * *", async () => {
    console.log("🔔 Executando tarefa diária: atualizar cotação do dólar");

    const cotacao = await obterUltimaCotacaoBCB();
    if (!cotacao) {
      console.error("❌ Não foi possível obter cotação diária");
      return;
    }

    const registro = { 
  data: cotacao.data,
  valor: Number(Number(cotacao.valor).toFixed(2)),
  criadoEm: new Date()
};

    try {
      const resultado = await db.collection("cotacoes").insertOne(registro);
      console.log("💾 Cotação salva automaticamente:", resultado.insertedId);
    } catch (e) {
      console.error("❌ Erro ao salvar no Mongo:", e);
    }
  });
}

