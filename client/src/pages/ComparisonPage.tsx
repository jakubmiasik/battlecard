import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Modal from '../components/Modal';
import { comparisonsApi, criteriaApi, referenceAnswersApi } from '../services/api';

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
  categoryId?: number;
  criteriaName?: string;
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

function getScoreClass(score: number): string {
  if (score >= 4.5) return 'excellent';
  if (score >= 3.5) return 'strong';
  if (score >= 2.5) return 'acceptable';
  if (score >= 1.5) return 'weak';
  return 'poor';
}

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
  const [restoring, setRestoring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    variant: 'confirm' | 'info';
  } | null>(null);

  useEffect(() => {
    Promise.all([comparisonsApi.get(parseInt(id!, 10)), criteriaApi.list()]).then(([comp, cats]) => {
      setComparison(comp);
      setCategories(cats);
      setActiveCategory(null);

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
      setModal({ title: 'Success', message: 'Saved successfully!', variant: 'info' });
    } catch {
      setModal({ title: 'Save failed', message: 'Failed to save.', variant: 'info' });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = () => {
    setModal({
      title: 'Restore Reference Answers',
      message: 'This will replace all current scores and justifications with the predefined reference answers for each technology. Unsaved changes will be lost. Continue?',
      variant: 'confirm',
      onConfirm: async () => {
        setModal(null);
        setRestoring(true);
        try {
          const techs: Technology[] = comparison.technologies;
          const refs = await Promise.all(techs.map((t) => referenceAnswersApi.get(t.id)));

          const newScores: Record<string, Score> = {};
          refs.forEach((refAnswers: any[]) => {
            refAnswers.forEach((ra: any) => {
              const key = `${ra.technologyId}-${ra.criteriaId}`;
              newScores[key] = {
                technologyId: ra.technologyId,
                criteriaId: ra.criteriaId,
                score: ra.score || 0,
                justification: ra.justification || '',
              };
            });
          });
          setScores(newScores);
          setModal({ title: 'Restored', message: 'All answers have been restored from reference data. Remember to save your changes.', variant: 'info' });
        } catch {
          setModal({ title: 'Restore failed', message: 'Failed to load reference answers.', variant: 'info' });
        } finally {
          setRestoring(false);
        }
      },
    });
  };

  const activeCat = categories.find((category) => category.id === activeCategory);
  const visibleCategories = activeCategory === null ? categories : activeCat ? [activeCat] : [];

  const categoryProgress = useMemo(() => {
    if (!comparison) {
      return {} as Record<number, { technologyId: number; technologyName: string; scored: number; total: number; avgScore: number | null }[]>;
    }

    const progress: Record<number, { technologyId: number; technologyName: string; scored: number; total: number; avgScore: number | null }[]> = {};
    for (const category of categories) {
      progress[category.id] = comparison.technologies.map((technology: Technology) => ({
        technologyId: technology.id,
        technologyName: technology.name,
        scored: category.criteria.filter((criterion) => scores[`${technology.id}-${criterion.id}`]?.score).length,
        total: category.criteria.length,
        avgScore: (() => {
          const scoredValues = category.criteria
            .map((criterion) => scores[`${technology.id}-${criterion.id}`]?.score || 0)
            .filter((value) => value > 0);

          if (scoredValues.length === 0) return null;
          return scoredValues.reduce((sum, value) => sum + value, 0) / scoredValues.length;
        })(),
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} title="Persist all scores and weights to the database">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button className="btn btn-secondary" onClick={handleRestore} disabled={restoring} title="Replace all scores with predefined reference answers for each technology">
            {restoring ? 'Restoring...' : 'Restore from Reference'}
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/comparison/${id}/results`)} title="Calculate and display the final weighted recommendation">
            View results
          </button>
        </div>
      </section>

      <div className="layout comparison-layout">
        <aside className="sidebar">
          <div className="card sidebar-card">
            <div className="sidebar-title">Categories</div>
            <div className="sidebar-menu">
              <button className={`sidebar-link ${activeCategory === null ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>
                <div className="sidebar-link-title">All categories</div>
                <div className="muted small-text">Show every category in a single stacked view.</div>
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`sidebar-link ${activeCategory === category.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <div className="sidebar-link-title">{category.name}</div>
                  <div className="sidebar-progress-list">
                    {categoryProgress[category.id]?.map((item) => (
                      <div className="sidebar-tech-progress" key={item.technologyId}>
                        <span className="mini-progress-pill" title="Number of criteria scored out of total for this technology">
                          {item.technologyName}: {item.scored}/{item.total}
                        </span>
                        {item.avgScore !== null && (
                          <span className={`mini-progress-pill score-inline sidebar-score-inline ${getScoreClass(item.avgScore)}`}>
                            {item.technologyName} avg. {item.avgScore.toFixed(2)}
                          </span>
                        )}
                      </div>
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
                title="Adjust how much this category influences the final weighted score"
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

        <main className="main-content page-stack">
          {visibleCategories.map((category) => (
            <section className="card table-card" key={category.id}>
              <div className="section-heading-row">
                <div>
                  <h3>{category.name}</h3>
                  <p className="muted">Use the option pills to score each technology and add brief justification where useful.</p>
                </div>
              </div>

              <div className="comparison-table-scroll">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20rem' }}>Criterion</th>
                      {comparison.technologies.map((technology: Technology) => (
                        <th key={technology.id}>{technology.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {category.criteria.map((criterion) => (
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
                                    title={`${SCORE_LABELS[score]} — Rate this criterion for the selected technology`}
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
          ))}
        </main>
      </div>
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
