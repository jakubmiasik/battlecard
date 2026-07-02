import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

function getComparisonHeading(comparison: { clientName?: string | null; comparisonType?: string }) {
  return comparison.comparisonType === 'simple' ? comparison.clientName || 'Simple comparison' : comparison.clientName || 'Untitled client comparison';
}

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
    Promise.all([comparisonsApi.get(parseInt(id!, 10)), criteriaApi.list()]).then(([comp, cats]) => {
      setComparison(comp);
      setCategories(cats);
      setActiveCategory(cats[0]?.id || null);

      const scoreMap: Record<string, Score> = {};
      comp.scores?.forEach((score: Score) => {
        scoreMap[`${score.technologyId}-${score.criteriaId}`] = score;
      });
      setScores(scoreMap);

      const weightMap: Record<number, number> = {};
      cats.forEach((category: Category) => {
        weightMap[category.id] = 1;
      });
      comp.categoryWeights?.forEach((weight: Weight) => {
        weightMap[weight.categoryId] = weight.weight;
      });
      setWeights(weightMap);
      setLoading(false);
    });
  }, [id]);

  const setScore = (techId: number, criteriaId: number, score: number) => {
    const key = `${techId}-${criteriaId}`;
    setScores((prev) => ({
      ...prev,
      [key]: { ...prev[key], technologyId: techId, criteriaId, score, justification: prev[key]?.justification || '' },
    }));
  };

  const setJustification = (techId: number, criteriaId: number, justification: string) => {
    const key = `${techId}-${criteriaId}`;
    setScores((prev) => ({
      ...prev,
      [key]: { ...prev[key], technologyId: techId, criteriaId, score: prev[key]?.score || 0, justification },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const allScores = Object.values(scores).filter((score) => score.score);
      const allWeights = Object.entries(weights).map(([categoryId, weight]) => ({
        categoryId: parseInt(categoryId, 10),
        weight,
      }));
      await Promise.all([
        comparisonsApi.saveScores(parseInt(id!, 10), allScores),
        comparisonsApi.saveWeights(parseInt(id!, 10), allWeights),
      ]);
      alert('Saved successfully!');
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const activeCat = categories.find((category) => category.id === activeCategory);

  const categoryProgress = useMemo(() => {
    if (!comparison) return {} as Record<number, { technologyId: number; technologyName: string; scored: number; total: number }[]>;

    const progress: Record<number, { technologyId: number; technologyName: string; scored: number; total: number }[]> = {};
    for (const category of categories) {
      progress[category.id] = comparison.technologies.map((technology: Technology) => ({
        technologyId: technology.id,
        technologyName: technology.name,
        scored: category.criteria.filter((criterion) => scores[`${technology.id}-${criterion.id}`]?.score).length,
        total: category.criteria.length,
      }));
    }
    return progress;
  }, [categories, comparison, scores]);

  if (loading) return <div className="loading">Loading comparison...</div>;
  if (!comparison) return <div className="loading">Comparison not found</div>;

  return (
    <div className="container page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Comparison workspace</span>
          <h1 className="page-title">{getComparisonHeading(comparison)}</h1>
          <p className="page-subtitle">{comparison.useCaseDescription || 'Score each criterion per technology and capture the rationale behind every decision.'}</p>
        </div>
        <div className="hero-actions wrap">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/comparison/${id}/results`)}>
            View results
          </button>
        </div>
      </section>

      <div className="layout comparison-layout">
        <aside className="sidebar">
          <div className="card sidebar-card">
            <div className="sidebar-title">Categories</div>
            <div className="sidebar-menu">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`sidebar-link ${activeCategory === category.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <div className="sidebar-link-title">{category.name}</div>
                  <div className="sidebar-progress-list">
                    {categoryProgress[category.id]?.map((item) => (
                      <span className="mini-progress-pill" key={item.technologyId}>
                        {item.technologyName}: {item.scored}/{item.total}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {activeCategory && (
            <div className="card sidebar-card">
              <div className="label">Category weight</div>
              <input
                type="number"
                className="weight-input weight-input-full"
                min="0"
                max="10"
                step="0.5"
                value={weights[activeCategory] ?? 1}
                onChange={(event) =>
                  setWeights((prev) => ({
                    ...prev,
                    [activeCategory]: parseFloat(event.target.value) || 0,
                  }))
                }
              />
            </div>
          )}
        </aside>

        <main className="main-content">
          {activeCat && (
            <section className="card table-card">
              <div className="section-heading-row">
                <div>
                  <h3>{activeCat.name}</h3>
                  <p className="muted">Use the option pills to score each technology and add brief justification where useful.</p>
                </div>
              </div>

              <div className="comparison-table-scroll">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th style={{ width: '24rem' }}>Criterion</th>
                      {comparison.technologies.map((technology: Technology) => (
                        <th key={technology.id}>{technology.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCat.criteria.map((criterion) => (
                      <tr key={criterion.id}>
                        <td>
                          <div className="criterion-title">{criterion.name}</div>
                          <div className="criterion-definition">{criterion.definition}</div>
                        </td>
                        {comparison.technologies.map((technology: Technology) => {
                          const key = `${technology.id}-${criterion.id}`;
                          const currentScore = scores[key]?.score || 0;
                          return (
                            <td key={technology.id}>
                              <div className="score-option-row">
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <button
                                    key={score}
                                    type="button"
                                    className={`score-option score-${score} ${currentScore === score ? 'selected' : ''}`}
                                    onClick={() => setScore(technology.id, criterion.id, score)}
                                    title={SCORE_LABELS[score]}
                                  >
                                    <span>{score}</span>
                                    <small>{SCORE_LABELS[score]}</small>
                                  </button>
                                ))}
                              </div>
                              <textarea
                                className="justification-input"
                                placeholder="Add short rationale"
                                value={scores[key]?.justification || ''}
                                onChange={(event) => setJustification(technology.id, criterion.id, event.target.value)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
