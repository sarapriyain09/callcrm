import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import healthRoutes from './routes/health.js';
import twilioRoutes from './routes/twilio.js';
import contactsRoutes from './routes/contacts.js';
import callsRoutes from './routes/calls.js';
import settingsRoutes from './routes/settings.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import agentActionsRoutes from './routes/agentActions.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/health', healthRoutes);
app.use('/twilio', twilioRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/agent-actions', agentActionsRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  const status = Number(err?.status || err?.statusCode || 500);

  if (err?.code === 20003 || status === 401) {
    return res.status(401).json({
      error: 'Twilio authentication failed',
      message:
        'Invalid Twilio credentials. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file.'
    });
  }

  return res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? 'Internal server error' : 'Request failed',
    message: err?.message || 'Unknown error'
  });
});

app.listen(config.port, () => {
  console.log(`[callcrm-api] listening on http://localhost:${config.port}`);
});
