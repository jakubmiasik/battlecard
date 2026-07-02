import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { criteriaApi, questionsApi, referenceAnswersApi, technologiesApi, usersApi } from '../services/api';

interface User {
  id: number;
  email: string;
  displayName: string;
  role: string;
  status: 'active' | 'blocked';
  entraObjectId?: string | null;
}

interface Technology {
  id: number;
  name: string;
  description: string;
}

interface Criterion {
  id: number;
  categoryId: number;
  name: string;
  definition: string;
  sortOrder?: number;
}

interface Category {
  id: number;
  name: string;
  sortOrder?: number;
  criteria: Criterion[];
}

interface RefAnswer {
  criteriaId: number;
  score: number;
  justification: string;
}

interface DefaultWeight {
  categoryId: number;
  categoryName: string;
  weight: number;
}

interface InviteFormState {
  email: string;
  displayName: string;
  role: 'admin' | 'explorer';
}

interface NewCriterionDraft {
  tempId: string;
  name: string;
  definition: string;
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
  const [activeTab, setActiveTab] = useState<'users' | 'technologies' | 'reference' | 'questions'>('users');

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    email: '',
    displayName: '',
    role: 'explorer',
  });

  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [newTechName, setNewTechName] = useState('');
  const [newTechDesc, setNewTechDesc] = useState('');
  const [editingTech, setEditingTech] = useState<Record<number, { name: string; description: string }>>({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [defaultWeights, setDefaultWeights] = useState<Record<number, number>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCriteriaDrafts, setNewCriteriaDrafts] = useState<Record<number, NewCriterionDraft[]>>({});
  const [editingCategories, setEditingCategories] = useState<Record<number, string>>({});
  const [editingCriteria, setEditingCriteria] = useState<Record<number, { name: string; definition: string }>>({});
  const [weightsSaving, setWeightsSaving] = useState(false);

  const [selectedTech, setSelectedTech] = useState<number | null>(null);
  const [refAnswers, setRefAnswers] = useState<Record<number, { score: number; justification: string }>>({});
  const [refSaving, setRefSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }

    loadBaseData();
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab]);

  const loadBaseData = async () => {
    const [techs, questionCategories, weights]: [Technology[], Category[], DefaultWeight[]] = await Promise.all([
      technologiesApi.list(),
      questionsApi.list(),
      criteriaApi.getDefaultWeights(),
    ]);

    setTechnologies(techs);
    setEditingTech(
      Object.fromEntries(
        techs.map((technology) => [
          technology.id,
          {
            name: technology.name,
            description: technology.description || '',
          },
        ])
      )
    );
    setCategories(questionCategories);
    setDefaultWeights(Object.fromEntries(weights.map((item) => [item.categoryId, item.weight])));
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    const result = await usersApi.list();
    setUsers(result);
    setUsersLoading(false);
  };

  const loadRefAnswers = async (technologyId: number) => {
    setSelectedTech(technologyId);
    const answers = await referenceAnswersApi.get(technologyId);
    const map: Record<number, { score: number; justification: string }> = {};
    answers.forEach((answer: RefAnswer) => {
      map[answer.criteriaId] = { score: answer.score, justification: answer.justification || '' };
    });
    setRefAnswers(map);
  };

  const handleRoleChange = async (userId: number, role: string) => {
    await usersApi.updateRole(userId, role);
    loadUsers();
  };

  const handleStatusChange = async (userId: number, status: User['status']) => {
    await usersApi.updateStatus(userId, status);
    loadUsers();
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Delete this user?')) return;
    await usersApi.delete(userId);
    loadUsers();
  };

  const handleInviteUser = async () => {
    if (!inviteForm.email.trim() || !inviteForm.displayName.trim()) return;

    setInviteSaving(true);
    try {
      await usersApi.invite({
        email: inviteForm.email.trim(),
        displayName: inviteForm.displayName.trim(),
        role: inviteForm.role,
      });
      setInviteForm({ email: '', displayName: '', role: 'explorer' });
      await loadUsers();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to invite user');
    } finally {
      setInviteSaving(false);
    }
  };

  const handleAddTech = async () => {
    if (!newTechName.trim()) return;
    await technologiesApi.create({ name: newTechName.trim(), description: newTechDesc.trim() || undefined });
    setNewTechName('');
    setNewTechDesc('');
    loadBaseData();
  };

  const handleDeleteTech = async (technologyId: number) => {
    if (!confirm('Delete this technology? This also removes reference answers.')) return;
    await technologiesApi.delete(technologyId);
    if (selectedTech === technologyId) {
      setSelectedTech(null);
      setRefAnswers({});
    }
    loadBaseData();
  };

  const handleSaveTech = async (technologyId: number) => {
    const draft = editingTech[technologyId];
    if (!draft?.name.trim()) return;
    await technologiesApi.update(technologyId, {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
    });
    await loadBaseData();
  };

  const handleSaveRefAnswers = async () => {
    if (!selectedTech) return;
    setRefSaving(true);
    try {
      const answers = Object.entries(refAnswers)
        .filter(([, value]) => value.score > 0)
        .map(([criteriaId, value]) => ({
          criteriaId: parseInt(criteriaId, 10),
          score: value.score,
          justification: value.justification,
        }));
      await referenceAnswersApi.save(selectedTech, answers);
      alert('Reference answers saved!');
    } catch {
      alert('Failed to save reference answers');
    } finally {
      setRefSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    await questionsApi.createCategory({ name: newCategoryName.trim() });
    setNewCategoryName('');
    loadBaseData();
  };

  const handleSaveCategory = async (category: Category) => {
    const nextName = editingCategories[category.id]?.trim() || category.name;
    await questionsApi.updateCategory(category.id, { name: nextName });
    setEditingCategories((prev) => ({ ...prev, [category.id]: nextName }));
    loadBaseData();
  };

  const handleDeleteCategory = async (categoryId: number) => {
    if (!confirm('Delete this category and all its criteria?')) return;
    await questionsApi.deleteCategory(categoryId);
    loadBaseData();
  };

  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= categories.length) return;

    const current = categories[index];
    const target = categories[swapIndex];
    await Promise.all([
      questionsApi.updateCategory(current.id, { sortOrder: target.sortOrder ?? swapIndex }),
      questionsApi.updateCategory(target.id, { sortOrder: current.sortOrder ?? index }),
    ]);
    loadBaseData();
  };

  const handleAddCriterionDraft = (categoryId: number) => {
    const tempId = `new-${categoryId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNewCriteriaDrafts((prev) => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] || []), { tempId, name: '', definition: '' }],
    }));
  };

  const handleUpdateCriterionDraft = (categoryId: number, tempId: string, field: 'name' | 'definition', value: string) => {
    setNewCriteriaDrafts((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] || []).map((draft) => (draft.tempId === tempId ? { ...draft, [field]: value } : draft)),
    }));
  };

  const handleDiscardCriterionDraft = (categoryId: number, tempId: string) => {
    setNewCriteriaDrafts((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] || []).filter((draft) => draft.tempId !== tempId),
    }));
  };

  const handleAddCriterion = async (categoryId: number, draft: NewCriterionDraft) => {
    if (!draft.name.trim()) return;
    await questionsApi.createCriterion({
      categoryId,
      name: draft.name.trim(),
      definition: draft.definition.trim(),
    });
    setNewCriteriaDrafts((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] || []).filter((item) => item.tempId !== draft.tempId),
    }));
    loadBaseData();
  };

  const handleSaveCriterion = async (criterion: Criterion) => {
    const draft = editingCriteria[criterion.id];
    await questionsApi.updateCriterion(criterion.id, {
      name: draft?.name?.trim() || criterion.name,
      definition: draft?.definition?.trim() || criterion.definition,
    });
    loadBaseData();
  };

  const handleDeleteCriterion = async (criterionId: number) => {
    if (!confirm('Delete this criterion?')) return;
    await questionsApi.deleteCriterion(criterionId);
    loadBaseData();
  };

  const handleMoveCriterion = async (category: Category, index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= category.criteria.length) return;

    const current = category.criteria[index];
    const target = category.criteria[swapIndex];
    await Promise.all([
      questionsApi.updateCriterion(current.id, { sortOrder: target.sortOrder ?? swapIndex }),
      questionsApi.updateCriterion(target.id, { sortOrder: current.sortOrder ?? index }),
    ]);
    loadBaseData();
  };

  const handleSaveDefaultWeights = async () => {
    setWeightsSaving(true);
    try {
      await criteriaApi.updateDefaultWeights(
        categories.map((category) => ({ categoryId: category.id, weight: defaultWeights[category.id] ?? 1 }))
      );
      alert('Default weights saved!');
      loadBaseData();
    } catch {
      alert('Failed to save default weights');
    } finally {
      setWeightsSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="container page-stack">
      <section className="page-header-block">
        <div>
          <span className="eyebrow">Admin panel</span>
          <h1 className="page-title">Manage the battlecard framework</h1>
          <p className="page-subtitle">Control users, technologies, reusable reference answers, question structure, and default weights.</p>
        </div>
      </section>

      <div className="tabs">
        <button className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Users
        </button>
        <button className={`tab ${activeTab === 'technologies' ? 'active' : ''}`} onClick={() => setActiveTab('technologies')}>
          Technologies
        </button>
        <button className={`tab ${activeTab === 'reference' ? 'active' : ''}`} onClick={() => setActiveTab('reference')}>
          Reference answers
        </button>
        <button className={`tab ${activeTab === 'questions' ? 'active' : ''}`} onClick={() => setActiveTab('questions')}>
          Questions
        </button>
      </div>

      {activeTab === 'users' && (
        <div className="status-select-stack">
          <section className="card form-card">
            <div className="section-heading-row">
              <div>
                <h3>Invite user</h3>
                <p className="muted">Grant access before a person signs in for the first time.</p>
              </div>
            </div>
            <div className="inline-form responsive-inline">
              <input
                type="email"
                placeholder="Email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                placeholder="Display name"
                value={inviteForm.displayName}
                onChange={(event) => setInviteForm((prev) => ({ ...prev, displayName: event.target.value }))}
              />
              <select value={inviteForm.role} onChange={(event) => setInviteForm((prev) => ({ ...prev, role: event.target.value as InviteFormState['role'] }))}>
                <option value="explorer">Explorer</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn btn-primary" onClick={handleInviteUser} disabled={inviteSaving}>
                {inviteSaving ? 'Inviting...' : 'Invite'}
              </button>
            </div>
          </section>

          <section className="card table-card">
            <h3>User management</h3>
            {usersLoading ? (
              <div className="loading">Loading users...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isPending = !user.entraObjectId;

                    return (
                      <tr key={user.id}>
                        <td>{user.displayName}</td>
                        <td>{user.email}</td>
                        <td>
                          <div className="page-stack">
                            <select value={user.status || 'active'} onChange={(event) => handleStatusChange(user.id, event.target.value as User['status'])}>
                              <option value="active">Active</option>
                              <option value="blocked">Blocked</option>
                            </select>
                            {isPending && <span className="muted small-text">Invite pending</span>}
                          </div>
                        </td>
                        <td>
                          <select value={user.role} onChange={(event) => handleRoleChange(user.id, event.target.value)}>
                            <option value="explorer">Explorer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(user.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {activeTab === 'technologies' && (
        <section className="card form-card">
          <h3>Technology management</h3>
          <div className="inline-form responsive-inline">
            <input placeholder="Technology name" value={newTechName} onChange={(event) => setNewTechName(event.target.value)} />
            <input placeholder="Description" value={newTechDesc} onChange={(event) => setNewTechDesc(event.target.value)} />
            <button className="btn btn-primary" onClick={handleAddTech}>
              Add technology
            </button>
          </div>

          <div className="admin-list">
            {technologies.map((technology) => (
              <div className="admin-list-item" key={technology.id}>
                <div className="technology-edit-fields">
                  <input
                    placeholder="Technology name"
                    value={editingTech[technology.id]?.name ?? technology.name}
                    onChange={(event) =>
                      setEditingTech((prev) => ({
                        ...prev,
                        [technology.id]: {
                          name: event.target.value,
                          description: prev[technology.id]?.description ?? technology.description ?? '',
                        },
                      }))
                    }
                  />
                  <textarea
                    placeholder="Description"
                    value={editingTech[technology.id]?.description ?? technology.description ?? ''}
                    onChange={(event) =>
                      setEditingTech((prev) => ({
                        ...prev,
                        [technology.id]: {
                          name: prev[technology.id]?.name ?? technology.name,
                          description: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="icon-button-row">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleSaveTech(technology.id)}>
                    Save
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTech(technology.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'reference' && (
        <div className="layout comparison-layout">
          <aside className="sidebar">
            <div className="card sidebar-card">
              <div className="sidebar-title">Technologies</div>
              <div className="sidebar-menu">
                {technologies.map((technology) => (
                  <button
                    key={technology.id}
                    className={`sidebar-link ${selectedTech === technology.id ? 'active' : ''}`}
                    onClick={() => loadRefAnswers(technology.id)}
                  >
                    <div className="sidebar-link-title">{technology.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="main-content">
            {!selectedTech ? (
              <div className="empty-state card">
                <h3>Select a technology</h3>
                <p>Choose a technology to review or update its reusable reference answers.</p>
              </div>
            ) : (
              <section className="page-stack">
                <div className="section-heading-row card compact-card ref-answers-header">
                  <div>
                    <h3>Reference answers: {technologies.find((item) => item.id === selectedTech)?.name}</h3>
                    <p className="muted">These answers seed new comparisons for the selected technology.</p>
                  </div>
                  <button className="btn btn-primary" onClick={handleSaveRefAnswers} disabled={refSaving}>
                    {refSaving ? 'Saving...' : 'Save all'}
                  </button>
                </div>

                {categories.map((category) => (
                  <section className="card table-card" key={category.id}>
                    <h4>{category.name}</h4>
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
                        {category.criteria.map((criterion) => (
                          <tr key={criterion.id}>
                            <td>
                              <strong>{criterion.name}</strong>
                            </td>
                            <td className="muted">{criterion.definition}</td>
                            <td>
                              <div className="score-option-row compact">
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <button
                                    key={score}
                                    type="button"
                                    className={`score-option score-${score} ${refAnswers[criterion.id]?.score === score ? 'selected' : ''}`}
                                    onClick={() =>
                                      setRefAnswers((prev) => ({
                                        ...prev,
                                        [criterion.id]: {
                                          score,
                                          justification: prev[criterion.id]?.justification || '',
                                        },
                                      }))
                                    }
                                    title={SCORE_LABELS[score]}
                                  >
                                    <span>{score}</span>
                                    <small>{SCORE_LABELS[score]}</small>
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td>
                              <textarea
                                className="justification-input"
                                placeholder="Add rationale"
                                value={refAnswers[criterion.id]?.justification || ''}
                                onChange={(event) =>
                                  setRefAnswers((prev) => ({
                                    ...prev,
                                    [criterion.id]: {
                                      score: prev[criterion.id]?.score || 0,
                                      justification: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </section>
            )}
          </main>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="page-stack">
          <section className="card form-card question-framework-top">
            <div className="section-heading-row">
              <div>
                <h3>Question framework</h3>
                <p className="muted">Add, edit, remove, and reorder categories and criteria.</p>
              </div>
            </div>
            <div className="inline-form responsive-inline">
              <input placeholder="New category name" value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
              <button className="btn btn-secondary" onClick={handleAddCategory}>
                Add category
              </button>
            </div>
          </section>

          <section className="card form-card">
            <div className="section-heading-row">
              <div>
                <h3>Default category weights</h3>
                <p className="muted">These values pre-populate every new comparison.</p>
              </div>
              <button className="btn btn-primary" onClick={handleSaveDefaultWeights} disabled={weightsSaving}>
                {weightsSaving ? 'Saving...' : 'Save weights'}
              </button>
            </div>
            <div className="weight-grid">
              {categories.map((category) => (
                <div className="weight-card" key={category.id}>
                  <div>
                    <strong>{category.name}</strong>
                    <p className="muted">Default weight</p>
                  </div>
                  <input
                    type="number"
                    className="weight-input"
                    min="0"
                    max="10"
                    step="0.5"
                    value={defaultWeights[category.id] ?? 1}
                    onChange={(event) =>
                      setDefaultWeights((prev) => ({
                        ...prev,
                        [category.id]: parseFloat(event.target.value) || 0,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <div className="question-groups">
            {categories.map((category, categoryIndex) => (
              <section className="card table-card" key={category.id}>
                <div className="question-group-header">
                  <div className="question-category-heading">
                    <label className="label">Category:</label>
                    <input
                      value={editingCategories[category.id] ?? category.name}
                      onChange={(event) => setEditingCategories((prev) => ({ ...prev, [category.id]: event.target.value }))}
                    />
                  </div>
                  <div className="icon-button-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleSaveCategory(category)}>
                      Save
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleMoveCategory(categoryIndex, -1)}>
                      ↑
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleMoveCategory(categoryIndex, 1)}>
                      ↓
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCategory(category.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="question-group-toolbar">
                  <span className="toolbar-category-label">{category.name}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleAddCriterionDraft(category.id)}>
                    + Add Criterion
                  </button>
                </div>

                <div className="comparison-table-scroll">
                  <table className="question-framework-table">
                    <thead>
                      <tr>
                        <th>Criterion</th>
                        <th>Definition</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(newCriteriaDrafts[category.id] || []).map((draft) => (
                        <tr key={draft.tempId}>
                          <td>
                            <input
                              placeholder="Criterion name"
                              value={draft.name}
                              onChange={(event) => handleUpdateCriterionDraft(category.id, draft.tempId, 'name', event.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              placeholder="Definition"
                              value={draft.definition}
                              onChange={(event) => handleUpdateCriterionDraft(category.id, draft.tempId, 'definition', event.target.value)}
                            />
                          </td>
                          <td>
                            <div className="question-actions-cell">
                              <button className="btn btn-secondary btn-sm" onClick={() => handleAddCriterion(category.id, draft)}>
                                Save
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDiscardCriterionDraft(category.id, draft.tempId)}>
                                Delete
                              </button>
                              <button className="btn btn-ghost btn-sm" disabled>
                                ↑
                              </button>
                              <button className="btn btn-ghost btn-sm" disabled>
                                ↓
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {category.criteria.map((criterion, criterionIndex) => (
                        <tr key={criterion.id}>
                          <td>
                            <input
                              value={editingCriteria[criterion.id]?.name ?? criterion.name}
                              onChange={(event) =>
                                setEditingCriteria((prev) => ({
                                  ...prev,
                                  [criterion.id]: {
                                    name: event.target.value,
                                    definition: prev[criterion.id]?.definition ?? criterion.definition,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              value={editingCriteria[criterion.id]?.definition ?? criterion.definition}
                              onChange={(event) =>
                                setEditingCriteria((prev) => ({
                                  ...prev,
                                  [criterion.id]: {
                                    name: prev[criterion.id]?.name ?? criterion.name,
                                    definition: event.target.value,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <div className="question-actions-cell">
                              <button className="btn btn-secondary btn-sm" onClick={() => handleSaveCriterion(criterion)}>
                                Save
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCriterion(criterion.id)}>
                                Delete
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleMoveCriterion(category, criterionIndex, -1)}>
                                ↑
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => handleMoveCriterion(category, criterionIndex, 1)}>
                                ↓
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {category.criteria.length === 0 && (newCriteriaDrafts[category.id] || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="muted">
                            No criteria yet. Use &quot;+ Add Criterion&quot; to create the first one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
