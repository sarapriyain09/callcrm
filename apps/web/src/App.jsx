import { useEffect, useMemo, useState } from 'react';
import StatCard from './components/StatCard.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import DialerPanel from './components/DialerPanel.jsx';

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function App() {
  const [calls, setCalls] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    async function loadData() {
      const [callsRes, contactsRes] = await Promise.all([
        fetch('/api/calls'),
        fetch('/api/contacts')
      ]);

      const callsJson = await callsRes.json();
      const contactsJson = await contactsRes.json();

      setCalls(callsJson.data || []);
      setContacts(contactsJson.data || []);
    }

    loadData().catch((err) => {
      console.error('Failed to load dashboard data', err);
    });
  }, []);

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

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Splendid Technology</p>
        <h1>CallCRM Operations Console</h1>
        <p className="subtitle">
          Twilio-powered call handling with CRM visibility for UK SMEs.
        </p>
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
      </div>

      {activeTab === 'settings' ? <SettingsPanel /> : null}
      {activeTab === 'dialer' ? <DialerPanel /> : null}

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
        <h2>Recent Calls</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>From</th>
                <th>IVR</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Recording</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td>{new Date(call.createdAt).toLocaleString()}</td>
                  <td>{call.fromNumber}</td>
                  <td>{call.ivrSelection || '-'}</td>
                  <td>{call.status}</td>
                  <td>{call.outcome || '-'}</td>
                  <td>{formatDuration(call.durationSeconds)}</td>
                  <td>
                    {call.recordingUrl ? (
                      <a href={call.recordingUrl} target="_blank" rel="noreferrer">
                        open
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
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
