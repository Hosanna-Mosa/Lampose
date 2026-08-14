import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

/* mongoose's numeric readyState, named. The site reports which link is down
   rather than a single "something failed", so the number has to travel. */
const DB_STATE = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// @route   GET /api/health
// @desc    Health check endpoint — reports the process and the database apart
// @access  Public
router.get('/', (req, res) => {
  const dbState = DB_STATE[mongoose.connection.readyState] || 'unknown';
  const dbUp = mongoose.connection.readyState === 1;

  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    message: dbUp
      ? 'Backend server is running and connected to the database'
      : 'Backend server is running but the database is not connected',
    database: { state: dbState, connected: dbUp, name: mongoose.connection.name || null },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
