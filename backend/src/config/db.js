import mongoose from 'mongoose';

/* The API used to exit the process when the first connection attempt failed.
   That turns "the database is down" into "nothing is listening on port 5000",
   and the site — which has no local copy of the data — can then only report
   the wrong fault. The server now stays up and answers 503 with the real
   reason until the connection comes good.

   `bufferCommands: false` matters for the same reason: without it a query
   issued while disconnected waits in a buffer and eventually fails as a
   timeout, long after the route could have said what was actually wrong. */
const RETRY_MS = 5000;

const connect = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });
};

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set — check backend/.env. '
      + 'The API will run and report the database as disconnected.');
    return;
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected — the API will report 503 until it returns.');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected.');
  });

  const attempt = async () => {
    try {
      await connect();
      console.log(`MongoDB Connected: ${mongoose.connection.host}`);
    } catch (error) {
      console.error(`Error connecting to MongoDB: ${error.message}`);
      console.error(`Retrying in ${RETRY_MS / 1000}s. The API stays up and will `
        + 'answer 503 (DB_DISCONNECTED) meanwhile.');
      setTimeout(attempt, RETRY_MS).unref?.();
    }
  };

  await attempt();
};

export default connectDB;
