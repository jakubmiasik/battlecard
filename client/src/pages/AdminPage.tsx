import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { usersApi, technologiesApi, criteriaApi, referenceAnswersApi } from '../services/api';

interface User {
  id: number;
  email: string;
  displayName: string;
  role: string;
}

interface Technology {
  id: number;
  name: string;
  description: string;
}

interface Category {
  id: number;
  name: string;
  criteria: { id: number; name: string; definition: string }[];
}

interface RefAnswer {
  criteriaId: number;
  score: number;
  justification: string;
  categoryId: number;
  categoryName: string;
  criteriaName: string;
}

const SCORE_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Weak',
  3: 'Acceptable',
  4: 'Strong',
  5: 'Excellent',
};

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'technologies' | 'reference'>('users');

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Technologies state
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [newTechName, setNewTechName] = useState('');
  const [newTechDesc, setNewTechDesc] = useState('');

  // Reference answers state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTech, setSelectedTech] = useState<number | null>(null);
  const [refAnswers, setRefAnswers] = useState<Record<number, { score: number; justification: string }>>({});
  const [refSaving, setRefSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    loadData();
  }, [isAdmin]);

  const loadData = async () => {
    const [techs, cats] = await Promise.all([technologiesApi.list(), criteriaApi.list()]);
    setTechnologies(techs);
    setCategories(cats);
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    const result = await usersApi.list();
    setUsers(result);
    setUsersLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  const handleRoleChange = async (userId: number, role: string) => {
    await usersApi.updateRole(userId, role);
    loadUsers();
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Delete this user?')) return;
    await usersApi.delete(userId);
    loadUsers();
  };

  const handleAddTech = async () => {
    if (!newTechName.trim()) return;
    await technologiesApi.create({ name: newTechName.trim(), description: newTechDesc.trim() });
    setNewTechName('');
    setNewTechDesc('');
    const techs = await technologiesApi.list();
    setTechnologies(techs);
  };

  const handleDeleteTech = async (id: number) => {
    if (!confirm('Delete this technology? This will also delete all reference answers.')) return;
    await technologiesApi.delete(id);
    const techs = await technologiesApi.list();
    setTechnologies(techs);
  };

  const loadRefAnswers = async (techId: number) => {
    setSelectedTech(techId);
    const answers = await referenceAnswersApi.get(techId);
    const answerMap: Record<number, { score: number; justification: string }> = {};
    answers.forEach((a: RefAnswer) => {
      answerMap[a.criteriaId] = { score: a.score, justification: a.justification || '' };
    });
    setRefAnswers(answerMap);
  };

  const handleSaveRefAnswers = async () => {
    if (!selectedTech) return;
    setRefSaving(true);
    try {
      const answers = Object.entries(refAnswers)
        .filter(([, v]) => v.score > 0)
        .map(([criteriaId, v]) => ({
          criteriaId: parseInt(criteriaId),
          score: v.score,
          justification: v.justification,
        }));
      await referenceAnswersApi.save(selectedTech, answers);
      alert('Reference answers saved!');
    } catch {
      alert('Failed to save');
    } finally {
      setRefSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="container">
      <h2 style={{ marginBottom: 20 }}>Admin Panel</h2>

      <div className="tabs">
        <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Users & Roles
        </button>
        <button className={`tab ${activeTab === 'technologies' ? 'active' : ''}`} onClick={() => setActiveTab('technologies')}>
          Technologies
        </button>
        <button className={`tab ${activeTab === 'reference' ? 'active' : ''}`} onClick={() => setActiveTab('reference')}>
          Reference Answers
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card">
          <h3>User Management</h3>
          {usersLoading ? (
            <div className="loading">Loading users...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.displayName}</td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}>
                        <option value="explorer">Explorer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Technologies Tab */}
      {activeTab === 'technologies' && (
        <div className="card">
          <h3>Technology Management</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              placeholder="Technology name"
              value={newTechName}
              onChange={(e) => setNewTechName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              placeholder="Description (optional)"
              value={newTechDesc}
              onChange={(e) => setNewTechDesc(e.target.value)}
              style={{ flex: 2 }}
            />
            <button className="btn btn-primary" onClick={handleAddTech}>
              Add Technology
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {technologies.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>{t.description || '—'}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTech(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reference Answers Tab */}
      {activeTab === 'reference' && (
        <div className="layout">
          <div className="sidebar">
            <div className="card" style={{ padding: 8 }}>
              <div style={{ padding: '8px 16px', fontWeight: 600, fontSize: 14, color: '#605e5c' }}>
                Select Technology
              </div>
              {technologies.map((t) => (
                <button
                  key={t.id}
                  className={selectedTech === t.id ? 'active' : ''}
                  onClick={() => loadRefAnswers(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="main-content">
            {!selectedTech ? (
              <div className="empty-state">
                <h3>Select a technology</h3>
                <p>Choose a technology from the sidebar to fill in reference answers.</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3>
                    Reference Answers: {technologies.find((t) => t.id === selectedTech)?.name}
                  </h3>
                  <button className="btn btn-primary" onClick={handleSaveRefAnswers} disabled={refSaving}>
                    {refSaving ? 'Saving...' : 'Save All'}
                  </button>
                </div>

                {categories.map((cat) => (
                  <div className="card" key={cat.id}>
                    <h4 style={{ marginBottom: 12, color: '#0078d4' }}>{cat.name}</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Criterion</th>
                          <th>Definition</th>
                          <th>Score</th>
                          <th>Justification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.criteria.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td style={{ fontSize: 12, color: '#605e5c' }}>{c.definition}</td>
                            <td>
                              <div className="score-selector">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <span
                                    key={s}
                                    className={`score-badge score-${s} ${refAnswers[c.id]?.score === s ? 'selected' : ''}`}
                                    onClick={() =>
                                      setRefAnswers((prev) => ({
                                        ...prev,
                                        [c.id]: { ...prev[c.id], score: s, justification: prev[c.id]?.justification || '' },
                                      }))
                                    }
                                    title={SCORE_LABELS[s]}
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <textarea
                                className="justification-input"
                                placeholder="Justification..."
                                value={refAnswers[c.id]?.justification || ''}
                                onChange={(e) =>
                                  setRefAnswers((prev) => ({
                                    ...prev,
                                    [c.id]: { ...prev[c.id], score: prev[c.id]?.score || 0, justification: e.target.value },
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
