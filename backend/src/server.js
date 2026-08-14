import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import healthRoutes from './routes/healthRoutes.js';
import listingRoutes from './routes/listingRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

// Load environment variables from .env file
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// CORS configuration for allowed origins
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'https://lampose.com',
  'https://www.lampose.com',
  'https://api.lampose.com',
];

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim().replace(/\/+$/, ''))
  : [];

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const DEPLOYMENT_ORIGIN = /^https:\/\/([a-zA-Z0-9-]+\.)*(lampose\.com|vercel\.app|netlify\.app|onrender\.com)$/;
const isDev = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) {
      return callback(null, true);
    }
    const cleanOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes('*') || allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }
    if (LOOPBACK_ORIGIN.test(cleanOrigin) || DEPLOYMENT_ORIGIN.test(cleanOrigin)) {
      return callback(null, true);
    }
    if (isDev) {
      return callback(null, true);
    }
    // Return null, false to reject CORS cleanly without throwing a server 500 error
    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes (Mount on both /api/path and /path to support all frontend VITE_API_BASE_URL configurations)
app.get(['/', '/api'], (req, res) => {
  res.json({ message: 'Welcome to the Lampose API' });
});

app.use(['/api/health', '/health'], healthRoutes);
app.use(['/api/listings', '/listings'], listingRoutes);

// Error Handling Middleware
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
  );
});
