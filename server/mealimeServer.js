import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

import { importMealimeRecipe } from '../mealime/importer.js';

export function buildMealimeServer({ enableCors = true } = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  if (enableCors) {
    app.use(cors(typeof enableCors === 'object' ? enableCors : undefined));
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/import/mealime', async (req, res) => {
    const { target, url, id, augmentFromSteps } = req.body || {};
    const candidate = [target, url, id]
      .map((value) => (typeof value === 'number' || typeof value === 'string' ? String(value).trim() : ''))
      .find((value) => value.length > 0);

    if (!candidate) {
      return res.status(400).json({ error: 'Request body must include a Mealime URL or ID in "target", "url", or "id".' });
    }

    try {
      const recipe = await importMealimeRecipe(candidate, { augmentFromSteps: augmentFromSteps !== false });
      res.json(recipe);
    } catch (error) {
      const status = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 502;
      res.status(status).json({
        error: error?.message || 'Failed to import Mealime recipe.',
        warnings: error?.warnings || [],
      });
    }
  });

  return app;
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  const app = buildMealimeServer();
  app.listen(port, () => {
    console.log(`Mealime importer server listening on port ${port}`);
  });
}
