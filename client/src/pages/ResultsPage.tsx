import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<ResultsData | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([comparisonsApi.getResults(parseInt(id!)), comparisonsApi.get(parseInt(id!))]).then(
      ([res, comp]) => {
        setResults(res);
        setComparison(comp);
        setLoading(false);
      }
    );
  }, [id]);

  if (loading) return <div className="loading">Calculating results...</div>;
  if (!results) return <div className="loading">No results available</div>;

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2>Results: {comparison?.clientName}</h2>
          <p style={{ color: '#605e5c' }}>{comparison?.useCaseDescription}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => navigate(`/comparison/${id}`)}>
            ← Edit Scores
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/')}>
            Dashboard
          </button>
        </div>
      </div>

      {/* Recommendation */}
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <h3 style={{ marginBottom: 8 }}>Recommended Technology</h3>
        <span className="recommendation">🏆 {results.recommendation}</span>
      </div>

      {/* Overall scores */}
      <div className={`grid-${Math.min(results.results.length, 3)}`} style={{ marginTop: 16 }}>
        {results.results.map((tech, idx) => (
          <div className="card" key={tech.technologyId} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#605e5c', marginBottom: 4 }}>
              #{idx + 1}
            </div>
            <h3>{tech.technologyName}</h3>
            <div className={`score-label ${getScoreClass(tech.finalScore)}`}>
              {tech.finalScore.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: '#605e5c' }}>/ 5.00</div>
            <div className="result-bar" style={{ marginTop: 12 }}>
              <div
                className="result-bar-fill"
                style={{
                  width: `${(tech.finalScore / 5) * 100}%`,
                  background: tech.finalScore >= 3.5 ? '#107c10' : tech.finalScore >= 2.5 ? '#ff8c00' : '#d13438',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Detailed breakdown */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Category Breakdown</h3>
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
            {results.results[0]?.categoryResults.map((cat) => (
              <tr key={cat.categoryId}>
                <td style={{ fontWeight: 600 }}>{cat.categoryName}</td>
                <td>{cat.weight}x</td>
                {results.results.map((tech) => {
                  const techCat = tech.categoryResults.find((c) => c.categoryId === cat.categoryId);
                  return (
                    <td key={tech.technologyId}>
                      <span className={`score-label ${getScoreClass(techCat?.avgScore || 0)}`} style={{ fontSize: 16 }}>
                        {techCat?.avgScore.toFixed(2) || '—'}
                      </span>
                      <span style={{ fontSize: 11, color: '#605e5c', marginLeft: 4 }}>
                        ({techCat?.scoredCriteria}/{techCat?.totalCriteria})
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #0078d4' }}>
              <td>Final Weighted Score</td>
              <td></td>
              {results.results.map((tech) => (
                <td key={tech.technologyId}>
                  <span className={`score-label ${getScoreClass(tech.finalScore)}`} style={{ fontSize: 18 }}>
                    {tech.finalScore.toFixed(2)}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
