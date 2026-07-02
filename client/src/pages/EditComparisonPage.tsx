import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Modal from '../components/Modal';
import { comparisonsApi, criteriaApi, technologiesApi } from '../services/api';

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

interface CategoryWeight {
  categoryId: number;
  weight: number;
}

interface ComparisonData {
  id: number;
  clientName: string | null;
  useCaseDescription: string | null;
  comparisonType: 'client' | 'simple';
  technologies: Technology[];
  categoryWeights?: CategoryWeight[];
}

export default function EditComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [clientName, setClientName] = useState('');
  const [useCaseDescription, setUseCaseDescription] = useState('');
  const [technologies, setTechnologies] = useState<Technology[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<number[]>([]);
  const [categoryWeights, setCategoryWeights] = useState<Record<number, number>>({});
  const [newTechName, setNewTechName] = useState('');
  const [newTechDesc, setNewTechDesc] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    variant: 'confirm' | 'info';
  } | null>(null);

  useEffect(() => {
    const comparisonId = parseInt(id!, 10);

    Promise.all([comparisonsApi.get(comparisonId), technologiesApi.list(), criteriaApi.list()]).then(
      ([comparisonData, technologiesData, categoriesData]: [ComparisonData, Technology[], Category[]]) => {
        setComparison(comparisonData);
        setClientName(comparisonData.clientName || '');
        setUseCaseDescription(comparisonData.useCaseDescription || '');
        setTechnologies(technologiesData);
        setCategories(categoriesData);
        setSelectedTechs(comparisonData.technologies.map((technology) => technology.id));

        const nextWeights: Record<number, number> = {};
        categoriesData.forEach((category) => {
          nextWeights[category.id] = 1;
        });
        comparisonData.categoryWeights?.forEach((weight) => {
          nextWeights[weight.categoryId] = weight.weight;
        });
        setCategoryWeights(nextWeights);
        setLoading(false);
      }
    );
  }, [id]);

  const selectedTechObjects = useMemo(
    () => technologies.filter((technology) => selectedTechs.includes(technology.id)),
    [technologies, selectedTechs]
  );

  const toggleTech = (technologyId: number) => {
    setSelectedTechs((prev) => (prev.includes(technologyId) ? prev.filter((id) => id !== technologyId) : [...prev, technologyId]));
  };

  const addNewTech = async () => {
    if (!newTechName.trim()) return;

    const result = await technologiesApi.create({
      name: newTechName.trim(),
      description: newTechDesc.trim() || undefined,
    });

    if (!result.alreadyExists) {
      setTechnologies((prev) => [...prev, result]);
    }

    setSelectedTechs((prev) => (prev.includes(result.id) ? prev : [...prev, result.id]));
    setNewTechName('');
    setNewTechDesc('');
  };

  const handleSave = async () => {
    if (!comparison || selectedTechs.length < 2) return;
    if (comparison.comparisonType === 'client' && !clientName.trim()) return;

    setSaving(true);
    try {
      const comparisonId = parseInt(id!, 10);
      const weights = Object.entries(categoryWeights).map(([categoryId, weight]) => ({
        categoryId: parseInt(categoryId, 10),
        weight,
      }));

      // Run sequentially to avoid race conditions
      await comparisonsApi.update(comparisonId, {
        clientName: comparison.comparisonType === 'simple' ? undefined : clientName.trim() || null,
        useCaseDescription: useCaseDescription.trim() || undefined,
      });
      await comparisonsApi.updateTechnologies(comparisonId, selectedTechs);
      await comparisonsApi.saveWeights(comparisonId, weights);

      navigate('/');
    } catch (error) {
      setModal({
        title: 'Unable to save changes',
        message: error instanceof Error ? error.message : 'Failed to update comparison.',
        variant: 'info',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading comparison...</div>;
  if (!comparison) return <div className="loading">Comparison not found</div>;

  return (
    <div className="container page-stack">
      <section className="page-header-block">
        <div>
          <span className="eyebrow">Update comparison</span>
          <h1 className="page-title">{comparison.clientName || (comparison.comparisonType === 'simple' ? 'Simple comparison' : 'Untitled client comparison')}</h1>
          <p className="page-subtitle">Adjust the client context, selected technologies, and category weights before returning to scoring.</p>
        </div>
      </section>

      <div className="tabs">
        <button className={`tab ${step === 1 ? 'active' : ''}`} onClick={() => setStep(1)}>
          Client context
        </button>
        <button className={`tab ${step === 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
          Technologies
        </button>
        <button className={`tab ${step === 3 ? 'active' : ''}`} onClick={() => setStep(3)}>
          Category weights
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || selectedTechs.length < 2 || (comparison.comparisonType === 'client' && !clientName.trim())}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {step === 1 && (
        <section className="card form-card">
          <h3>Client context</h3>
          <div className="form-group">
            <label>Client name {comparison.comparisonType === 'client' ? '*' : ''}</label>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="e.g. Contoso Retail" />
          </div>
          <div className="form-group">
            <label>Use case description</label>
            <textarea
              value={useCaseDescription}
              onChange={(event) => setUseCaseDescription(event.target.value)}
              placeholder="Describe goals, constraints, user groups, and delivery expectations."
            />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card form-card">
          <div className="section-heading-row">
            <div>
              <h3>Technologies</h3>
              <p className="muted">Pick at least two technologies. Add a new one if needed.</p>
            </div>
            <span className="pill pill-outline">{selectedTechs.length} selected</span>
          </div>

          <div className="option-grid">
            {technologies.map((technology) => {
              const selected = selectedTechs.includes(technology.id);

              return (
                <button
                  key={technology.id}
                  type="button"
                  className={`option-card ${selected ? 'selected' : ''}`}
                  onClick={() => toggleTech(technology.id)}
                  title={technology.description}
                >
                  <span className="option-title">{technology.name}</span>
                  <span className="option-description">{technology.description || 'No description provided yet.'}</span>
                  <span className="pill pill-outline">{selected ? 'Selected' : 'Add'}</span>
                </button>
              );
            })}
          </div>

          {selectedTechObjects.length > 0 && (
            <div>
              <div className="label">Current selection</div>
              <div className="tag-row">
                {selectedTechObjects.map((technology) => (
                  <span className="tag selected" key={technology.id}>
                    {technology.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="subtle-panel">
            <h4>Add new technology</h4>
            <div className="inline-form responsive-inline">
              <input placeholder="Technology name" value={newTechName} onChange={(event) => setNewTechName(event.target.value)} />
              <input placeholder="Short description" value={newTechDesc} onChange={(event) => setNewTechDesc(event.target.value)} />
              <button className="btn btn-secondary" onClick={addNewTech}>
                Add technology
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card form-card">
          <div className="section-heading-row">
            <div>
              <h3>Category weights</h3>
              <p className="muted">Update how strongly each category influences the final result.</p>
            </div>
          </div>

          <div className="weight-grid">
            {categories.map((category) => (
              <div className="weight-card" key={category.id}>
                <div>
                  <strong>{category.name}</strong>
                  <p className="muted">{category.criteria.length} criteria</p>
                </div>
                <input
                  type="number"
                  className="weight-input"
                  min="0"
                  max="10"
                  step="0.5"
                  value={categoryWeights[category.id] ?? 1}
                  onChange={(event) =>
                    setCategoryWeights((prev) => ({
                      ...prev,
                      [category.id]: parseFloat(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </section>
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
