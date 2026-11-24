const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/payroll_db';
  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: `);
    throw error;
  }
};

module.exports = { mongoose, connectDB };
