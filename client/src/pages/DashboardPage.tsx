import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { comparisonsApi } from '../services/api';

interface TechnologyProgress {
  technologyId: number;
  technologyName: string;
  scoredCount: number;
  totalCriteria: number;
}

interface Comparison {
  id: number;
  clientName: string | null;
  useCaseDescription: string | null;
  comparisonType: 'client' | 'simple';
  status: string;
  technologyNames: string;
  createdAt: string;
  updatedAt: string;
  technologyProgress: TechnologyProgress[];
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
    setComparisons((prev) => prev.filter((comparison) => comparison.id !== id));
  };

  if (loading) return <div className="loading">Loading comparisons...</div>;

  return (
    <div className="container page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1 className="page-title">Technology comparison workspace</h1>
          <p className="page-subtitle">
            Launch detailed client-led assessments or quick side-by-side comparisons with the same scoring engine.
          </p>
        </div>
        <div className="hero-actions wrap">
          <Link to="/new?type=client" className="btn btn-primary">
            + New Comparison (Client)
          </Link>
          <Link to="/new?type=simple" className="btn btn-secondary">
            + Simple Comparison
          </Link>
        </div>
      </section>

      {comparisons.length === 0 ? (
        <div className="empty-state card">
          <h3>No comparisons yet</h3>
          <p>Create your first battlecard to start scoring technologies.</p>
        </div>
      ) : (
        <div className="comparison-list">
          {comparisons.map((comparison) => (
            <article className="comparison-card card" key={comparison.id}>
              <div className="comparison-card-header">
                <div>
                  <div className="comparison-meta-row">
                    <span className="pill pill-muted">
                      {comparison.comparisonType === 'simple' ? 'Simple comparison' : 'Client comparison'}
                    </span>
                    <span className={`pill ${comparison.status === 'completed' ? 'pill-success' : 'pill-outline'}`}>
                      {comparison.status}
                    </span>
                  </div>
                  <h3>{comparison.clientName || 'Untitled simple comparison'}</h3>
                  <p className="muted">
                    {comparison.useCaseDescription?.trim() || 'No use case summary added yet.'}
                  </p>
                </div>
                <div className="comparison-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/comparison/${comparison.id}`)}>
                    Open
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/comparison/${comparison.id}/results`)}>
                    Results
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(comparison.id)}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="comparison-card-body">
                <div>
                  <div className="label">Technologies</div>
                  <p>{comparison.technologyNames || 'No technologies selected yet.'}</p>
                </div>
                <div>
                  <div className="label">Updated</div>
                  <p>{new Date(comparison.updatedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="tech-progress-list">
                {comparison.technologyProgress.map((item) => (
                  <span className="progress-tag" key={item.technologyId}>
                    {item.technologyName}: {item.scoredCount}/{item.totalCriteria}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
