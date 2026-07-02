import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { comparisonsApi } from '../services/api';

interface Comparison {
  id: number;
  clientName: string;
  useCaseDescription: string;
  status: string;
  technologyNames: string;
  createdAt: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    comparisonsApi.list().then(setComparisons).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this comparison?')) return;
    await comparisonsApi.delete(id);
    setComparisons((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) return <div className="loading">Loading comparisons...</div>;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2>My Comparisons</h2>
        <Link to="/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          + New Comparison
        </Link>
      </div>

      {comparisons.length === 0 ? (
        <div className="empty-state">
          <h3>No comparisons yet</h3>
          <p>Create your first technology comparison to get started.</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Use Case</th>
                <th>Technologies</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.clientName}</td>
                  <td>{c.useCaseDescription?.substring(0, 80)}{c.useCaseDescription?.length > 80 ? '...' : ''}</td>
                  <td>{c.technologyNames || '—'}</td>
                  <td>
                    <span className={`tag ${c.status === 'completed' ? 'selected' : ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{new Date(c.updatedAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/comparison/${c.id}`)}>
                      Open
                    </button>{' '}
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/comparison/${c.id}/results`)}>
                      Results
                    </button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
