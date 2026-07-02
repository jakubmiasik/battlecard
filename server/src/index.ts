import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/connection.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import technologiesRoutes from './routes/technologies.js';
import comparisonsRoutes from './routes/comparisons.js';
import criteriaRoutes from './routes/criteria.js';
import referenceAnswersRoutes from './routes/referenceAnswers.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/technologies', authMiddleware, technologiesRoutes);
app.use('/api/comparisons', authMiddleware, comparisonsRoutes);
app.use('/api/criteria', authMiddleware, criteriaRoutes);
app.use('/api/reference-answers', authMiddleware, referenceAnswersRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  try {
    await initDb();
    console.log('Database connected');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
