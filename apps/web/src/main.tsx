import React, { FormEvent, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

type Incident = {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'monitoring' | 'resolved';
  owner: string;
  updatedAt: string;
};

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function App() {
  const [items, setItems] = useState<Incident[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    owner: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/incidents`);

      if (!response.ok) {
        throw new Error('Unable to fetch incidents');
      }

      setItems(await response.json());
      setError('');
      setApiConnected(true);
    } catch {
      setError('Could not load incidents. Check the API and database.');
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API}/api/incidents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Unable to create incident');
      setForm({ title: '', description: '', severity: 'medium', owner: '' });
      await load();
    } catch { setError('Could not create incident. Please try again.'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (incident: Incident, status: Incident['status']) => {
    setSaving(true);
    try {
      const response = await fetch(`${API}/api/incidents/${incident.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Unable to update status');
      await load();
    } catch { setError('Could not update incident status. Please try again.'); }
    finally { setSaving(false); }
  };

  const active = items.filter((incident) => incident.status !== 'resolved').length;
  const critical = items.filter(
    (incident) => incident.severity === 'critical' && incident.status !== 'resolved',
  ).length;

  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">OPERATIONS</span>
          <h1>IncidentHub</h1>
          <p>Track operational incidents from report to resolution.</p>
        </div>
        <div className="health" role="status">● {apiConnected ? 'API connected' : 'API unavailable'}</div>
      </header>

      <section className="metrics">
        <article>
          <b>{items.length}</b>
          <span>Total</span>
        </article>
        <article>
          <b>{active}</b>
          <span>Active</span>
        </article>
        <article>
          <b>{critical}</b>
          <span>Critical</span>
        </article>
      </section>

      <div className="grid">
        <section>
          <h2>Incidents</h2>

          {error && <p className="error" role="alert">{error}</p>}
          {loading && <p role="status">Loading incidents…</p>}

          {items.map((incident) => (
            <article className="incident" key={incident.id}>
              <div>
                <span className={`pill ${incident.severity}`}>{incident.severity}</span>
                <span className="status">{incident.status}</span>
                <h3>{incident.title}</h3>
                <p>{incident.description}</p>
                <small>
                  Owner: {incident.owner} · Updated{' '}
                  {new Date(incident.updatedAt).toLocaleString()}
                </small>
              </div>

              <select
                aria-label={`Status for ${incident.title}`}
                disabled={saving}
                value={incident.status}
                onChange={(event) =>
                  void updateStatus(incident, event.target.value as Incident['status'])
                }
              >
                <option>open</option>
                <option>investigating</option>
                <option>monitoring</option>
                <option>resolved</option>
              </select>
            </article>
          ))}
        </section>

        <aside>
          <h2>Report incident</h2>

          <form onSubmit={submit}>
            <label>
              Title
              <input
                required
                maxLength={120}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <label>
              Description
              <textarea
                maxLength={1000}
                required
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>

            <label>
              Severity
              <select
                value={form.severity}
                onChange={(event) =>
                  setForm((current) => ({ ...current, severity: event.target.value }))
                }
              >
                <option>low</option>
                <option>medium</option>
                <option>high</option>
                <option>critical</option>
              </select>
            </label>

            <label>
              Owner
              <input
                maxLength={255}
                required
                value={form.owner}
                onChange={(event) =>
                  setForm((current) => ({ ...current, owner: event.target.value }))
                }
              />
            </label>

            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create incident'}</button>
          </form>
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
