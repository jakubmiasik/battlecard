import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
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
  winner: { winnerName: string; winnerScore: number } | null;
}

export default function DashboardPage() {
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    variant: 'confirm' | 'info';
  } | null>(null);
  const navigate = useNavigate();

  const loadComparisons = async () => {
    setLoading(true);
    try {
      const data = await comparisonsApi.list();
      setComparisons(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComparisons();
  }, []);

  const handleDelete = async (id: number) => {
    setModal({
      title: 'Delete comparison',
      message: 'Are you sure you want to delete this comparison?',
      variant: 'confirm',
      onConfirm: async () => {
        setModal(null);
        await comparisonsApi.delete(id);
        setComparisons((prev) => prev.filter((comparison) => comparison.id !== id));
      },
    });
  };

  const handleToggleStatus = async (comparison: Comparison) => {
    const newStatus = comparison.status === 'official' ? 'draft' : 'official';
    setModal({
      title: 'Change comparison status',
      message: `Change status to ${newStatus === 'official' ? 'Official' : 'Draft'}?`,
      variant: 'confirm',
      onConfirm: async () => {
        setModal(null);
        await comparisonsApi.update(comparison.id, { status: newStatus });
        await loadComparisons();
      },
    });
  };

  const handleShare = (comparison: Comparison) => {
    const url = `${window.location.origin}/comparison/${comparison.id}/results`;
    navigator.clipboard.writeText(url).then(() => {
      setModal({ title: 'Link Copied', message: 'The results link has been copied to your clipboard. Share it with other users who have access to the app.', variant: 'info' });
    }).catch(() => {
      setModal({ title: 'Share Link', message: url, variant: 'info' });
    });
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
                    <button
                      type="button"
                      className={`pill comparison-status-pill ${comparison.status === 'official' ? 'pill-success' : 'pill-outline'}`}
                      onClick={() => handleToggleStatus(comparison)}
                      title="Click to change status between Draft and Official"
                    >
                      {comparison.status}
                    </button>
                    <button
                      type="button"
                      className="pill pill-outline share-pill"
                      onClick={() => handleShare(comparison)}
                      title="Copy a shareable link to the results page"
                    >
                      📤 Share
                    </button>
                  </div>
                  <h3>{comparison.clientName || 'Untitled simple comparison'}</h3>
                  <p className="muted">
                    {comparison.useCaseDescription?.trim() || 'No use case summary added yet.'}
                  </p>
                  {comparison.winner && (
                    <div className="winner-row" title="Technology with the highest weighted score">
                      <img src="/trophy.png" alt="Winner" className="winner-icon" />
                      <span className="winner-name">{comparison.winner.winnerName}</span>
                      <span className="winner-score">({comparison.winner.winnerScore.toFixed(2)})</span>
                    </div>
                  )}
                </div>
                <div className="comparison-card-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/comparison/${comparison.id}`)}>
                    Open
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/comparison/${comparison.id}/edit`)}>
                    Update
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
                  <span
                    className="progress-tag"
                    key={item.technologyId}
                    title="Criteria scored out of total for this technology"
                  >
                    {item.technologyName}: {item.scoredCount}/{item.totalCriteria}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        open={!!modal}
        title={modal?.title ?? ''}
        message={modal?.message}
        variant={modal?.variant ?? 'info'}
        onConfirm={modal?.onConfirm ?? (() => setModal(null))}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
