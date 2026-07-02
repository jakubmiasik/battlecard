import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db/connection.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import technologiesRoutes from './routes/technologies.js';
import comparisonsRoutes from './routes/comparisons.js';
import criteriaRoutes from './routes/criteria.js';
import questionsRoutes from './routes/questions.js';
import referenceAnswersRoutes from './routes/referenceAnswers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.WEBSITES_PORT || 8080;

app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/technologies', authMiddleware, technologiesRoutes);
app.use('/api/comparisons', authMiddleware, comparisonsRoutes);
app.use('/api/criteria', authMiddleware, criteriaRoutes);
app.use('/api/questions', authMiddleware, questionsRoutes);
app.use('/api/reference-answers', authMiddleware, referenceAnswersRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const clientBuildPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
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
