import { useEffect, useMemo, useState } from 'react';
import StatCard from './components/StatCard.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import DialerPanel from './components/DialerPanel.jsx';
import { apiUrl } from './api.js';

const SESSION_KEY = 'callcrm.session.user';

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function getPlayableRecordingUrl(recordingUrl) {
  const value = String(recordingUrl || '').trim();
  if (!value) return '';

  if (/\.(mp3|wav)(\?.*)?$/i.test(value)) {
    return value;
  }

  return `${value}.mp3`;
}

function getCallbackNumber(call) {
  if (!call) return '';

  if (call.direction === 'OUTBOUND') {
    return String(call.toNumber || '').trim();
  }

  return String(call.fromNumber || '').trim();
}

function getDisplayNumber(call) {
  if (!call) return '';

  if (call.direction === 'OUTBOUND') {
    return String(call.toNumber || '').trim();
  }

  return String(call.fromNumber || '').trim();
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [calls, setCalls] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [agentActions, setAgentActions] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [callingRowId, setCallingRowId] = useState('');
  const [deletingRowId, setDeletingRowId] = useState('');
  const [smsRowId, setSmsRowId] = useState('');
  const [emailRowId, setEmailRowId] = useState('');
  const [assistantLoadingRowId, setAssistantLoadingRowId] = useState('');
  const [assistantByCallId, setAssistantByCallId] = useState({});
  const [selectedAiCallId, setSelectedAiCallId] = useState('');
  const [aiObjective, setAiObjective] = useState('Recommend what to do next and what information to collect.');
  const [aiNotes, setAiNotes] = useState('');
  const [aiPanelLoading, setAiPanelLoading] = useState(false);
  const [aiPanelError, setAiPanelError] = useState('');
  const [callActionMessage, setCallActionMessage] = useState('');
  const [callListView, setCallListView] = useState('all');

  async function reloadDashboardData() {
    if (!user) return;

    const [callsRes, contactsRes, actionsRes] = await Promise.all([
      fetch(apiUrl('/calls')),
      fetch(apiUrl('/contacts')),
      fetch(apiUrl('/agent-actions'), {
        headers: {
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        }
      })
    ]);

    const callsJson = await callsRes.json();
    const contactsJson = await contactsRes.json();
    const actionsJson = actionsRes.ok ? await actionsRes.json() : { data: [] };

    setCalls(callsJson.data || []);
    setContacts(contactsJson.data || []);
    setAgentActions(actionsJson.data || []);
  }

  useEffect(() => {
    if (!user) return;

    reloadDashboardData().catch((err) => {
      console.error('Failed to load dashboard data', err);
    });
  }, [user]);

  useEffect(() => {
    if (!calls.length) {
      setSelectedAiCallId('');
      return;
    }

    if (!selectedAiCallId || !calls.some((call) => call.id === selectedAiCallId)) {
      setSelectedAiCallId(calls[0].id);
    }
  }, [calls, selectedAiCallId]);

  async function handleLogin(event) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Login failed');
      }

      const nextUser = json.data;
      setUser(nextUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextUser));
      setIdentifier('');
      setPassword('');
      setLoginError('');
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    if (user?.id) {
      try {
        await fetch(apiUrl('/auth/logout'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id })
        });
      } catch (err) {
        console.warn('Failed to update availability during logout', err);
      }
    }

    setUser(null);
    setCalls([]);
    setContacts([]);
    setAgentActions([]);
    setActiveTab('dashboard');
    localStorage.removeItem(SESSION_KEY);
  }

  async function handleCallFromList(call) {
    const toNumber = getCallbackNumber(call);
    if (!toNumber) {
      setCallActionMessage('No callback number is available for this call.');
      return;
    }

    setCallingRowId(call.id);
    setCallActionMessage('');

    try {
      const res = await fetch(apiUrl('/calls/outbound'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          toNumber,
          introMessage: 'Hello. This is a callback from Call CRM.',
          label: `Callback ${call.id.slice(0, 8)}`
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Unable to place callback call');
      }

      setCallActionMessage(`Calling ${toNumber}...`);
      await reloadDashboardData();
    } catch (err) {
      setCallActionMessage(err.message || 'Unable to place callback call');
    } finally {
      setCallingRowId('');
    }
  }

  async function handleSendSmsFromList(call) {
    const toNumber = getCallbackNumber(call);
    if (!toNumber) {
      setCallActionMessage('No phone number is available for SMS follow-up.');
      return;
    }

    setSmsRowId(call.id);
    setCallActionMessage('');

    try {
      const draftRes = await fetch(apiUrl('/agent-actions/sms-draft'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          callId: call.id,
          toNumber
        })
      });

      const draftJson = await draftRes.json();

      if (!draftRes.ok) {
        throw new Error(draftJson?.message || draftJson?.error || 'Unable to build SMS draft');
      }

      const message = window.prompt(
        'SMS draft (edit before send)',
        String(draftJson?.data?.body || '').trim()
      );

      if (message === null) {
        setCallActionMessage('SMS send cancelled.');
        return;
      }

      const res = await fetch(apiUrl('/agent-actions/sms-send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          callId: call.id,
          toNumber,
          body: message.trim()
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Unable to send SMS follow-up');
      }

      const messageSid = json?.data?.payload?.execution?.sid;
      setCallActionMessage(messageSid ? `SMS sent. SID: ${messageSid}` : 'SMS follow-up sent.');
      await reloadDashboardData();
    } catch (err) {
      setCallActionMessage(err.message || 'Unable to send SMS follow-up');
    } finally {
      setSmsRowId('');
    }
  }

  async function handleSendEmailFromList(call) {
    setEmailRowId(call.id);
    setCallActionMessage('');

    try {
      const draftRes = await fetch(apiUrl('/agent-actions/email-draft'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          callId: call.id
        })
      });

      const draftJson = await draftRes.json();

      if (!draftRes.ok) {
        throw new Error(draftJson?.message || draftJson?.error || 'Unable to build email draft');
      }

      const subject = window.prompt(
        'Email subject (edit before send)',
        String(draftJson?.data?.subject || '').trim()
      );

      if (subject === null) {
        setCallActionMessage('Email send cancelled.');
        return;
      }

      const body = window.prompt(
        'Email draft body (edit before send)',
        String(draftJson?.data?.body || '').trim()
      );

      if (body === null) {
        setCallActionMessage('Email send cancelled.');
        return;
      }

      const res = await fetch(apiUrl('/agent-actions/email-send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          callId: call.id,
          subject: subject.trim(),
          body: body.trim()
        })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Unable to send follow-up email');
      }

      setCallActionMessage('Email follow-up sent.');
      await reloadDashboardData();
    } catch (err) {
      setCallActionMessage(err.message || 'Unable to send follow-up email');
    } finally {
      setEmailRowId('');
    }
  }

  async function handleSuggestNext(call) {
    setAssistantLoadingRowId(call.id);
    setCallActionMessage('');

    try {
      const res = await fetch(apiUrl(`/calls/${call.id}/ai-assistant`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          objective: 'Recommend what to do next and what information to collect.'
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Unable to generate AI next step');
      }

      setAssistantByCallId((prev) => ({
        ...prev,
        [call.id]: json.data
      }));
      setCallActionMessage('AI next-step guidance generated.');
    } catch (err) {
      setCallActionMessage(err.message || 'Unable to generate AI next step');
    } finally {
      setAssistantLoadingRowId('');
    }
  }

  async function handleGenerateAssistantFromTab(event) {
    event.preventDefault();
    if (!selectedAiCallId) return;

    setAiPanelLoading(true);
    setAiPanelError('');

    try {
      const res = await fetch(apiUrl(`/calls/${selectedAiCallId}/ai-assistant`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        },
        body: JSON.stringify({
          objective: aiObjective.trim(),
          notes: aiNotes.trim()
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Unable to generate AI assistant output');
      }

      setAssistantByCallId((prev) => ({
        ...prev,
        [selectedAiCallId]: json.data
      }));
    } catch (err) {
      setAiPanelError(err.message || 'Unable to generate AI assistant output');
    } finally {
      setAiPanelLoading(false);
    }
  }

  async function handleDeleteCall(call) {
    const confirmed = window.confirm('Delete this call record? This cannot be undone.');
    if (!confirmed) return;

    setDeletingRowId(call.id);
    setCallActionMessage('');

    try {
      const res = await fetch(apiUrl(`/calls/${call.id}`), {
        method: 'DELETE',
        headers: {
          'x-callcrm-role': user?.roleHeaderValue || 'agent'
        }
      });

      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || json?.error || 'Unable to delete call record');
      }

      setCalls((prev) => prev.filter((item) => item.id !== call.id));
      setCallActionMessage('Call record deleted.');
      setAssistantByCallId((prev) => {
        const next = { ...prev };
        delete next[call.id];
        return next;
      });
    } catch (err) {
      setCallActionMessage(err.message || 'Unable to delete call record');
    } finally {
      setDeletingRowId('');
    }
  }

  const stats = useMemo(() => {
    const missed = calls.filter((c) => c.outcome === 'MISSED').length;
    const totalDuration = calls.reduce(
      (acc, call) => acc + (call.durationSeconds || 0),
      0
    );

    return {
      totalCalls: calls.length,
      missed,
      contacts: contacts.length,
      avgDuration: calls.length ? Math.round(totalDuration / calls.length) : 0
    };
  }, [calls, contacts]);

  const filteredCalls = useMemo(() => {
    if (callListView === 'incoming') {
      return calls.filter((call) => call.direction === 'INBOUND');
    }

    if (callListView === 'outgoing') {
      return calls.filter((call) => call.direction === 'OUTBOUND');
    }

    return calls;
  }, [calls, callListView]);

  const agentActionStats = useMemo(() => {
    return agentActions.reduce(
      (acc, item) => {
        const status = String(item?.status || '').toUpperCase();
        if (status === 'PENDING') acc.pending += 1;
        if (status === 'APPROVED') acc.approved += 1;
        if (status === 'EXECUTED') acc.executed += 1;
        if (status === 'FAILED') acc.failed += 1;
        return acc;
      },
      { pending: 0, approved: 0, executed: 0, failed: 0 }
    );
  }, [agentActions]);

  const selectedAiCall = useMemo(
    () => calls.find((call) => call.id === selectedAiCallId) || null,
    [calls, selectedAiCallId]
  );

  const selectedAiResult = selectedAiCallId ? assistantByCallId[selectedAiCallId] : null;

  if (!user) {
    return (
      <main className="page page-auth">
        <section className="auth-card">
          <p className="eyebrow">Splendid Technology</p>
          <h1>CallCRM Login</h1>
          <p className="subtitle">Sign in with your username or email.</p>

          <form className="settings-form" onSubmit={handleLogin}>
            <label className="field">
              <span>Username or Email</span>
              <input
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <div className="actions-row">
              <button type="submit" disabled={isLoggingIn || !identifier.trim() || !password}>
                {isLoggingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </div>

            {loginError ? <p className="error-text">{loginError}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Splendid Technology</p>
        <h1>CallCRM Operations Console</h1>
        <div className="hero-meta">
          <span className="subtitle compact">Signed in as {user.username} ({user.role})</span>
          <button type="button" className="button-link" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="tabbar">
        <button
          className={activeTab === 'dashboard' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={activeTab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        <button
          className={activeTab === 'dialer' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('dialer')}
        >
          Dialer
        </button>
        <button
          className={activeTab === 'assistant' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('assistant')}
        >
          AI Assistant
        </button>
      </div>

      {activeTab === 'settings' ? <SettingsPanel role={user.roleHeaderValue} /> : null}
      {activeTab === 'dialer' ? <DialerPanel role={user.roleHeaderValue} /> : null}
      {activeTab === 'assistant' ? (
        <section className="panel">
          <h2>AI Assistant</h2>
          <p className="subtitle compact">
            Pick a call and generate next-step guidance, information to collect, and a suggested message.
          </p>

          <form className="settings-form" onSubmit={handleGenerateAssistantFromTab}>
            <label className="field">
              <span>Call</span>
              <select
                value={selectedAiCallId}
                onChange={(e) => setSelectedAiCallId(e.target.value)}
                disabled={!calls.length || aiPanelLoading}
              >
                {calls.map((call) => (
                  <option key={call.id} value={call.id}>
                    {new Date(call.createdAt).toLocaleString()} | {getDisplayNumber(call) || '-'} | {call.outcome || 'UNKNOWN'}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Objective</span>
              <input
                type="text"
                value={aiObjective}
                onChange={(e) => setAiObjective(e.target.value)}
                disabled={aiPanelLoading}
              />
            </label>

            <label className="field">
              <span>Additional notes (optional)</span>
              <textarea
                rows={3}
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                disabled={aiPanelLoading}
              />
            </label>

            <div className="actions-row">
              <button type="submit" disabled={!selectedAiCallId || aiPanelLoading}>
                {aiPanelLoading ? 'Generating...' : 'Generate AI Guidance'}
              </button>
            </div>
          </form>

          {aiPanelError ? <p className="error-text">{aiPanelError}</p> : null}

          {selectedAiCall ? (
            <div className="assistant-result-card">
              <p className="assistant-meta">
                Call: {selectedAiCall.twilioCallSid} | {getDisplayNumber(selectedAiCall) || '-'}
              </p>
              <p><strong>Recommended action:</strong> {selectedAiResult?.recommendedAction || 'Generate to view recommendation.'}</p>
              <p><strong>Suggested message:</strong> {selectedAiResult?.suggestedMessage || '-'}</p>
              <p><strong>Information to collect:</strong></p>
              <ul className="assistant-list">
                {(selectedAiResult?.informationToCollect || []).length > 0
                  ? selectedAiResult.informationToCollect.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)
                  : <li>Generate guidance to see required data points.</li>}
              </ul>
            </div>
          ) : (
            <p className="subtitle">No calls available yet. Receive or place at least one call first.</p>
          )}
        </section>
      ) : null}

      {activeTab === 'dashboard' ? (
        <>

      <section className="stats-grid">
        <StatCard label="Total Calls" value={stats.totalCalls} />
        <StatCard label="Missed Calls" value={stats.missed} tone="alert" />
        <StatCard label="Contacts" value={stats.contacts} />
        <StatCard
          label="Average Duration"
          value={formatDuration(stats.avgDuration)}
          tone="calm"
        />
      </section>

      <section className="panel">
        <div className="panel-header-row">
          <h2>Recent Calls</h2>
          <aside className="ai-actions-note" aria-live="polite">
            <p className="ai-actions-title">AI Actions</p>
            <p className="ai-actions-summary">{agentActionStats.pending} pending review</p>
            <p className="ai-actions-meta">
              {agentActionStats.approved} approved | {agentActionStats.executed} executed | {agentActionStats.failed} failed
            </p>
          </aside>
        </div>
        <div className="calls-filter tabbar">
          <button
            type="button"
            className={callListView === 'all' ? 'tab active' : 'tab'}
            onClick={() => setCallListView('all')}
          >
            All ({calls.length})
          </button>
          <button
            type="button"
            className={callListView === 'incoming' ? 'tab active' : 'tab'}
            onClick={() => setCallListView('incoming')}
          >
            Incoming ({calls.filter((call) => call.direction === 'INBOUND').length})
          </button>
          <button
            type="button"
            className={callListView === 'outgoing' ? 'tab active' : 'tab'}
            onClick={() => setCallListView('outgoing')}
          >
            Outgoing ({calls.filter((call) => call.direction === 'OUTBOUND').length})
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Number</th>
                <th>From</th>
                <th>To</th>
                <th>IVR</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>AI Next</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map((call) => (
                <tr key={call.id}>
                  <td>{new Date(call.createdAt).toLocaleString()}</td>
                  <td>{getDisplayNumber(call) || '-'}</td>
                  <td>{call.fromNumber}</td>
                  <td>{call.toNumber || '-'}</td>
                  <td>{call.ivrSelection || '-'}</td>
                  <td>{call.status}</td>
                  <td>{call.outcome || '-'}</td>
                  <td>{formatDuration(call.durationSeconds)}</td>
                  <td>
                    {call.recordingUrl ? (
                      <div className="recording-cell">
                        <audio controls preload="none" src={getPlayableRecordingUrl(call.recordingUrl)}>
                          Your browser does not support audio playback.
                        </audio>
                        <a href={getPlayableRecordingUrl(call.recordingUrl)} target="_blank" rel="noreferrer">
                          open
                        </a>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {assistantByCallId[call.id] ? (
                      <div className="ai-cell">
                        <p>{assistantByCallId[call.id].recommendedAction}</p>
                        <p>
                          Collect: {(assistantByCallId[call.id].informationToCollect || []).length} items
                        </p>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="table-action"
                        disabled={
                          callingRowId === call.id ||
                          deletingRowId === call.id ||
                          smsRowId === call.id ||
                          emailRowId === call.id ||
                          assistantLoadingRowId === call.id ||
                          !getCallbackNumber(call)
                        }
                        onClick={() => handleCallFromList(call)}
                      >
                        {callingRowId === call.id ? 'Calling...' : 'Call back'}
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        disabled={
                          smsRowId === call.id ||
                          deletingRowId === call.id ||
                          callingRowId === call.id ||
                          emailRowId === call.id ||
                          assistantLoadingRowId === call.id ||
                          !getCallbackNumber(call)
                        }
                        onClick={() => handleSendSmsFromList(call)}
                      >
                        {smsRowId === call.id ? 'Sending...' : 'Send SMS'}
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        disabled={
                          emailRowId === call.id ||
                          smsRowId === call.id ||
                          deletingRowId === call.id ||
                          callingRowId === call.id ||
                          assistantLoadingRowId === call.id
                        }
                        onClick={() => handleSendEmailFromList(call)}
                      >
                        {emailRowId === call.id ? 'Sending...' : 'Send Email'}
                      </button>
                      <button
                        type="button"
                        className="table-action"
                        disabled={
                          assistantLoadingRowId === call.id ||
                          deletingRowId === call.id ||
                          callingRowId === call.id ||
                          smsRowId === call.id ||
                          emailRowId === call.id
                        }
                        onClick={() => handleSuggestNext(call)}
                      >
                        {assistantLoadingRowId === call.id ? 'Thinking...' : 'AI next'}
                      </button>
                      <button
                        type="button"
                        className="table-action table-action-danger"
                        disabled={
                          deletingRowId === call.id ||
                          callingRowId === call.id ||
                          smsRowId === call.id ||
                          emailRowId === call.id ||
                          assistantLoadingRowId === call.id
                        }
                        onClick={() => handleDeleteCall(call)}
                      >
                        {deletingRowId === call.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={11}>No calls in this view.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {callActionMessage ? <p className="message-text">{callActionMessage}</p> : null}
      </section>

      <section className="panel">
        <h2>Agent Action Tracker</h2>
        <p className="subtitle compact">Track call actions including SMS sends and execution status.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Title</th>
                <th>Status</th>
                <th>Call SID</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {agentActions.map((action) => (
                <tr key={action.id}>
                  <td>{new Date(action.createdAt).toLocaleString()}</td>
                  <td>{action.actionType}</td>
                  <td>{action.title}</td>
                  <td>{action.status}</td>
                  <td>{action.call?.twilioCallSid || '-'}</td>
                  <td>{action.payload?.execution?.sid || action.lastError || '-'}</td>
                </tr>
              ))}
              {agentActions.length === 0 ? (
                <tr>
                  <td colSpan={6}>No agent actions found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Contacts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>{contact.name || '-'}</td>
                  <td>{contact.phone}</td>
                  <td>{contact.email || '-'}</td>
                  <td>{contact.tags?.join(', ') || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : null}
    </main>
  );
}
