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
  const [form, setForm] = useState({
    title: '',
    description: '',
    severity: 'medium',
    owner: '',
  });

  const load = async () => {
    try {
      const response = await fetch(`${API}/api/incidents`);

      if (!response.ok) {
        throw new Error('Unable to fetch incidents');
      }

      setItems(await response.json());
      setError('');
    } catch {
      setError('Could not load incidents. Is the NestJS API running?');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const response = await fetch(`${API}/api/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form),
    });

    if (response.ok) {
      setForm({
        title: '',
        description: '',
        severity: 'medium',
        owner: '',
      });
      await load();
      return;
    }

    setError('Check the incident details and try again.');
  };

  const updateStatus = async (incident: Incident, status: Incident['status']) => {
    await fetch(`${API}/api/incidents/${incident.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    await load();
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
        <div className="health">● API connected</div>
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

          {error && <p className="error">{error}</p>}

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
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <label>
              Description
              <textarea
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
                required
                value={form.owner}
                onChange={(event) =>
                  setForm((current) => ({ ...current, owner: event.target.value }))
                }
              />
            </label>

            <button type="submit">Create incident</button>
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
