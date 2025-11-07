import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  login: { type: String, required: true, unique: true },
  senha: { type: String, required: true },
  nivel: { type: Number, default: 1 },
  cliente_id: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model("users", UserSchema);
