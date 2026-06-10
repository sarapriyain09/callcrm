import { useEffect, useMemo, useState } from 'react';

const plainFields = [
  { key: 'DATABASE_URL', label: 'Database URL' },
  { key: 'APP_BASE_URL', label: 'App Base URL' },
  {
    key: 'TWILIO_PHONE_NUMBER',
    label: 'Twilio Caller Number (must be purchased/verified in Twilio)'
  },
  { key: 'ROUTE_SALES_NUMBER', label: 'Sales Route Number' },
  { key: 'ROUTE_SUPPORT_NUMBER', label: 'Support Route Number' },
  { key: 'ROUTE_ACCOUNTS_NUMBER', label: 'Accounts Route Number' },
  { key: 'DEFAULT_ROUTE_DIGIT', label: 'Default Route Digit (1/2/3)' },
  { key: 'AFTER_HOURS_ROUTE_NUMBER', label: 'After-hours Route Number' },
  { key: 'BUSINESS_HOURS_START', label: 'Business Start Hour (0-23)' },
  { key: 'BUSINESS_HOURS_END', label: 'Business End Hour (0-23)' },
  { key: 'BUSINESS_DAYS', label: 'Business Days (0-6 comma list)' },
  { key: 'BUSINESS_HOLIDAYS', label: 'Holiday Dates (YYYY-MM-DD comma list)' },
  { key: 'LUNCH_BREAK_START', label: 'Lunch Start Hour (0-23, optional)' },
  { key: 'LUNCH_BREAK_END', label: 'Lunch End Hour (0-23, optional)' },
  { key: 'ENABLE_FAILOVER', label: 'Enable Failover (true/false)' },
  { key: 'MISSED_CALL_ALERT_EMAIL', label: 'Missed Call Alert Email' },
  { key: 'CRM_SYNC_ENABLED', label: 'CRM Sync Enabled (true/false)' },
  { key: 'CRM_WEBHOOK_URL', label: 'CRM Webhook URL (your CRM ingest endpoint)' },
  { key: 'OPENAI_MODEL', label: 'OpenAI Model' }
];

const secretFields = [
  { key: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID (AC...)' },
  { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token (optional if using API key)' },
  { key: 'TWILIO_API_KEY_SID', label: 'Twilio API Key SID (SK...)' },
  { key: 'TWILIO_API_KEY_SECRET', label: 'Twilio API Key Secret' },
  { key: 'CRM_WEBHOOK_TOKEN', label: 'CRM Webhook Bearer Token' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key' }
];

export default function SettingsPanel({ role = 'admin' }) {
  const [form, setForm] = useState({});
  const [initialForm, setInitialForm] = useState({});
  const [secretsInfo, setSecretsInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setMessage('');

      const res = await fetch('/api/settings', {
        headers: { 'x-callcrm-role': role }
      });
      const json = await res.json();

      const values = { ...(json.data?.values || {}) };
      setForm(values);
      setInitialForm(values);
      setSecretsInfo({ ...(json.data?.secrets || {}) });
      setLoading(false);
    }

    loadSettings().catch((err) => {
      console.error('Failed to load settings', err);
      setLoading(false);
      setMessage('Failed to load settings.');
    });
  }, [role]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const hasChanges = useMemo(() => {
    const plainChanged = plainFields.some(
      ({ key }) => String(form[key] || '') !== String(initialForm[key] || '')
    );

    const secretChanged = secretFields.some(({ key }) => String(form[key] || '').trim().length > 0);

    return plainChanged || secretChanged;
  }, [form, initialForm]);

  function startEditing() {
    setIsEditing(true);
    setMessage('');
  }

  function cancelEditing() {
    setForm({ ...initialForm });
    setIsEditing(false);
    setMessage('Changes discarded.');
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const payload = {
        ...Object.fromEntries(plainFields.map(({ key }) => [key, form[key] || ''])),
        ...Object.fromEntries(secretFields.map(({ key }) => [key, form[key] || '']))
      };

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': role
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Unable to save settings');
      }

      setMessage('Settings saved. Restart API to apply all changes.');

      const refreshed = await fetch('/api/settings', {
        headers: { 'x-callcrm-role': role }
      });
      const refreshedJson = await refreshed.json();
      const refreshedValues = { ...(refreshedJson.data?.values || {}) };
      setForm(refreshedValues);
      setInitialForm(refreshedValues);
      setSecretsInfo({ ...(refreshedJson.data?.secrets || {}) });
      setIsEditing(false);

      for (const { key } of secretFields) {
        setForm((prev) => ({ ...prev, [key]: '' }));
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Settings</h2>
        <p>Loading settings...</p>
      </section>
    );
  }

  if (role !== 'admin') {
    return (
      <section className="panel">
        <h2>Settings</h2>
        <p className="error-text">Only admin role can view and update settings.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p className="subtitle compact">
        Update environment-backed configuration from the app. Secret fields are never returned to the browser.
      </p>
      <p className="subtitle compact">
        Twilio auth modes supported: Account SID + Auth Token, or Account SID + API Key SID + API Key Secret.
      </p>

      {!isEditing ? (
        <div className="actions-row">
          <button type="button" onClick={startEditing}>Edit Settings</button>
        </div>
      ) : null}

      <form className="settings-form" onSubmit={handleSave}>
        <div className="settings-grid">
          {plainFields.map((field) => (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                type="text"
                value={form[field.key] || ''}
                disabled={!isEditing}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <h3>Secrets</h3>
        <p className="subtitle compact">
          Existing secret values are masked for security. Use these fields only to replace them.
        </p>
        <div className="settings-grid">
          {secretFields.map((field) => (
            <label key={field.key} className="field">
              <span>
                {field.label}
                {secretsInfo[field.key]?.isSet ? ' (configured)' : ' (not set)'}
              </span>
              <input
                type="password"
                placeholder={secretsInfo[field.key]?.isSet ? 'Configured (enter to replace)' : 'Enter value'}
                value={form[field.key] || ''}
                disabled={!isEditing}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="actions-row">
          <button type="submit" disabled={!isEditing || !hasChanges || saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {isEditing ? (
            <button type="button" className="button-secondary" onClick={cancelEditing}>
              Cancel
            </button>
          ) : null}
          {message ? <p className="message-text">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}
