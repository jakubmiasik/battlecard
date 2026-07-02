import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { comparisonsApi, criteriaApi } from '../services/api';

interface Category {
  id: number;
  name: string;
  criteria: { id: number; name: string; definition: string }[];
}

interface Technology {
  id: number;
  name: string;
}

interface Score {
  technologyId: number;
  criteriaId: number;
  score: number;
  justification: string;
}

interface Weight {
  categoryId: number;
  weight: number;
}

const SCORE_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Weak',
  3: 'Acceptable',
  4: 'Strong',
  5: 'Excellent',
};

export default function ComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [comparison, setComparison] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([comparisonsApi.get(parseInt(id!)), criteriaApi.list()]).then(([comp, cats]) => {
      setComparison(comp);
      setCategories(cats);
      setActiveCategory(cats[0]?.id || null);

      // Load existing scores into lookup
      const scoreMap: Record<string, Score> = {};
      comp.scores?.forEach((s: Score) => {
        scoreMap[`${s.technologyId}-${s.criteriaId}`] = s;
      });
      setScores(scoreMap);

      // Load weights
      const weightMap: Record<number, number> = {};
      cats.forEach((c: Category) => (weightMap[c.id] = 1.0));
      comp.categoryWeights?.forEach((w: Weight & { categoryId: number }) => {
        weightMap[w.categoryId] = w.weight;
      });
      setWeights(weightMap);

      setLoading(false);
    });
  }, [id]);

  const setScore = (techId: number, criteriaId: number, score: number) => {
    const key = `${techId}-${criteriaId}`;
    setScores((prev) => ({
      ...prev,
      [key]: { ...prev[key], technologyId: techId, criteriaId, score },
    }));
  };

  const setJustification = (techId: number, criteriaId: number, justification: string) => {
    const key = `${techId}-${criteriaId}`;
    setScores((prev) => ({
      ...prev,
      [key]: { ...prev[key], technologyId: techId, criteriaId, justification },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const allScores = Object.values(scores).filter((s) => s.score);
      const allWeights = Object.entries(weights).map(([categoryId, weight]) => ({
        categoryId: parseInt(categoryId),
        weight,
      }));
      await Promise.all([
        comparisonsApi.saveScores(parseInt(id!), allScores),
        comparisonsApi.saveWeights(parseInt(id!), allWeights),
      ]);
      alert('Saved successfully!');
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading comparison...</div>;
  if (!comparison) return <div className="loading">Comparison not found</div>;

  const activeCat = categories.find((c) => c.id === activeCategory);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2>{comparison.clientName}</h2>
          <p style={{ color: '#605e5c' }}>{comparison.useCaseDescription}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn btn-outline" onClick={() => navigate(`/comparison/${id}/results`)}>
            View Results →
          </button>
        </div>
      </div>

      <div className="layout">
        {/* Category sidebar */}
        <div className="sidebar">
          <div className="card" style={{ padding: 8 }}>
            {categories.map((cat) => {
              const catCriteria = cat.criteria;
              const scored = catCriteria.filter((c) =>
                comparison.technologies.some((t: Technology) => scores[`${t.id}-${c.id}`]?.score)
              ).length;
              const total = catCriteria.length * comparison.technologies.length;

              return (
                <button
                  key={cat.id}
                  className={activeCategory === cat.id ? 'active' : ''}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.name}
                  <span style={{ float: 'right', opacity: 0.7, fontSize: 12 }}>
                    {scored}/{total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Weight for active category */}
          {activeCategory && (
            <div className="card" style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Category Weight</label>
              <input
                type="number"
                className="weight-input"
                min="0"
                max="10"
                step="0.5"
                value={weights[activeCategory] || 1}
                onChange={(e) =>
                  setWeights((prev) => ({ ...prev, [activeCategory!]: parseFloat(e.target.value) || 0 }))
                }
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
          )}
        </div>

        {/* Scoring area */}
        <div className="main-content">
          {activeCat && (
            <div className="card">
              <h3>{activeCat.name}</h3>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '25%' }}>Criterion</th>
                    {comparison.technologies.map((t: Technology) => (
                      <th key={t.id}>{t.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCat.criteria.map((criterion) => (
                    <tr key={criterion.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{criterion.name}</div>
                        <div style={{ fontSize: 12, color: '#605e5c' }}>{criterion.definition}</div>
                      </td>
                      {comparison.technologies.map((tech: Technology) => {
                        const key = `${tech.id}-${criterion.id}`;
                        const currentScore = scores[key]?.score || 0;
                        return (
                          <td key={tech.id}>
                            <div className="score-selector">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <span
                                  key={s}
                                  className={`score-badge score-${s} ${currentScore === s ? 'selected' : ''}`}
                                  onClick={() => setScore(tech.id, criterion.id, s)}
                                  title={SCORE_LABELS[s]}
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                            <textarea
                              className="justification-input"
                              placeholder="Justification..."
                              value={scores[key]?.justification || ''}
                              onChange={(e) => setJustification(tech.id, criterion.id, e.target.value)}
                              style={{ marginTop: 4 }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
