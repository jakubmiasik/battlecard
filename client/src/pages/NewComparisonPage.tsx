import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { technologiesApi, criteriaApi, comparisonsApi } from '../services/api';

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

export default function NewComparisonPage() {
  const navigate = useNavigate();
  const [clientName, setClientName] = useState('');
  const [useCaseDescription, setUseCaseDescription] = useState('');
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<number[]>([]);
  const [categoryWeights, setCategoryWeights] = useState<Record<number, number>>({});
  const [newTechName, setNewTechName] = useState('');
  const [newTechDesc, setNewTechDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    technologiesApi.list().then(setTechnologies);
    criteriaApi.list().then((cats: Category[]) => {
      setCategories(cats);
      const weights: Record<number, number> = {};
      cats.forEach((c: Category) => (weights[c.id] = 1.0));
      setCategoryWeights(weights);
    });
  }, []);

  const toggleTech = (id: number) => {
    setSelectedTechs((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const addNewTech = async () => {
    if (!newTechName.trim()) return;
    const result = await technologiesApi.create({ name: newTechName.trim(), description: newTechDesc.trim() });
    if (!result.alreadyExists) {
      setTechnologies((prev) => [...prev, result]);
    }
    setSelectedTechs((prev) => [...prev, result.id]);
    setNewTechName('');
    setNewTechDesc('');
  };

  const handleCreate = async () => {
    if (!clientName.trim() || selectedTechs.length < 2) return;
    setSaving(true);
    try {
      const weights = Object.entries(categoryWeights).map(([categoryId, weight]) => ({
        categoryId: parseInt(categoryId),
        weight,
      }));
      const comp = await comparisonsApi.create({
        clientName,
        useCaseDescription,
        technologyIds: selectedTechs,
        categoryWeights: weights,
      });
      navigate(`/comparison/${comp.id}`);
    } catch (err) {
      alert('Failed to create comparison');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <h2 style={{ marginBottom: 24 }}>New Technology Comparison</h2>

      {/* Step indicators */}
      <div className="tabs">
        <button className={`tab ${step === 1 ? 'active' : ''}`} onClick={() => setStep(1)}>
          1. Client & Use Case
        </button>
        <button className={`tab ${step === 2 ? 'active' : ''}`} onClick={() => step > 1 && setStep(2)}>
          2. Select Technologies
        </button>
        <button className={`tab ${step === 3 ? 'active' : ''}`} onClick={() => step > 2 && setStep(3)}>
          3. Category Weights
        </button>
      </div>

      {step === 1 && (
        <div className="card">
          <h3>Client Information</h3>
          <div className="form-group">
            <label>Client Name *</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Enter client name" />
          </div>
          <div className="form-group">
            <label>Use Case Description</label>
            <textarea
              value={useCaseDescription}
              onChange={(e) => setUseCaseDescription(e.target.value)}
              placeholder="Describe the use case, requirements, and context for this technology comparison..."
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setStep(2)}
            disabled={!clientName.trim()}
          >
            Next: Select Technologies →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>Select Technologies to Compare</h3>
          <p style={{ marginBottom: 16, color: '#605e5c' }}>
            Choose at least 2 technologies. If a technology isn't listed, add it below.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {technologies.map((t) => (
              <span
                key={t.id}
                className={`tag ${selectedTechs.includes(t.id) ? 'selected' : ''}`}
                onClick={() => toggleTech(t.id)}
                title={t.description}
              >
                {t.name} {selectedTechs.includes(t.id) ? '✓' : '+'}
              </span>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #edebe9', paddingTop: 16 }}>
            <h4 style={{ marginBottom: 8 }}>Add New Technology</h4>
            <div style={{ display: 'flex', gap: 8 }}>
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
              <button className="btn btn-outline" onClick={addNewTech}>
                Add
              </button>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep(3)}
              disabled={selectedTechs.length < 2}
            >
              Next: Set Weights →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>Category Weights</h3>
          <p style={{ marginBottom: 16, color: '#605e5c' }}>
            Adjust the weight for each category based on the use case importance. Higher weight = more impact on final score.
          </p>

          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Criteria Count</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td style={{ fontWeight: 600 }}>{cat.name}</td>
                  <td>{cat.criteria.length}</td>
                  <td>
                    <input
                      type="number"
                      className="weight-input"
                      min="0"
                      max="10"
                      step="0.5"
                      value={categoryWeights[cat.id] || 1}
                      onChange={(e) =>
                        setCategoryWeights((prev) => ({ ...prev, [cat.id]: parseFloat(e.target.value) || 0 }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Comparison'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
