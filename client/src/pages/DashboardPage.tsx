import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { comparisonsApi, usersApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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
  createdByName?: string;
  sharedByName?: string;
  technologyProgress: TechnologyProgress[];
  winner: { winnerName: string; winnerScore: number } | null;
}

interface AppUserBasic {
  id: number;
  displayName: string;
  email: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [sharedComparisons, setSharedComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    variant: 'confirm' | 'info';
  } | null>(null);
  const [shareModal, setShareModal] = useState<{ comparisonId: number; comparisonName: string } | null>(null);
  const [allUsers, setAllUsers] = useState<AppUserBasic[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [sharing, setSharing] = useState(false);
  const navigate = useNavigate();

  const loadComparisons = async () => {
    setLoading(true);
    try {
      const [own, shared] = await Promise.all([
        comparisonsApi.list(),
        comparisonsApi.listShared(),
      ]);
      setComparisons(own);
      setSharedComparisons(shared);
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

  const openShareModal = async (comparison: Comparison) => {
    try {
      const users = await usersApi.list();
      setAllUsers(users.filter((u: AppUserBasic) => u.id !== user?.id));
      setSelectedUserIds([]);
      setUserSearch('');
      setShareModal({ comparisonId: comparison.id, comparisonName: comparison.clientName || 'Untitled' });
    } catch {
      setModal({ title: 'Error', message: 'Failed to load users.', variant: 'info' });
    }
  };

  const handleShareSubmit = async () => {
    if (!shareModal || selectedUserIds.length === 0) return;
    setSharing(true);
    try {
      await comparisonsApi.share(shareModal.comparisonId, selectedUserIds);
      setShareModal(null);
      setModal({ title: 'Shared', message: `Comparison shared with ${selectedUserIds.length} user(s).`, variant: 'info' });
    } catch {
      setModal({ title: 'Error', message: 'Failed to share comparison.', variant: 'info' });
    } finally {
      setSharing(false);
    }
  };

  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  if (loading) return <div className="loading">Loading comparisons...</div>;

  const renderComparisonCard = (comparison: Comparison, isShared: boolean) => (
    <article className="comparison-card card" key={comparison.id}>
      <div className="comparison-card-header">
        <div>
          <div className="comparison-meta-row">
            <span className="pill pill-muted">
              {comparison.comparisonType === 'simple' ? 'Simple comparison' : 'Client comparison'}
            </span>
            {isShared ? (
              <span className={`pill ${comparison.status === 'official' ? 'pill-success' : 'pill-outline'}`}>
                {comparison.status}
              </span>
            ) : (
              <button
                type="button"
                className={`pill comparison-status-pill ${comparison.status === 'official' ? 'pill-success' : 'pill-outline'}`}
                onClick={() => handleToggleStatus(comparison)}
                title="Click to change status between Draft and Official"
              >
                {comparison.status}
              </button>
            )}
            {!isShared && (
              <button
                type="button"
                className="pill pill-outline share-pill"
                onClick={() => openShareModal(comparison)}
                title="Share this comparison with other users"
              >
                📤 Share
              </button>
            )}
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
          {!isShared && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/comparison/${comparison.id}/edit`)}>
              Update
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/comparison/${comparison.id}/results`)}>
            Results
          </button>
          {!isShared && (
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(comparison.id)}>
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="comparison-card-body">
        <div>
          <div className="label">Technologies</div>
          <p>{comparison.technologyNames || 'No technologies selected yet.'}</p>
        </div>
        <div>
          <div className="label">Updated</div>
          <p>
            {new Date(comparison.updatedAt).toLocaleString()}
            {comparison.createdByName && <span className="muted"> by {comparison.createdByName}</span>}
          </p>
        </div>
        {isShared && comparison.sharedByName && (
          <div>
            <div className="label">Shared by</div>
            <p>{comparison.sharedByName}</p>
          </div>
        )}
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
  );

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

      <section>
        <h2 className="section-title">My Comparisons</h2>
        {comparisons.length === 0 ? (
          <div className="empty-state card">
            <h3>No comparisons yet</h3>
            <p>Create your first battlecard to start scoring technologies.</p>
          </div>
        ) : (
          <div className="comparison-list">
            {comparisons.map((comparison) => renderComparisonCard(comparison, false))}
          </div>
        )}
      </section>

      {sharedComparisons.length > 0 && (
        <section>
          <h2 className="section-title">Shared with Me</h2>
          <div className="comparison-list">
            {sharedComparisons.map((comparison) => renderComparisonCard(comparison, true))}
          </div>
        </section>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="modal-backdrop" onClick={() => setShareModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Share "{shareModal.comparisonName}"</h3>
            <p className="muted">Select users to share this comparison with:</p>
            <input
              type="text"
              className="form-input"
              placeholder="Search users by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              autoFocus
            />
            <div className="share-user-list">
              {allUsers.length === 0 ? (
                <p className="muted">No other users available.</p>
              ) : (
                allUsers
                  .filter((u) => {
                    if (!userSearch.trim()) return true;
                    const q = userSearch.toLowerCase();
                    return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                  })
                  .map((u) => (
                    <label key={u.id} className="share-user-item">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                      />
                      <span>
                        <strong>{u.displayName}</strong>
                        <small className="muted"> ({u.email})</small>
                      </span>
                    </label>
                  ))
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShareModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleShareSubmit}
                disabled={selectedUserIds.length === 0 || sharing}
              >
                {sharing ? 'Sharing...' : `Share with ${selectedUserIds.length} user(s)`}
              </button>
            </div>
          </div>
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
