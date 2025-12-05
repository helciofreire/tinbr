// dolar-service.js
import fetch from "node-fetch";

export async function obterUltimaCotacaoBCB() {
  try {
    const hoje = new Date();
    const dataFim = hoje;
    const dataInicio = new Date(hoje);
    dataInicio.setDate(hoje.getDate() - 5);

    const formatarDataBCB = (d) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados?formato=json&dataInicial=${formatarDataBCB(dataInicio)}&dataFinal=${formatarDataBCB(dataFim)}`;

    console.log("📡 URL chamada na API BCB:", url);

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("❌ Erro ao consultar BCB:", await resp.text());
      return null;
    }

    const dados = await resp.json();
    if (!dados?.length) return null;

    const ultima = dados[dados.length - 1];

    // Converte DD/MM/YYYY → YYYY-MM-DD
    const [dia, mes, ano] = ultima.data.split("/");
    const dataISO = `${ano}-${mes}-${dia}`;

    return {
      data: dataISO,
      valor: Number(ultima.valor)
    };

  } catch (err) {
    console.error("❌ Erro obterUltimaCotacaoBCB:", err);
    return null;
  }
}
