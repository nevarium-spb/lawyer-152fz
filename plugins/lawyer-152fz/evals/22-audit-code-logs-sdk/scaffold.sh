#!/usr/bin/env bash
# Учебный проект для кейса: создаётся в рабочей папке прогона.
set -euo pipefail
mkdir -p "$(dirname 'package.json')"
cat > 'package.json' <<'FILE'
{ "name": "landing-api", "version": "1.0.0", "dependencies": { "express": "^5.0.0", "firebase": "^12.0.0" } }
FILE
mkdir -p "$(dirname 'src/server.js')"
cat > 'src/server.js' <<'FILE'
import express from 'express';
import { getAnalytics, logEvent } from 'firebase/analytics';

const app = express();
app.post('/api/lead', express.json(), (req, res) => {
  console.log('new lead', req.body);
  logEvent(getAnalytics(), 'lead', { email: req.body.email });
  res.sendStatus(201);
});
app.listen(3000);
FILE
