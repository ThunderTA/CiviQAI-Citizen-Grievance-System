import mongoose from 'mongoose';
import { dropLegacyIndexes } from '../migrations/dropLegacyIndexes.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Indexes from the retired Clerk schema outlive the code that declared
    // them and silently break new registrations. Reconcile before serving.
    await dropLegacyIndexes(mongoose.connection);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};
