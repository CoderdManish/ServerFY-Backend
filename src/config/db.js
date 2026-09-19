import mongoose from "mongoose";
import { env } from "./env.js";

let connection;

export async function connectDb() {
  if (connection) return connection;
  mongoose.set("strictQuery", true);
  connection = await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDb,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  console.log("[db] connected to MongoDB Atlas");
  return connection;
}
