// convertSpecificPasswords.js
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config();

const MONGO = process.env.MONGO_URI;
if (!MONGO) {
  console.error("ERRO: defina MONGO_URI no .env antes de rodar.");
  process.exit(1);
}

// Senhas que queremos converter (exatas)
const TARGETS = ["123456", "senhaboa"];

async function run() {
  const client = new MongoClient(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db("tinbr"); // ajuste se o DB tiver outro nome
  const users = db.collection("users");

  let total = 0;
  for (const plain of TARGETS) {
    // Busca documentos com senha exatamente igual ao plain
    const cursor = users.find({ senha: plain });

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      const hash = await bcrypt.hash(String(plain), 10); // salt rounds = 10

      const res = await users.updateOne(
        { _id: user._id },
        { $set: { senha: hash } }
      );

      if (res.modifiedCount === 1) {
        console.log(`✅ Usuário ${String(user._id)} atualizado (senha "${plain}")`);
        total++;
      } else {
        console.warn(`⚠️ Usuário ${String(user._id)} NÃO atualizado`);
      }
    }
  }

  console.log(`\nConcluído. Total de senhas convertidas: ${total}`);
  await client.close();
  process.exit(0);
}

run().catch(err => {
  console.error("Erro no script:", err);
  process.exit(1);
});
