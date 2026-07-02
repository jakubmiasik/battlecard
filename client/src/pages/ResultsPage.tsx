import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { comparisonsApi } from '../services/api';

interface CategoryResult {
  categoryId: number;
  categoryName: string;
  weight: number;
  avgScore: number;
  weightedScore: number;
  scoredCriteria: number;
  totalCriteria: number;
}

interface TechResult {
  technologyId: number;
  technologyName: string;
  finalScore: number;
  categoryResults: CategoryResult[];
}

interface ResultsData {
  recommendation: string;
  results: TechResult[];
}

function getScoreClass(score: number): string {
  if (score >= 4.5) return 'excellent';
  if (score >= 3.5) return 'strong';
  if (score >= 2.5) return 'acceptable';
  if (score >= 1.5) return 'weak';
  return 'poor';
}

function getHeading(comparison: { clientName?: string | null; comparisonType?: string } | null) {
  if (!comparison) return 'Results';
  if (comparison.comparisonType === 'simple') return comparison.clientName || 'Simple comparison results';
  return comparison.clientName || 'Client comparison results';
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<ResultsData | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([comparisonsApi.getResults(parseInt(id!, 10)), comparisonsApi.get(parseInt(id!, 10))]).then(
      ([resultData, comparisonData]) => {
        setResults(resultData);
        setComparison(comparisonData);
        setLoading(false);
      }
    );
  }, [id]);

  const winner = useMemo(() => results?.results[0] ?? null, [results]);

  if (loading) return <div className="loading">Calculating results...</div>;
  if (!results) return <div className="loading">No results available</div>;

  return (
    <div className="container page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow">Results</span>
          <h1 className="page-title">{getHeading(comparison)}</h1>
          <p className="page-subtitle">{comparison?.useCaseDescription || 'Review the weighted outcome across every category and identify the best-fit platform.'}</p>
        </div>
        <div className="hero-actions wrap">
          <button className="btn btn-secondary" onClick={() => navigate(`/comparison/${id}`)}>
            Back to scoring
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            Dashboard
          </button>
        </div>
      </section>

      <section className="winner-card card">
        <div>
          <span className="eyebrow">Recommended technology</span>
          <h2>{results.recommendation}</h2>
          <p className="muted">Highest weighted score across the configured categories and technology answers.</p>
        </div>
        {winner && (
          <div className="winner-score-block">
            <div className={`score-label ${getScoreClass(winner.finalScore)}`}>{winner.finalScore.toFixed(2)}</div>
            <span className="pill pill-success">Top ranked</span>
          </div>
        )}
      </section>

      <div className="results-grid">
        {results.results.map((tech, index) => (
          <article className="card result-summary-card" key={tech.technologyId}>
            <span className="pill pill-outline">#{index + 1}</span>
            <h3>{tech.technologyName}</h3>
            <div className={`score-label ${getScoreClass(tech.finalScore)}`}>{tech.finalScore.toFixed(2)}</div>
            <div className="result-bar">
              <div className={`result-bar-fill ${getScoreClass(tech.finalScore)}`} style={{ width: `${(tech.finalScore / 5) * 100}%` }} />
            </div>
          </article>
        ))}
      </div>

      <section className="card table-card">
        <div className="section-heading-row">
          <div>
            <h3>Category breakdown</h3>
            <p className="muted">Average score per category, weighted according to this comparison.</p>
          </div>
        </div>

        <div className="comparison-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Weight</th>
                {results.results.map((tech) => (
                  <th key={tech.technologyId}>{tech.technologyName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.results[0]?.categoryResults.map((category) => (
                <tr key={category.categoryId}>
                  <td>
                    <strong>{category.categoryName}</strong>
                  </td>
                  <td>{category.weight}x</td>
                  {results.results.map((tech) => {
                    const techCategory = tech.categoryResults.find((item) => item.categoryId === category.categoryId);
                    return (
                      <td key={tech.technologyId}>
                        <div className={`score-inline ${getScoreClass(techCategory?.avgScore || 0)}`}>
                          {(techCategory?.avgScore || 0).toFixed(2)}
                        </div>
                        <span className="muted small-text">
                          {techCategory?.scoredCriteria || 0}/{techCategory?.totalCriteria || 0} answered
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="summary-row">
                <td>Final weighted score</td>
                <td />
                {results.results.map((tech) => (
                  <td key={tech.technologyId}>
                    <span className={`score-inline ${getScoreClass(tech.finalScore)}`}>{tech.finalScore.toFixed(2)}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
