import { useMemo, useState } from 'react';
import { apiUrl } from '../api.js';

export default function DialerPanel({ role = 'agent', username = '', readOnly = false }) {
  const [toNumber, setToNumber] = useState('');
  const [introMessage, setIntroMessage] = useState('Hello. This is a call from Call CRM.');
  const [label, setLabel] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const canSubmit = useMemo(
    () => toNumber.trim().length >= 8 && !isCalling && !readOnly,
    [toNumber, isCalling, readOnly]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setIsCalling(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch(apiUrl('/calls/outbound'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': role,
          'x-callcrm-username': username
        },
        body: JSON.stringify({
          toNumber: toNumber.trim(),
          introMessage: introMessage.trim(),
          label: label.trim()
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Unable to place call');
      }

      setResult(json.data);
    } catch (err) {
      setError(err.message || 'Unable to place call');
    } finally {
      setIsCalling(false);
    }
  }

  return (
    <section className="panel">
      <h2>Outbound Dialer</h2>
      <p className="subtitle compact">
        Trigger a Twilio outbound call from your configured business number.
      </p>
      {readOnly ? (
        <p className="message-text">Demo user is read-only. Calling is disabled.</p>
      ) : null}

      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="settings-grid">
          <label className="field">
            <span>Customer Number (E.164)</span>
            <input
              type="text"
              placeholder="+447700900123"
              value={toNumber}
              disabled={readOnly}
              onChange={(e) => setToNumber(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Reference Label (optional)</span>
            <input
              type="text"
              placeholder="Quote #1042"
              value={label}
              disabled={readOnly}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Intro Message</span>
          <input
            type="text"
            value={introMessage}
            disabled={readOnly}
            onChange={(e) => setIntroMessage(e.target.value)}
          />
        </label>

        <div className="actions-row">
          <button type="submit" disabled={!canSubmit}>
            {isCalling ? 'Calling...' : 'Start Call'}
          </button>
        </div>
      </form>

      {result ? (
        <p className="message-text">Call queued. SID: {result.twilioCallSid}</p>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}
