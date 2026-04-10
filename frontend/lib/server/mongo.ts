import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? '';

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in frontend/.env.local');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var __credzkMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.__credzkMongooseCache ?? { conn: null, promise: null };

if (!global.__credzkMongooseCache) {
  global.__credzkMongooseCache = cache;
}

export async function connectMongo() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      dbName: process.env.MONGODB_DB ?? 'credzk',
      autoIndex: true,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
